// 個人用ログイン。パスワードはCloudflare Secret APP_PASSWORDにのみ保存。
// パスワードも筋トレ記録もGitHub/ブラウザStorageには保存しない。
const encoder = new TextEncoder();
const COOKIE = "kintore_session";
const MAX_AGE = 14 * 24 * 60 * 60; // 14日間有効
const prefix = "/api/";

function respond(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function secretReady(env) {
  return typeof env.APP_PASSWORD === "string" &&
    [...env.APP_PASSWORD].length >= 4 && env.APP_PASSWORD.length <= 200;
}

async function sha256(input) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

async function passwordMatches(input, stored) {
  const [a, b] = await Promise.all([sha256(input), sha256(stored)]);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function signingKey(password) {
  const raw = await crypto.subtle.importKey(
    "raw", encoder.encode(password), "HKDF", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("kintoreapp-cookie-hkdf-v1"),
      info: encoder.encode("session-signing")
    },
    raw, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]
  );
}

function base64url(data) {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=";
    return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

async function newSession(password) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = "v1." + exp;
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(password), encoder.encode(payload)));
  return payload + "." + base64url(hmac);
}

async function isAuthenticated(request, env) {
  if (!secretReady(env)) return false;
  const cookies = (request.headers.get("Cookie") || "").split(";").map(value => value.trim());
  const raw = cookies.find(v => v.startsWith(COOKIE + "="));
  if (!raw) return false;
  const token = raw.slice(COOKIE.length + 1);
  const match = /^(v1\.\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const exp = Number(match[1].slice(3));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(exp) || exp <= now || exp > now + MAX_AGE) return false;
  const sig = decodeBase64url(match[2]);
  if (!sig) return false;
  try {
    return await crypto.subtle.verify("HMAC", await signingKey(env.APP_PASSWORD), sig, encoder.encode(match[1]));
  } catch {
    return false;
  }
}

function sameOriginJSON(request, url) {
  return request.headers.get("Origin") === url.origin &&
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() === "application/json";
}

function sameOrigin(request, url) {
  return request.headers.get("Origin") === url.origin;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function monthRange(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  const next = new Date(Date.UTC(y, m, 1));
  return [
    value + "-01",
    String(next.getUTCFullYear()).padStart(4, "0") + "-" +
      String(next.getUTCMonth() + 1).padStart(2, "0") + "-01"
  ];
}


// 種目IDは設けず、NFKC・全空白除去・英数字小文字化した種目名で照合する。
// UIとAPIはともにこの表記へ統一し、スペース違い等による履歴分断を防ぐ。
function normalizedExerciseName(value) {
  if (typeof value !== "string") return "";
  const name = value.normalize("NFKC").replace(/[\s\u3000]+/g, "").toLowerCase();
  return name.length <= 60 ? name : "";
}
function normalizeExerciseLog(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !validDate(body.performed_on)) return null;
  const exercise_name = normalizedExerciseName(body.exercise_name);
  const note = body.note ?? "";
  const sets = body.sets;
  if (!exercise_name || typeof note !== "string" || note.length > 300 ||
      !Array.isArray(sets) || sets.length < 1 || sets.length > 12) return null;
  const normalized = [];
  for (const [index, set] of sets.entries()) {
    const weight = set?.weight_kg, reps = set?.reps;
    if (typeof weight !== "number" || !Number.isFinite(weight) ||
        weight < 0 || weight > 2000 || !Number.isInteger(reps) ||
        reps < 0 || reps > 1000) return null;
    normalized.push({ exercise_name, set_number: index + 1, weight_kg: weight, reps });
  }
  return { performed_on: body.performed_on, exercise_name, note: note.trim(), sets: normalized };
}

function normalizeWorkout(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !validDate(body.performed_on)) return null;
  const note = body.note ?? "";
  if (typeof note !== "string" || note.length > 300) return null;
  const sets = body.sets ?? [];
  if (!Array.isArray(sets) || sets.length > 48) return null;
  const normalized = [];
  for (const set of sets) {
    if (!set || typeof set !== "object" || Array.isArray(set)) return null;
    const name = typeof set.exercise_name === "string" ? set.exercise_name.trim() : "";
    const weight = set.weight_kg;
    if (!name || name.length > 60 || !Number.isInteger(set.set_number) ||
      set.set_number < 1 || set.set_number > 48 ||
      typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 2000 ||
      !Number.isInteger(set.reps) || set.reps < 0 || set.reps > 1000) return null;
    normalized.push({ exercise_name: name, set_number: set.set_number, weight_kg: weight, reps: set.reps });
  }
  return { performed_on: body.performed_on, note: note.trim(), sets: normalized };
}

