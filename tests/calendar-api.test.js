import test from "node:test";
import assert from "node:assert/strict";
import { handleCalendarAPI } from "../src/calendar-api.js";

class FakeD1 {
  constructor(recurring = true) {
    this.recurring = recurring;
    this.manual = new Map();
    this.rules = [];
    this.overrides = new Map();
    this.nextId = 1;
  }
  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          _sql: sql, _args: args,
          all: async () => ({ results: db.read(sql, args) }),
          first: async () => db.read(sql, args)[0] ?? null,
          run: async () => db.write(sql, args)
        };
      }
    };
  }
  async batch(statements) {
    for (const stmt of statements) await stmt.run();
  }
  read(sql, args) {
    if (sql.includes("gym_plan_") && !this.recurring) {
      throw Error("D1_ERROR: no such table: gym_plan_rules");
    }
    if (sql.startsWith("SELECT on_date, planned, attended FROM gym_calendar_days")) {
      return [...this.manual].filter(([date]) => date >= args[0] && date < args[1])
        .map(([on_date, value]) => ({ on_date, ...value }));
    }
    if (sql.startsWith("SELECT planned, attended FROM gym_calendar_days")) {
      const value = this.manual.get(args[0]);
      return value ? [value] : [];
    }
    if (sql.startsWith("SELECT id, start_on, end_on, weekdays_mask FROM gym_plan_rules")) {
      return this.rules.filter(rule => args.length === 2 &&
        (sql.includes("start_on < ?") ? rule.start_on < args[0] &&
          (!rule.end_on || rule.end_on >= args[1]) :
          rule.start_on <= args[0] && (!rule.end_on || rule.end_on >= args[1])));
    }
    if (sql.startsWith("SELECT on_date, planned FROM gym_plan_overrides")) {
      return [...this.overrides].filter(([date]) => date >= args[0] && date < args[1])
        .map(([on_date, planned]) => ({ on_date, planned }));
    }
    if (sql.startsWith("SELECT planned FROM gym_plan_overrides")) {
      return this.overrides.has(args[0]) ? [{ planned: this.overrides.get(args[0]) }] : [];
    }
    throw Error("Unexpected SELECT: " + sql);
  }
  write(sql, args) {
    if (sql.includes("gym_plan_") && !this.recurring) {
      throw Error("D1_ERROR: no such table: gym_plan_rules");
    }
    if (sql.startsWith("UPDATE gym_plan_rules")) {
      for (const r of this.rules) if (r.start_on < args[1] && (!r.end_on || r.end_on >= args[2]))
        r.end_on = args[0];
    } else if (sql.startsWith("DELETE FROM gym_plan_rules")) {
      this.rules = this.rules.filter(r => r.start_on < args[0]);
    } else if (sql.startsWith("INSERT INTO gym_plan_rules")) {
      this.rules.push({ id: this.nextId++, start_on: args[0], end_on: null, weekdays_mask: args[1] });
    } else if (sql.startsWith("INSERT INTO gym_plan_overrides")) {
      this.overrides.set(args[0], sql.includes("VALUES (?, 0)") ? 0 :
        sql.includes("VALUES (?, 1)") ? 1 : args[1]);
    } else if (sql.startsWith("DELETE FROM gym_calendar_days")) {
      this.manual.delete(args[0]);
    } else if (sql.startsWith("INSERT INTO gym_calendar_days")) {
      const old = this.manual.get(args[0]);
      this.manual.set(args[0], {
        planned: sql.includes("DO UPDATE SET attended") ? (old?.planned ?? args[1]) : args[1],
        attended: args[2]
      });
    } else {
      throw Error("Unexpected write: " + sql);
    }
  }
}

const deps = {
  respond: (body, status = 200) => ({ body, status }),
  validDate: value => typeof value === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  monthRange: value => {
    if (!/^\\d{4}-\\d{2}$/.test(value ?? "")) return null;
    const [year, month] = value.split("-").map(Number);
    if (month < 1 || month > 12) return null;
    const next = new Date(Date.UTC(year, month, 1));
    return [value + "-01", next.toISOString().slice(0, 7) + "-01"];
  },
  readJSON: async request => ({ value: JSON.parse(await request.text()) })
};
async function api(db, route, method = "GET", body) {
  return handleCalendarAPI(db, new URL("https://example.test" + route),
    { text: async () => JSON.stringify(body) }, method, deps);
}
const plannedDays = result => result.body.days.filter(day => day.planned).map(day => day.on_date);

