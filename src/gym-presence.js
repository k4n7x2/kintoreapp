// MacroDroid が報告する一時的なWi-Fi在席状態。来館・予定・実績とは独立。
const PRESENCE_TTL_MS = 30 * 60 * 1000;
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();

async function tokenMatches(header, secret) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return false;
  if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(header)) return false;
  const supplied = header.slice(7);
  const digests = await Promise.all([supplied, secret].map(async value =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))));
  let difference = 0;
  for (let i = 0; i < digests[0].length; i++) difference |= digests[0][i] ^ digests[1][i];
  return difference === 0;
}

export function validatePresenceEvent(input, nowMs) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["connected", "event_at_ms"].includes(key)) ||
      typeof input.connected !== "boolean" ||
      !Number.isSafeInteger(input.event_at_ms) ||
      input.event_at_ms < nowMs - MAX_EVENT_AGE_MS ||
      input.event_at_ms > nowMs + MAX_FUTURE_SKEW_MS) {
    return null;
  }
  return { connected: input.connected, eventAtMs: input.event_at_ms };
}

export function resolveGymPresence(row, nowMs) {
  const connected = row?.connected === 1 && row.expires_at_ms > nowMs;
  return {
    connected,
    last_event_ms: row?.last_event_ms ?? null,
    expires_at_ms: connected ? row.expires_at_ms : null,
    server_time_ms: nowMs
  };
}

const READ_SQL = "SELECT connected, last_event_ms, expires_at_ms FROM gym_presence_state WHERE id = 1";
const WRITE_SQL = `INSERT INTO gym_presence_state
  (id, connected, last_event_ms, refreshed_at_ms, expires_at_ms)
  VALUES (1, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    connected = excluded.connected,
    last_event_ms = excluded.last_event_ms,
    refreshed_at_ms = excluded.refreshed_at_ms,
    expires_at_ms = excluded.expires_at_ms
  WHERE excluded.last_event_ms > gym_presence_state.last_event_ms`;

export async function readGymPresence(db, respond, nowMs = Date.now()) {
  if (!db) return respond({ error: "database_not_configured" }, 503);
  try {
    const row = await db.prepare(READ_SQL).first();
    return respond(resolveGymPresence(row, nowMs));
  } catch {
    return respond({ error: "gym_presence_unavailable_or_migration_required" }, 503);
  }
}

export async function writeGymPresence(request, env, respond, nowMs = Date.now()) {
  if (!env.DB) return respond({ error: "database_not_configured" }, 503);
  if (typeof env.GYM_PRESENCE_TOKEN !== "string" ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.GYM_PRESENCE_TOKEN)) {
    return respond({ error: "gym_presence_not_configured" }, 503);
  }
  if (!(await tokenMatches(request.headers.get("Authorization"), env.GYM_PRESENCE_TOKEN))) {
    return respond({ error: "authentication_required" }, 401);
  }
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return respond({ error: "invalid_content_type" }, 415);
  }
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return respond({ error: "invalid_presence_event" }, 400);
    input = JSON.parse(raw);
  } catch {
    return respond({ error: "invalid_presence_event" }, 400);
  }
  const event = validatePresenceEvent(input, nowMs);
  if (!event) return respond({ error: "invalid_presence_event" }, 400);

  try {
    const expiry = event.connected ? nowMs + PRESENCE_TTL_MS : nowMs;
    const result = await env.DB.prepare(WRITE_SQL)
      .bind(event.connected ? 1 : 0, event.eventAtMs, nowMs, expiry).run();
    const row = await env.DB.prepare(READ_SQL).first();
    return respond({ ...resolveGymPresence(row, nowMs), accepted: (result.meta?.changes ?? 0) > 0 });
  } catch {
    return respond({ error: "gym_presence_unavailable_or_migration_required" }, 503);
  }
}