async function readJSON(request, maxLength = 12000) {
  const raw = await request.text();
  if (raw.length > maxLength) return { error: "payload_too_large", status: 413 };
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { error: "invalid_json", status: 400 };
  }
}

function insertSet(db, id, set) {
  return db.prepare(
    "INSERT INTO workout_sets (session_id, exercise_name, set_number, weight_kg, reps) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, set.exercise_name, set.set_number, set.weight_kg, set.reps);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    if (url.pathname === "/api/health") {
      if (method !== "GET") return respond({ error: "method_not_allowed" }, 405);
      try {
        if (!env.DB) throw new Error("DB binding not configured");
        await env.DB.prepare("SELECT 1 AS connected").first();
        return respond({ ok: true, database: "connected", login_configured: secretReady(env) });
      } catch {
        return respond({ ok: false, database: "unavailable", login_configured: secretReady(env) }, 503);
      }
    }

    if (url.pathname.startsWith(prefix)) {
      if (!secretReady(env)) {
        return respond({ error: "login_not_configured" }, 503);
      }

      if (url.pathname === "/api/login") {
        if (method !== "POST") return respond({ error: "method_not_allowed" }, 405);
        if (!sameOriginJSON(request, url)) return respond({ error: "invalid_origin" }, 403);
        const raw = await request.text();
        if (raw.length > 1024) return respond({ error: "invalid_credentials" }, 401);
        let body;
        try { body = JSON.parse(raw); } catch { return respond({ error: "invalid_credentials" }, 401); }
        if (typeof body?.password !== "string" ||
          body.password.length > 200 ||
          !(await passwordMatches(body.password, env.APP_PASSWORD))) {
          return respond({ error: "invalid_credentials" }, 401);
        }
        const session = await newSession(env.APP_PASSWORD);
        return respond({ authenticated: true }, 200, {
          "Set-Cookie": COOKIE + "=" + session +
            "; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=" + MAX_AGE
        });
      }

      if (url.pathname === "/api/logout") {
        if (method !== "POST") return respond({ error: "method_not_allowed" }, 405);
        if (!sameOrigin(request, url)) return respond({ error: "invalid_origin" }, 403);
        return respond({ authenticated: false }, 200, {
          "Set-Cookie": COOKIE + "=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0"
        });
      }

      if (!(await isAuthenticated(request, env))) {
        return respond({ error: "authentication_required" }, 401);
      }
      if (url.pathname === "/api/session" && method === "GET") {
        return respond({ authenticated: true });
      }

      if (url.pathname === "/api/calendar" || url.pathname.startsWith("/api/calendar/") ||
          url.pathname === "/api/workouts" || url.pathname.startsWith("/api/workouts/") ||
          url.pathname === "/api/exercises" || url.pathname.startsWith("/api/exercises/")) {
        if (!env.DB) return respond({ error: "database_not_configured" }, 503);
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !sameOriginJSON(request, url)) {
          return respond({ error: "invalid_origin_or_type" }, 403);
        }

        try {
          if (url.pathname === "/api/calendar" && method === "GET") {
            const range = monthRange(url.searchParams.get("month"));
            if (!range) return respond({ error: "invalid_month" }, 400);
            const result = await env.DB.prepare(
              "SELECT on_date, planned, attended FROM gym_calendar_days WHERE on_date >= ? AND on_date < ? ORDER BY on_date"
            ).bind(...range).all();
            return respond({ days: result.results ?? [] });
          }

          const dayMatch = /^\/api\/calendar\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
          if (dayMatch && method === "PUT") {
            if (!validDate(dayMatch[1])) return respond({ error: "invalid_date" }, 400);
            const parsed = await readJSON(request, 256);
            if (parsed.error) return respond({ error: parsed.error }, parsed.status);
            const { planned, attended } = parsed.value ?? {};
            if (typeof planned !== "boolean" || typeof attended !== "boolean") {
              return respond({ error: "invalid_calendar_state" }, 400);
            }
            if (!planned && !attended) {
              await env.DB.prepare("DELETE FROM gym_calendar_days WHERE on_date = ?").bind(dayMatch[1]).run();
            } else {
              await env.DB.prepare(
                "INSERT INTO gym_calendar_days (on_date, planned, attended) VALUES (?, ?, ?) " +
                "ON CONFLICT(on_date) DO UPDATE SET planned = excluded.planned, attended = excluded.attended, updated_at = CURRENT_TIMESTAMP"
              ).bind(dayMatch[1], Number(planned), Number(attended)).run();
            }
            return respond({ on_date: dayMatch[1], planned, attended });
          }

          // 既存記録から種目候補を取得。固定候補と合わせてUIで選択する。
          if (url.pathname === "/api/exercises" && method === "GET") {
            const rows = await env.DB.prepare(
              "SELECT DISTINCT exercise_name FROM workout_sets ORDER BY exercise_name COLLATE NOCASE LIMIT 300"
            ).all();
            const names = [...new Set((rows.results ?? []).map(row =>
              normalizedExerciseName(row.exercise_name)).filter(Boolean))];
            return respond({ exercises: names });
          }

          // 一覧から開いた種目ページは1種目単位で保存する。既存の単一種目セッションが
          // あれば上書きし、複数種目を持つ旧セッションには触れない。
          if (url.pathname === "/api/exercises/log" && method === "PUT") {
            const parsed = await readJSON(request);
            if (parsed.error) return respond({ error: parsed.error }, parsed.status);
            const body = normalizeExerciseLog(parsed.value);
            if (!body) return respond({ error: "invalid_exercise_log" }, 400);
            const existing = await env.DB.prepare(
              "SELECT s.id FROM workout_sessions s WHERE s.performed_on = ? " +
              "AND EXISTS (SELECT 1 FROM workout_sets ws WHERE ws.session_id = s.id AND ws.exercise_name = ?) " +
              "AND NOT EXISTS (SELECT 1 FROM workout_sets other WHERE other.session_id = s.id AND other.exercise_name <> ?) " +
              "ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC LIMIT 1"
            ).bind(body.performed_on, body.exercise_name, body.exercise_name).first();
            const id = existing?.id ?? crypto.randomUUID();
            if (existing) {
              await env.DB.batch([
                env.DB.prepare("UPDATE workout_sessions SET note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
                  .bind(body.note, id),
                env.DB.prepare("DELETE FROM workout_sets WHERE session_id=?").bind(id),
                ...body.sets.map(set => insertSet(env.DB, id, set))
              ]);
            } else {
              await env.DB.batch([
                env.DB.prepare("INSERT INTO workout_sessions(id, performed_on, note) VALUES(?, ?, ?)")
                  .bind(id, body.performed_on, body.note),
                ...body.sets.map(set => insertSet(env.DB, id, set))
              ]);
            }
            return respond({ id, performed_on: body.performed_on, exercise_name: body.exercise_name,
              sets: body.sets.length, updated: !!existing });
          }

          if (url.pathname === "/api/exercises/history" && method === "GET") {
            const name = normalizedExerciseName(url.searchParams.get("name"));
            if (!name) return respond({ error: "invalid_exercise" }, 400);
            const history = await env.DB.prepare(
              "SELECT s.performed_on, ws.set_number, ws.weight_kg, ws.reps " +
              "FROM workout_sets ws JOIN workout_sessions s ON s.id=ws.session_id " +
              "WHERE ws.exercise_name=? ORDER BY s.performed_on DESC, s.created_at DESC, ws.set_number ASC, ws.id ASC LIMIT 1201"
            ).bind(name).all();
            const sets = history.results ?? [];
            return respond({ exercise_name: name, sets: sets.slice(0, 1200), truncated: sets.length > 1200 });
          }

          if (url.pathname === "/api/workouts" && method === "GET") {
            const range = monthRange(url.searchParams.get("month"));
            if (!range) return respond({ error: "invalid_month" }, 400);
            const result = await env.DB.prepare(
              "SELECT id, performed_on, note, created_at FROM workout_sessions WHERE performed_on >= ? AND performed_on < ? ORDER BY performed_on DESC, updated_at DESC, created_at DESC, id DESC LIMIT 200"
            ).bind(...range).all();
            const workouts = (result.results ?? []).map(record => ({ ...record, sets: [] }));
            if (workouts.length) {
              const placeholders = workouts.map(() => "?").join(", ");
              const sets = await env.DB.prepare(
                "SELECT session_id, exercise_name, set_number, weight_kg, reps FROM workout_sets " +
                "WHERE session_id IN (" + placeholders + ") ORDER BY session_id, id"
              ).bind(...workouts.map(record => record.id)).all();
              const bySession = new Map(workouts.map(record => [record.id, record]));
              for (const set of sets.results ?? []) bySession.get(set.session_id)?.sets.push(set);
            }
            return respond({ workouts, truncated: workouts.length === 200 });
          }

          if (url.pathname === "/api/workouts/recent" && method === "GET") {
            const name = url.searchParams.get("name")?.trim() ?? "";
            if (!name || name.length > 60) return respond({ error: "invalid_exercise" }, 400);
            // "前回" は選択した記録日より前の最新実績。未指定なら従来の最新記録を返す。
            const before = url.searchParams.get("before");
            if (before !== null && !validDate(before)) return respond({ error: "invalid_date" }, 400);
            const dateFilter = before ? "AND s2.performed_on < ? " : "";
            const recent = await env.DB.prepare(
              "SELECT ws.weight_kg, ws.reps, ws.set_number, s.performed_on FROM workout_sets ws " +
              "JOIN workout_sessions s ON s.id = ws.session_id WHERE ws.exercise_name = ? " +
              "AND ws.session_id = (SELECT ws2.session_id FROM workout_sets ws2 " +
              "JOIN workout_sessions s2 ON s2.id = ws2.session_id WHERE ws2.exercise_name = ? " +
              dateFilter +
              "ORDER BY s2.performed_on DESC, s2.created_at DESC, ws2.id DESC LIMIT 1) " +
              "ORDER BY ws.set_number, ws.id LIMIT 12"
            ).bind(...(before ? [name, name, before] : [name, name])).all();
            return respond({ sets: recent.results ?? [] });
          }

          if (url.pathname === "/api/workouts" && method === "POST") {
            const parsed = await readJSON(request);
            if (parsed.error) return respond({ error: parsed.error }, parsed.status);
            const body = normalizeWorkout(parsed.value);
            if (!body) return respond({ error: "invalid_workout" }, 400);
            const id = crypto.randomUUID();
            await env.DB.batch([
              env.DB.prepare("INSERT INTO workout_sessions (id, performed_on, note) VALUES (?, ?, ?)")
                .bind(id, body.performed_on, body.note),
              ...body.sets.map(set => insertSet(env.DB, id, set))
            ]);
            return respond({ id, performed_on: body.performed_on, note: body.note }, 201);
          }

          const sessionMatch = /^\/api\/workouts\/([0-9a-f-]{36})$/.exec(url.pathname);
          if (sessionMatch && (method === "PUT" || method === "DELETE")) {
            const id = sessionMatch[1];
            const existing = await env.DB.prepare("SELECT id FROM workout_sessions WHERE id = ?").bind(id).first();
            if (!existing) return respond({ error: "not_found" }, 404);

            if (method === "DELETE") {
              await env.DB.batch([
                env.DB.prepare("DELETE FROM workout_sets WHERE session_id = ?").bind(id),
                env.DB.prepare("DELETE FROM workout_sessions WHERE id = ?").bind(id)
              ]);
              return respond({ deleted: true });
            }
            const parsed = await readJSON(request);
            if (parsed.error) return respond({ error: parsed.error }, parsed.status);
            const body = normalizeWorkout(parsed.value);
            if (!body) return respond({ error: "invalid_workout" }, 400);
            await env.DB.batch([
              env.DB.prepare(
                "UPDATE workout_sessions SET performed_on = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
              ).bind(body.performed_on, body.note, id),
              env.DB.prepare("DELETE FROM workout_sets WHERE session_id = ?").bind(id),
              ...body.sets.map(set => insertSet(env.DB, id, set))
            ]);
            return respond({ id, performed_on: body.performed_on, note: body.note });
          }

          return respond({ error: "method_not_allowed" }, 405);
        } catch (error) {
          console.error("Training database failure", error?.name ?? "error");
          return respond({ error: "database_unavailable_or_migration_required" }, 503);
        }
      }
      return respond({ error: "not_found" }, 404);
    }
    // Static UI is public; all personal data endpoints require the signed cookie.
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("Not found", { status: 404 });
  }
};