test("weekly weekdays, skip, move, and edit future only", async () => {
  const db = new FakeD1();
  assert.equal((await api(db, "/api/calendar/recurrence", "PUT",
    {start_on:"2026-10-20", weekdays:[2,3,5]})).status, 200);
  assert.deepEqual(plannedDays(await api(db, "/api/calendar?month=2026-10")),
    ["2026-10-20", "2026-10-21", "2026-10-23", "2026-10-27", "2026-10-28", "2026-10-30"]);
  await api(db, "/api/calendar/2026-10-20", "PUT", {planned:false, attended:false});
  assert.equal(db.overrides.get("2026-10-20"), 0);
  assert.equal((await api(db, "/api/calendar/move", "POST",
    {from_date:"2026-10-21", to_date:"2026-10-22"})).status, 200);
  assert.deepEqual(plannedDays(await api(db, "/api/calendar?month=2026-10")),
    ["2026-10-22", "2026-10-23", "2026-10-27", "2026-10-28", "2026-10-30"]);
  await api(db, "/api/calendar/recurrence", "PUT", {start_on:"2026-10-27", weekdays:[1]});
  assert.deepEqual(plannedDays(await api(db, "/api/calendar?month=2026-10")),
    ["2026-10-22", "2026-10-23"]);
  assert.deepEqual(plannedDays(await api(db, "/api/calendar?month=2026-11")),
    ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  await api(db, "/api/calendar/recurrence", "PUT", {start_on:"2026-11-10", weekdays:[]});
  assert.deepEqual(plannedDays(await api(db, "/api/calendar?month=2026-11")), ["2026-11-02", "2026-11-09"]);
});
test("older manual planned/attended remain intact and exceptions override", async () => {
  const db = new FakeD1();
  db.manual.set("2026-10-20", {planned:1, attended:1});
  await api(db, "/api/calendar/recurrence", "PUT", {start_on:"2026-10-18", weekdays:[2]});
  await api(db, "/api/calendar/2026-10-20", "PUT", {planned:false, attended:true});
  assert.deepEqual(db.manual.get("2026-10-20"), {planned:1, attended:1});
  const hidden = (await api(db, "/api/calendar?month=2026-10")).body.days.find(d => d.on_date === "2026-10-20");
  assert.equal(hidden.planned, false);
  assert.equal(hidden.attended, true);
  await api(db, "/api/calendar/2026-10-20", "PUT", {planned:true, attended:true});
  assert.equal((await api(db, "/api/calendar?month=2026-10")).body.days.find(d => d.on_date === "2026-10-20").planned, true);
});
test("collision and invalid repeated rules do not mutate existing data", async () => {
  const db = new FakeD1();
  const bad = await api(db, "/api/calendar/recurrence", "PUT", {start_on:"2026-10-20", weekdays:[2,2]});
  assert.equal(bad.status, 400);
  await api(db, "/api/calendar/recurrence", "PUT", {start_on:"2026-10-20", weekdays:[2]});
  const collision = await api(db, "/api/calendar/move", "POST",
    {from_date:"2026-10-20", to_date:"2026-10-27"});
  assert.equal(collision.status, 409);
  assert.equal(db.overrides.size, 0);
});
test("pre-0004 monthly GET and single-day editing remain available", async () => {
  const db = new FakeD1(false);
  assert.equal((await api(db, "/api/calendar?month=2026-10")).body.recurrence_ready, false);
  assert.equal((await api(db, "/api/calendar/2026-10-20", "PUT",
    {planned:true, attended:false})).status, 200);
  assert.equal(db.manual.get("2026-10-20").planned, 1);
  assert.equal((await api(db, "/api/calendar/recurrence", "PUT",
    {start_on:"2026-10-20", weekdays:[2]})).status, 503);
});
