import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkInGymAttendance, japanAttendanceDate } from "../src/gym-attendance.js";

const NOW = Date.parse("2026-10-24T15:10:00Z");
const respond = (body, status = 200) => ({ body, status });
const lease = { connected: 1, expires_at_ms: NOW + 30000, last_event_ms: NOW - 1000 };

class FakeD1 {
  constructor(presence = lease) {
    this.presence = presence; this.days = new Map(); this.writes = 0;
    this.noPresence = false; this.noCalendar = false;
  }
  prepare(sql) {
    if (sql.includes("FROM gym_presence_state")) {
      return { first: async () => {
        if (this.noPresence) throw Error("no such table: gym_presence_state");
        return this.presence;
      } };
    }
    assert.match(sql, /INSERT INTO gym_calendar_days \(on_date, attended\)/);
    assert.match(sql, /WHERE gym_calendar_days\.attended = 0/);
    return { bind: date => ({ run: async () => {
      if (this.noCalendar) throw Error("no such table: gym_calendar_days");
      const day = this.days.get(date);
      if (day?.attended === 1) return { meta: { changes: 0 } };
      this.days.set(date, { planned:day?.planned??0, rest:day?.rest??0, attended:1 });
      this.writes++;
      return { meta: { changes: 1 } };
    } }) };
  }
}

test("server-clock JST boundary", () => {
  assert.equal(japanAttendanceDate(Date.parse("2026-10-24T14:59:59Z")), "2026-10-24");
  assert.equal(japanAttendanceDate(Date.parse("2026-10-24T15:00:00Z")), "2026-10-25");
});

test("a connected app-open marks today once without changing plans or rest", async () => {
  const db = new FakeD1();
  db.days.set("2026-10-25", { planned:1, rest:1, attended:0 });
  const first = await checkInGymAttendance(db, respond, NOW);
  const again = await checkInGymAttendance(db, respond, NOW + 1000);
  assert.equal(first.status, 200);
  assert.equal(first.body.connected, true);
  assert.equal(first.body.attended, true);
  assert.equal(first.body.changed, true);
  assert.equal(first.body.on_date, "2026-10-25");
  assert.equal(again.body.changed, false);
  assert.equal(db.writes, 1);
  assert.deepEqual(db.days.get("2026-10-25"), { planned:1, rest:1, attended:1 });
});

test("disconnected, expired, missing Wi-Fi lease leaves existing records alone", async () => {
  for (const presence of [null, {...lease,connected:0}, {...lease,expires_at_ms:NOW}]) {
    const db = new FakeD1(presence);
    db.days.set("2026-10-24",{planned:1,rest:0,attended:1});
    const result = await checkInGymAttendance(db, respond, NOW);
    assert.equal(result.body.attended, false);
    assert.equal(result.body.changed, false);
    assert.equal(db.writes, 0);
    assert.equal(db.days.get("2026-10-24").attended, 1);
  }
});

test("missing D1 bindings/migrations fail closed", async () => {
  assert.equal((await checkInGymAttendance(null,respond,NOW)).status,503);
  const db1=new FakeD1();db1.noPresence=true;
  assert.equal((await checkInGymAttendance(db1,respond,NOW)).status,503);
  const db2=new FakeD1();db2.noCalendar=true;
  assert.equal((await checkInGymAttendance(db2,respond,NOW)).status,503);
});

test("route requires authenticated same-origin write, foreground only", async () => {
  const backend=await readFile(new URL("../src/index.js", import.meta.url),"utf8");
  const app=await readFile(new URL("../public/app.js", import.meta.url),"utf8");
  const html=await readFile(new URL("../public/index.html", import.meta.url),"utf8");
  const auth=backend.indexOf('if (!(await isAuthenticated(request, env)))');
  const checkIn=backend.indexOf('if (url.pathname === "/api/gym-presence/check-in")');
  assert.ok(auth>=0 && checkIn>auth);
  assert.match(backend.slice(checkIn,checkIn+250),/sameOriginJSON\(request, url\)/);
  assert.match(app,/async function registerGymAttendance\(\)/);
  assert.match(app,/setInterval\(\(\) => \{[\s\S]*?void refreshGymPresence\(\);/);
  assert.match(html,/app\.js\?v=20261025-auto-attendance-v1/);
});
