import test from "node:test";
import assert from "node:assert/strict";
import { resolveGymPresence, validatePresenceEvent, readGymPresence, writeGymPresence } from "../src/gym-presence.js";

const NOW = 1_800_000_000_000;
const dummyToken = "t".repeat(48);
const respond = (body, status = 200) => ({ body, status });
const request = (connected, eventAtMs, token = dummyToken) => new Request(
  "https://example.invalid/api/integrations/macrodroid/gym-presence",
  { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ connected, event_at_ms: eventAtMs }) }
);

function mockDB() {
  let row = null;
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...input) { params = input; return this; },
        async first() { return row ? { ...row } : null; },
        async run() {
          const [connected, lastEventMs, refreshedAtMs, expiresAtMs] = params;
          if (row && row.last_event_ms >= lastEventMs) return { meta: { changes: 0 } };
          row = { connected, last_event_ms: lastEventMs, refreshed_at_ms: refreshedAtMs, expires_at_ms: expiresAtMs };
          return { meta: { changes: 1 } };
        }
      };
    }
  };
}

test("invalid and delayed timestamp events do not pass validation", () => {
  assert.equal(validatePresenceEvent({ connected: "true", event_at_ms: NOW }, NOW), null);
  assert.equal(validatePresenceEvent({ connected: true, event_at_ms: NOW + 300001 }, NOW), null);
  assert.equal(validatePresenceEvent({ connected: true, event_at_ms: NOW - 86400001 }, NOW), null);
  assert.equal(validatePresenceEvent({ connected: false, event_at_ms: NOW, ssid: "private" }, NOW), null);
  assert.deepEqual(validatePresenceEvent({ connected: true, event_at_ms: NOW }, NOW),
    { connected: true, eventAtMs: NOW });
});

test("30-minute lease expires without a disconnect event", () => {
  const row = { connected: 1, last_event_ms: NOW, expires_at_ms: NOW + 1800000 };
  assert.equal(resolveGymPresence(row, NOW + 1799999).connected, true);
  assert.equal(resolveGymPresence(row, NOW + 1800000).connected, false);
  assert.equal(resolveGymPresence(null, NOW).connected, false);
});

test("write requires configured bearer token and never accepts another token", async () => {
  const env = { DB: mockDB(), GYM_PRESENCE_TOKEN: dummyToken };
  assert.equal((await writeGymPresence(request(true, NOW, "x".repeat(48)), env, respond, NOW)).status, 401);
  assert.equal((await writeGymPresence(request(true, NOW), { DB: env.DB }, respond, NOW)).status, 503);
  const accepted = await writeGymPresence(request(true, NOW), env, respond, NOW);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.connected, true);
  assert.equal(accepted.body.accepted, true);
  assert.equal(accepted.body.expires_at_ms, NOW + 1800000);
});

test("out of order and duplicate events never overwrite newer state", async () => {
  const env = { DB: mockDB(), GYM_PRESENCE_TOKEN: dummyToken };
  await writeGymPresence(request(true, NOW), env, respond, NOW);
  const disconnected = await writeGymPresence(request(false, NOW + 3000), env, respond, NOW + 3000);
  assert.equal(disconnected.body.connected, false);
  const stale = await writeGymPresence(request(true, NOW + 1000), env, respond, NOW + 4000);
  assert.equal(stale.body.accepted, false);
  assert.equal(stale.body.connected, false);
  const duplicated = await writeGymPresence(request(false, NOW + 3000), env, respond, NOW + 5000);
  assert.equal(duplicated.body.accepted, false);
  const status = await readGymPresence(env.DB, respond, NOW + 6000);
  assert.equal(status.body.connected, false);
});

test("new heartbeat refreshes expiry; invalid JSON does not modify state", async () => {
  const env = { DB: mockDB(), GYM_PRESENCE_TOKEN: dummyToken };
  await writeGymPresence(request(true, NOW), env, respond, NOW);
  const renewed = await writeGymPresence(request(true, NOW + 600000), env, respond, NOW + 600000);
  assert.equal(renewed.body.expires_at_ms, NOW + 2400000);
  const malformed = new Request("https://example.invalid", {
    method: "POST", headers: { Authorization: "Bearer " + dummyToken, "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal((await writeGymPresence(malformed, env, respond, NOW + 600100)).status, 400);
});

test("missing migration reports unavailable rather than inventing a state", async () => {
  const broken = { prepare() { throw Error("no such table"); } };
  assert.equal((await readGymPresence(broken, respond, NOW)).status, 503);
  const env = { DB: broken, GYM_PRESENCE_TOKEN: dummyToken };
  assert.equal((await writeGymPresence(request(true, NOW), env, respond, NOW)).status, 503);
});
