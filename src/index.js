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
    env.APP_PASSWORD.length >= 20 && env.APP_PASSWORD.length <= 200;
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

      if (url.pathname === "/api/workouts" || url.pathname.startsWith("/api/workouts/")) {
        if (!env.DB) return respond({ error: "database_not_configured" }, 503);
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !sameOriginJSON(request, url)) {
          return respond({ error: "invalid_origin_or_type" }, 403);
        }

        try {
          if (url.pathname === "/api/workouts" && method === "GET") {
            const range = monthRange(url.searchParams.get("month"));
            if (!range) return respond({ error: "invalid_month" }, 400);
            const result = await env.DB.prepare(
              "SELECT id, performed_on, note, created_at FROM workout_sessions WHERE performed_on >= ? AND performed_on < ? ORDER BY performed_on DESC, created_at DESC LIMIT 200"
            ).bind(...range).all();
            return respond({ workouts: result.results ?? [] });
          }

          if (url.pathname === "/api/workouts" && method === "POST") {
            const raw = await request.text();
            if (raw.length > 2048) return respond({ error: "payload_too_large" }, 413);
            let body;
            try { body = JSON.parse(raw); } catch { return respond({ error: "invalid_json" }, 400); }
            if (!body || typeof body !== "object" || Array.isArray(body) || !validDate(body.performed_on)) {
              return respond({ error: "invalid_date" }, 400);
            }
            const note = body.note ?? "";
            if (typeof note !== "string" || note.length > 300) return respond({ error: "invalid_note" }, 400);
            const id = crypto.randomUUID();
            await env.DB.prepare(
              "INSERT INTO workout_sessions (id, performed_on, note) VALUES (?, ?, ?)"
            ).bind(id, body.performed_on, note.trim()).run();
            return respond({ id, performed_on: body.performed_on, note: note.trim() }, 201);
          }

          const match = /^\/api\/workouts\/([0-9a-f-]{36})$/.exec(url.pathname);
          if (match && method === "DELETE") {
            const result = await env.DB.prepare(
              "DELETE FROM workout_sessions WHERE id = ?"
            ).bind(match[1]).run();
            return result.meta?.changes
              ? respond({ deleted: true })
              : respond({ error: "not_found" }, 404);
          }

          return respond({ error: "method_not_allowed" }, 405);
        } catch (e) {
          console.error("Workout database failure", e?.name ?? "error");
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
