// Cloudflare Accessで検証された本人情報だけを信頼する。
// Accessが未設定・無効な間は、記録APIを必ず拒否する。
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function monthRange(month) {
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  const next = new Date(Date.UTC(y, m, 1));
  return [month + "-01", String(next.getUTCFullYear()).padStart(4, "0") + "-" + String(next.getUTCMonth() + 1).padStart(2, "0") + "-01"];
}

async function accessEmail(ctx) {
  if (!ctx.access) return null;
  try {
    const identity = await ctx.access.getIdentity();
    const email = identity?.email;
    return typeof email === "string" && email.includes("@")
      ? email.toLowerCase().trim()
      : null;
  } catch {
    return null;
  }
}

function validWriteRequest(request, url) {
  // ブラウザのCross-Site Request Forgery対策。Origin不明も拒否する。
  const origin = request.headers.get("Origin");
  return origin === url.origin && request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() === "application/json";
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    if (url.pathname === "/api/health") {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      try {
        if (!env.DB) throw new Error("DB binding missing");
        await env.DB.prepare("SELECT 1 AS connected").first();
        return json({ ok: true, database: "connected" });
      } catch {
        return json({ ok: false, database: "unavailable" }, 503);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      const owner = await accessEmail(ctx);
      if (!owner) return json({ error: "authentication_required" }, 401);

      if (url.pathname === "/api/me" && method === "GET") {
        return json({ authenticated: true, email: owner });
      }

      if (url.pathname === "/api/workouts" || url.pathname.startsWith("/api/workouts/")) {
        if (!env.DB) return json({ error: "database_not_configured" }, 503);
        if ((method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") && !validWriteRequest(request, url)) {
          return json({ error: "invalid_request_origin_or_type" }, 403);
        }

        try {
          if (url.pathname === "/api/workouts" && method === "GET") {
            const range = monthRange(url.searchParams.get("month"));
            if (!range) return json({ error: "invalid_month" }, 400);
            const result = await env.DB.prepare(
              "SELECT id, performed_on, note, created_at FROM workout_sessions WHERE owner_email = ? AND performed_on >= ? AND performed_on < ? ORDER BY performed_on DESC, created_at DESC LIMIT 200"
            ).bind(owner, ...range).all();
            return json({ workouts: result.results ?? [] });
          }

          if (url.pathname === "/api/workouts" && method === "POST") {
            const raw = await request.text();
            if (raw.length > 2048) return json({ error: "payload_too_large" }, 413);
            let payload;
            try { payload = JSON.parse(raw); }
            catch { return json({ error: "invalid_json" }, 400); }
            if (!payload || typeof payload !== "object" || Array.isArray(payload) || !validDay(payload.performed_on)) {
              return json({ error: "invalid_date" }, 400);
            }
            const note = payload.note ?? "";
            if (typeof note !== "string" || note.length > 300) {
              return json({ error: "invalid_note" }, 400);
            }
            const id = crypto.randomUUID();
            await env.DB.prepare(
              "INSERT INTO workout_sessions (id, owner_email, performed_on, note) VALUES (?, ?, ?, ?)"
            ).bind(id, owner, payload.performed_on, note.trim()).run();
            return json({ id, performed_on: payload.performed_on, note: note.trim() }, 201);
          }

          const match = /^\/api\/workouts\/([0-9a-f-]{36})$/.exec(url.pathname);
          if (match && method === "DELETE") {
            const result = await env.DB.prepare(
              "DELETE FROM workout_sessions WHERE id = ? AND owner_email = ?"
            ).bind(match[1], owner).run();
            return result.meta?.changes ? json({ deleted: true }) : json({ error: "not_found" }, 404);
          }
          return json({ error: "method_not_allowed" }, 405);
        } catch (error) {
          console.error("Workout DB error:", String(error));
          return json({ error: "database_unavailable_or_migration_required" }, 503);
        }
      }
      return json({ error: "not_found" }, 404);
    }

    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("Not found", { status: 404 });
  }
};
