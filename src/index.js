import { handleRepeatAPI } from "./workout-repeat.js";
import { handleCalendarAPI } from "./calendar-api.js";
import { handlePlanResetAPI } from "./plan-reset.js";
import { handleTrainingSetupAPI } from "./training-setup.js";
import { handleTrainingModeAPI } from "./training-mode.js";
import { readGymPresence, writeGymPresence } from "./gym-presence.js";
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
const bodyParts = new Set(["胸","背中","肩","腕","脚","腹筋","全身","その他"]);
const exerciseUnits = new Set(["kg_reps","reps","seconds"]);
function normalizeExerciseLog(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !validDate(body.performed_on)) return null;
  const exercise_name = normalizedExerciseName(body.exercise_name);
  const unit = body.unit ?? "kg_reps";
  const note = body.note ?? "";
  const sets = body.sets;
  if (!exercise_name || !exerciseUnits.has(unit) ||
      typeof note !== "string" || note.length > 300 ||
      !Array.isArray(sets) || sets.length < 1 || sets.length > 12) return null;
  const normalized = [];
  for (const [index, set] of sets.entries()) {
    const weight = set?.weight_kg ?? 0;
    const reps = set?.reps ?? 0;
    const duration = set?.duration_seconds ?? 0;
    if (typeof weight !== "number" || !Number.isFinite(weight) ||
        weight < 0 || weight > 2000 || !Number.isInteger(reps) ||
        reps < 0 || reps > 1000 || !Number.isInteger(duration) ||
        duration < 0 || duration > 36000 ||
        (unit === "reps" && weight !== 0) ||
        (unit === "seconds" && (weight !== 0 || reps !== 0 || duration < 1)) ||
        (unit !== "seconds" && duration !== 0)) return null;
    normalized.push({ exercise_name, set_number: index + 1,
      weight_kg: weight, reps, duration_seconds: duration, entry_unit: unit });
  }
  return { performed_on: body.performed_on, exercise_name, note: note.trim(),
    unit, sets: normalized };
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
  const unit = set.entry_unit ?? "kg_reps";
  // 0003適用前も従来の重量×回数は書き込めるようにする。
  if (unit === "kg_reps") {
    return db.prepare(
      "INSERT INTO workout_sets (session_id, exercise_name, set_number, weight_kg, reps) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, set.exercise_name, set.set_number, set.weight_kg, set.reps);
  }
  return db.prepare(
    "INSERT INTO workout_sets (session_id, exercise_name, set_number, weight_kg, reps, entry_unit, duration_seconds) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, set.exercise_name, set.set_number, set.weight_kg, set.reps,
    unit, set.duration_seconds ?? 0);
}
function isMissingCatalog(error) {
  return /no such table:\s*(?:main\.)?exercise_catalog/i.test(String(error?.message ?? error));
}
function isMissingUnitColumns(error) {
  return /no such column:\s*(?:[a-z_]+\.)?(entry_unit|duration_seconds)/i.test(String(error?.message ?? error));
}
async function fetchWorkoutSets(statementNew, statementOld) {
  try { return await statementNew(); }
  catch (error) {
    if (!isMissingUnitColumns(error)) throw error;
    return statementOld();
  }
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

      // External automation uses only a dedicated bearer token, never the login cookie.
      if (url.pathname === "/api/integrations/macrodroid/gym-presence") {
        if (method !== "POST") return respond({ error: "method_not_allowed" }, 405);
        return writeGymPresence(request, env, respond);
      }

      if (!(await isAuthenticated(request, env))) {
        return respond({ error: "authentication_required" }, 401);
      }
      if (url.pathname === "/api/gym-presence") {
        if (method !== "GET") return respond({ error: "method_not_allowed" }, 405);
        return readGymPresence(env.DB, respond);
      }
      if (url.pathname === "/api/session" && method === "GET") {
        return respond({ authenticated: true });
      }

      if (url.pathname === "/api/calendar" || url.pathname.startsWith("/api/calendar/") ||
          url.pathname === "/api/repeat" || url.pathname.startsWith("/api/repeat/") ||
          url.pathname === "/api/training-setup" || url.pathname.startsWith("/api/training-setup/") ||
          url.pathname.startsWith("/api/training-mode/") ||
          url.pathname === "/api/workouts" || url.pathname.startsWith("/api/workouts/") ||
          url.pathname === "/api/exercises" || url.pathname.startsWith("/api/exercises/")) {
        if (!env.DB) return respond({ error: "database_not_configured" }, 503);
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !sameOriginJSON(request, url)) {
          return respond({ error: "invalid_origin_or_type" }, 403);
        }

        try {
          if (url.pathname === "/api/repeat" || url.pathname.startsWith("/api/repeat/")) {
            return handleRepeatAPI(env.DB,url,request,method,{respond,validDate,monthRange,readJSON});
          }
          if (url.pathname.startsWith("/api/training-mode/")) {
            return handleTrainingModeAPI(env.DB,url,request,method,{respond,validDate,readJSON});
          }
          if (url.pathname === "/api/training-setup" || url.pathname.startsWith("/api/training-setup/")) {
            return handleTrainingSetupAPI(env.DB,url,request,method,{respond,validDate,readJSON});
          }
          if (url.pathname === "/api/calendar/reset") {
            return handlePlanResetAPI(env.DB,request,method,{respond,readJSON});
          }
          if (url.pathname === "/api/calendar" || url.pathname.startsWith("/api/calendar/")) {
            return handleCalendarAPI(env.DB, url, request, method, { respond, monthRange, validDate, readJSON });
          }

          // 初期候補・ユーザー登録済み・実施済み種目の統合。
          // 0003未適用時は既存の履歴APIを壊さずcatalog_ready:falseを返す。
          if (url.pathname === "/api/exercises" && method === "GET") {
            const rows = await env.DB.prepare(
              "SELECT DISTINCT exercise_name FROM workout_sets ORDER BY exercise_name COLLATE NOCASE LIMIT 500"
            ).all();
            const recorded = [...new Set((rows.results ?? []).map(row =>
              normalizedExerciseName(row.exercise_name)).filter(Boolean))];
            let catalogRows = [], catalogReady = true;
            try {
              const result = await env.DB.prepare(
                "SELECT exercise_name, body_part, unit FROM exercise_catalog ORDER BY created_at, exercise_name"
              ).all();
              catalogRows = result.results ?? [];
            } catch (error) {
              if (!isMissingCatalog(error)) throw error;
              catalogReady = false;
            }
            const catalog = catalogRows.map(row => ({
              name: row.exercise_name, body_part: row.body_part, unit: row.unit
            }));
            const names = [...new Set([...catalog.map(x => x.name), ...recorded])];
            return respond({ exercises: names, catalog, recorded, catalog_ready: catalogReady });
          }

          if (url.pathname === "/api/exercises/catalog" && method === "PUT") {
            const parsed = await readJSON(request, 1536);
            if (parsed.error) return respond({ error: parsed.error }, parsed.status);
            const input = parsed.value;
            const name = normalizedExerciseName(input?.name);
            const original = normalizedExerciseName(input?.previous_name ?? input?.name);
            const bodyPart = input?.body_part, unit = input?.unit;
            if (!name || !original || !bodyParts.has(bodyPart) || !exerciseUnits.has(unit)) {
              return respond({ error: "invalid_exercise_settings" }, 400);
            }
            if (name === original) {
              await env.DB.prepare(
                "INSERT INTO exercise_catalog(exercise_name,body_part,unit) VALUES(?,?,?) " +
                "ON CONFLICT(exercise_name) DO UPDATE SET body_part=excluded.body_part, " +
                "unit=excluded.unit,updated_at=CURRENT_TIMESTAMP"
              ).bind(name, bodyPart, unit).run();
            } else {
              const [current, target, stored] = await Promise.all([
                env.DB.prepare("SELECT exercise_name FROM exercise_catalog WHERE exercise_name=?").bind(original).first(),
                env.DB.prepare("SELECT exercise_name FROM exercise_catalog WHERE exercise_name=?").bind(name).first(),
                env.DB.prepare("SELECT DISTINCT exercise_name FROM workout_sets").all()
              ]);
              const recordedNames = stored.results ?? [];
              if (!current && !recordedNames.some(row =>
                  normalizedExerciseName(row.exercise_name) === original)) {
                return respond({ error: "not_found" }, 404);
              }
              if (target || recordedNames.some(row => normalizedExerciseName(row.exercise_name) === name)) {
                return respond({ error: "exercise_name_exists" }, 409);
              }
              const aliases = recordedNames
                .filter(row => normalizedExerciseName(row.exercise_name) === original);
              const actions = [
                ...aliases.map(row => env.DB.prepare(
                  "UPDATE workout_sets SET exercise_name=? WHERE exercise_name=?"
                ).bind(name, row.exercise_name))
              ];
              if (current) {
                actions.push(env.DB.prepare(
                  "UPDATE exercise_catalog SET exercise_name=?, body_part=?, unit=?, " +
                  "updated_at=CURRENT_TIMESTAMP WHERE exercise_name=?"
                ).bind(name, bodyPart, unit, original));
              } else {
                actions.push(env.DB.prepare(
                  "INSERT INTO exercise_catalog(exercise_name,body_part,unit) VALUES(?,?,?)"
                ).bind(name, bodyPart, unit));
              }
              await env.DB.batch(actions);
            }
            return respond({ name, body_part: bodyPart, unit, previous_name: original });
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
              unit: body.unit, sets: body.sets.length, updated: !!existing });
          }

          // 選択日の1種目だけを消す。旧形式の複数種目セッションも他種目は維持する。
          if (url.pathname === "/api/exercises/log" && method === "DELETE") {
            const parsed = await readJSON(request, 1024);
            if (parsed.error) return respond({ error: parsed.error }, parsed.status);
            const value = parsed.value;
            const date = value?.performed_on;
            const name = normalizedExerciseName(value?.exercise_name);
            if (!value || typeof value !== "object" || Array.isArray(value) ||
                !validDate(date) || !name) {
              return respond({ error: "invalid_exercise_log" }, 400);
            }
            // 種目名が正規化される前の既存セットも、同じ名前として照合する。
            const records = await env.DB.prepare(
              "SELECT DISTINCT ws.session_id, ws.exercise_name FROM workout_sets ws " +
              "JOIN workout_sessions s ON s.id = ws.session_id WHERE s.performed_on = ?"
            ).bind(date).all();
            const targets = (records.results ?? []).filter(row =>
              normalizedExerciseName(row.exercise_name) === name);
            if (!targets.length) return respond({ error: "not_found" }, 404);
            const sessionIds = [...new Set(targets.map(row => row.session_id))];
            await env.DB.batch([
              ...targets.map(row => env.DB.prepare(
                "DELETE FROM workout_sets WHERE session_id = ? AND exercise_name = ?"
              ).bind(row.session_id, row.exercise_name)),
              ...sessionIds.map(id => env.DB.prepare(
                "DELETE FROM workout_sessions WHERE id = ? " +
                "AND NOT EXISTS (SELECT 1 FROM workout_sets WHERE session_id = ?)"
              ).bind(id, id))
            ]);
            return respond({ deleted: true, performed_on: date, exercise_name: name });
          }

          if (url.pathname === "/api/exercises/history" && method === "GET") {
            const name = normalizedExerciseName(url.searchParams.get("name"));
            if (!name) return respond({ error: "invalid_exercise" }, 400);
            const suffix = "FROM workout_sets ws JOIN workout_sessions s ON s.id=ws.session_id " +
              "WHERE ws.exercise_name=? ORDER BY s.performed_on DESC, s.created_at DESC, " +
              "ws.set_number ASC, ws.id ASC LIMIT 1201";
            const history = await fetchWorkoutSets(
              () => env.DB.prepare("SELECT s.performed_on, ws.set_number, ws.weight_kg, ws.reps, " +
                "ws.entry_unit, ws.duration_seconds " + suffix).bind(name).all(),
              () => env.DB.prepare("SELECT s.performed_on, ws.set_number, ws.weight_kg, ws.reps " +
                suffix).bind(name).all()
            );
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
              const suffix = "FROM workout_sets WHERE session_id IN (" + placeholders +
                ") ORDER BY session_id, id";
              const sets = await fetchWorkoutSets(
                () => env.DB.prepare("SELECT session_id, exercise_name, set_number, weight_kg, reps, " +
                  "entry_unit, duration_seconds " + suffix).bind(...workouts.map(record => record.id)).all(),
                () => env.DB.prepare("SELECT session_id, exercise_name, set_number, weight_kg, reps " +
                  suffix).bind(...workouts.map(record => record.id)).all()
              );
              const bySession = new Map(workouts.map(record => [record.id, record]));
              for (const set of sets.results ?? []) bySession.get(set.session_id)?.sets.push(set);
            }
            return respond({ workouts, truncated: workouts.length === 200 });
          }

          if (url.pathname === "/api/workouts/recent" && method === "GET") {
            const name = normalizedExerciseName(url.searchParams.get("name"));
            if (!name) return respond({ error: "invalid_exercise" }, 400);
            const before = url.searchParams.get("before");
            if (before !== null && !validDate(before)) return respond({ error: "invalid_date" }, 400);
            const dateFilter = before ? "AND s2.performed_on < ? " : "";
            const suffix = "FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id " +
              "WHERE ws.exercise_name = ? AND ws.session_id = " +
              "(SELECT ws2.session_id FROM workout_sets ws2 " +
              "JOIN workout_sessions s2 ON s2.id = ws2.session_id " +
              "WHERE ws2.exercise_name = ? " + dateFilter +
              "ORDER BY s2.performed_on DESC, s2.created_at DESC, ws2.id DESC LIMIT 1) " +
              "ORDER BY ws.set_number, ws.id LIMIT 13";
            const params = before ? [name,name,before] : [name,name];
            const recent = await fetchWorkoutSets(
              () => env.DB.prepare("SELECT ws.weight_kg, ws.reps, ws.set_number, s.performed_on, " +
                "ws.entry_unit, ws.duration_seconds " + suffix).bind(...params).all(),
              () => env.DB.prepare("SELECT ws.weight_kg, ws.reps, ws.set_number, s.performed_on " +
                suffix).bind(...params).all()
            );
            const sets = recent.results ?? [];
            // 旧セッションの13セット目を検出。既存クライアントには12セットまで返す。
            return respond({ sets: sets.slice(0, 12), truncated: sets.length > 12 });
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
