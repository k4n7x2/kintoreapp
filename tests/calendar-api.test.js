import test from "node:test";
import assert from "node:assert/strict";
import { handleCalendarAPI } from "../src/calendar-api.js";

class FakeD1 {
  constructor(recurring = true, restReady = true) {
    this.recurring = recurring;
    this.restReady = restReady;
    this.manual = new Map();
    this.rules = [];
    this.overrides = new Map();
    this.nextId = 1;
    this.repeatSeries = null;
    this.repeatExceptions = [];
    this.weeklySlots = null;
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
    if (sql.startsWith("SELECT weekday,starts_on,kind,template_id FROM gym_weekly_slots")) {
      if (this.weeklySlots === null) throw Error("no such table: gym_weekly_slots");
      return this.weeklySlots;
    }
    if (sql.startsWith("SELECT * FROM workout_repeat_series")) {
      if (this.repeatSeries === null) throw Error("no such table: workout_repeat_series");
      return this.repeatSeries.filter(row =>
        (sql.includes("starts_on < ?") ? row.starts_on < args[0] : row.starts_on <= args[0]) &&
        (!row.ends_on || row.ends_on >= args[1])).sort((a,b)=>a.id-b.id);
    }
    if (sql.startsWith("SELECT * FROM workout_repeat_exceptions")) {
      if (this.repeatSeries === null) throw Error("no such table: workout_repeat_exceptions");
      return this.repeatExceptions.filter(row=>sql.includes("on_date = ?")
        ? row.on_date===args[0] : row.on_date>=args[0]&&row.on_date<args[1]);
    }
    if (sql.startsWith("SELECT ends_on FROM workout_repeat_series")) {
      return (this.repeatSeries||[]).filter(row=>row.group_id===args[0])
        .sort((a,b)=>b.starts_on.localeCompare(a.starts_on))
        .slice(0,1).map(row=>({ends_on:row.ends_on}));
    }
    if (sql.includes("gym_plan_") && !this.recurring) {
      throw Error("D1_ERROR: no such table: gym_plan_rules");
    }
    if (sql.includes("rest FROM gym_calendar_days") && !this.restReady) {
      throw Error("D1_ERROR: no such column: rest");
    }
    if (sql.startsWith("SELECT on_date, planned, attended FROM gym_calendar_days") ||
        sql.startsWith("SELECT on_date, planned, attended, rest FROM gym_calendar_days")) {
      return [...this.manual].filter(([date]) => date >= args[0] && date < args[1])
        .map(([on_date, value]) => ({ on_date, ...value }));
    }
    if (sql.startsWith("SELECT planned, attended FROM gym_calendar_days") ||
        sql.startsWith("SELECT planned, attended, rest FROM gym_calendar_days")) {
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
        attended: args[2],
        ...(sql.includes("(on_date, planned, attended, rest)") ? {rest: args[3]} :
          old?.rest !== undefined ? {rest:old.rest} : {})
      });
    } else {
      throw Error("Unexpected write: " + sql);
    }
  }
}

const deps = {
  respond: (body, status = 200) => ({ body, status }),
  validDate: value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  monthRange: value => {
    if (!/^\d{4}-\d{2}$/.test(value ?? "")) return null;
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
  assert.deepEqual(db.manual.get("2026-10-20"), {planned:1, attended:1, rest:0});
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

test("rest-day takes priority over weekly, while preserving attendance", async () => {
  const db = new FakeD1();
  await api(db, "/api/calendar/recurrence", "PUT", {start_on:"2026-10-18", weekdays:[2]});
  await api(db, "/api/calendar/2026-10-20", "PUT", {planned:false, attended:true, rest:true});
  let day = (await api(db, "/api/calendar?month=2026-10")).body.days.find(d => d.on_date === "2026-10-20");
  assert.deepEqual({planned:day.planned, rest:day.rest, attended:day.attended},
    {planned:false, rest:true, attended:true});
  assert.equal((await api(db, "/api/calendar/move", "POST",
    {from_date:"2026-10-27", to_date:"2026-10-20"})).status, 409);
  await api(db, "/api/calendar/2026-10-20", "PUT", {planned:true, attended:true, rest:false});
  day = (await api(db, "/api/calendar?month=2026-10")).body.days.find(d => d.on_date === "2026-10-20");
  assert.deepEqual({planned:day.planned, rest:day.rest, attended:day.attended},
    {planned:true, rest:false, attended:true});
});

test("fallback when rest column is missing, with 0005 ready", async () => {
  const db = new FakeD1(true, false);
  await api(db, "/api/calendar/recurrence", "PUT", {start_on:"2026-10-18", weekdays:[2]});
  const response = await api(db, "/api/calendar?month=2026-10");
  assert.equal(response.body.rest_ready, false);
  assert.equal(response.body.recurrence_ready, true);
  assert.equal((await api(db, "/api/calendar/2026-10-20", "PUT",
    {planned:false, attended:false, rest:true})).status, 503);
});

test("recurring rest displays a bed status; an empty gym workout shows a planned status",async()=>{
  const db=new FakeD1();
  db.repeatSeries=[
    {id:1,group_id:"a",starts_on:"2026-10-19",ends_on:null,cadence:"weekly",every_n:1,
     content_json:JSON.stringify({kind:"rest",exercises:[]})},
    {id:2,group_id:"b",starts_on:"2026-10-20",ends_on:null,cadence:"weekly",every_n:1,
     content_json:JSON.stringify({kind:"gym",exercises:[]})}
  ];
  const month=(await api(db,"/api/calendar?month=2026-10")).body;
  const monday=month.days.find(row=>row.on_date==="2026-10-26");
  const tuesday=month.days.find(row=>row.on_date==="2026-10-27");
  assert.deepEqual([monday.planned,monday.rest,monday.repeat_kind],[false,true,"rest"]);
  assert.deepEqual([tuesday.planned,tuesday.rest,tuesday.repeat_kind],[true,false,"gym"]);
  assert.equal(monday.attended,false);
  assert.equal(tuesday.attended,false);
  db.manual.set("2026-10-26",{planned:1,attended:1,rest:0});
  const override=(await api(db,"/api/calendar?month=2026-10")).body.days
    .find(row=>row.on_date==="2026-10-26");
  assert.deepEqual([override.planned,override.rest,override.attended],[true,false,true]);
});
test("one-day cancellations of rest and empty gym rules keep prior manual data intact",async()=>{
  const db=new FakeD1();
  db.repeatSeries=[
    {id:1,group_id:"a",starts_on:"2026-10-19",ends_on:null,cadence:"weekly",every_n:1,
     content_json:JSON.stringify({kind:"rest",exercises:[]})},
    {id:2,group_id:"b",starts_on:"2026-10-20",ends_on:null,cadence:"weekly",every_n:1,
     content_json:JSON.stringify({kind:"gym",exercises:[]})}
  ];
  db.repeatExceptions=[{series_id:1,on_date:"2026-10-26",cancelled:1,content_json:null},
    {series_id:2,on_date:"2026-10-27",cancelled:1,content_json:null}];
  const month=(await api(db,"/api/calendar?month=2026-10")).body;
  assert.equal(month.days.some(x=>x.on_date==="2026-10-26"),false);
  assert.equal(month.days.some(x=>x.on_date==="2026-10-27"),false);
});

test("new snapshot recurrence and legacy weekday calendar resolve to one gym state",async()=>{
  const db=new FakeD1();
  db.repeatSeries=[{id:6,group_id:"g",starts_on:"2026-10-20",ends_on:null,
    cadence:"weekly",every_n:1,content_json:JSON.stringify({kind:"gym",exercises:[]})}];
  db.rules=[{id:1,start_on:"2026-10-20",end_on:null,weekdays_mask:2}];
  db.manual.set("2026-10-20",{planned:1,attended:1,rest:0});
  const response=await api(db,"/api/calendar?month=2026-10");
  const entry=response.body.days.filter(d=>d.on_date==="2026-10-20");
  assert.equal(entry.length,1);
  assert.deepEqual([entry[0].planned,entry[0].rest,entry[0].attended],
    [true,false,true]);
  assert.equal(entry[0].source,"manual");
});
test("day-specific none or rest overrides snapshot gym without replacing next week",async()=>{
  const db=new FakeD1();
  db.repeatSeries=[{id:1,group_id:"g",starts_on:"2026-10-20",ends_on:null,
    cadence:"weekly",every_n:1,content_json:JSON.stringify({kind:"gym",exercises:[]})}];
  let changed=await api(db,"/api/calendar/2026-10-27","PUT",
    {planned:false,attended:false,rest:true});
  assert.equal(changed.status,200);
  assert.deepEqual([changed.body.planned,changed.body.rest],[false,true]);
  assert.equal(db.overrides.get("2026-10-27"),0);
  let response=await api(db,"/api/calendar?month=2026-10");
  let day=response.body.days.find(x=>x.on_date==="2026-10-27");
  assert.deepEqual([day.planned,day.rest,day.source],[false,true,"manual"]);
  assert.equal(response.body.days.find(x=>x.on_date==="2026-10-20").planned,true);
  changed=await api(db,"/api/calendar/2026-10-27","PUT",
    {planned:false,attended:false,rest:false});
  assert.equal(changed.status,200);
  response=await api(db,"/api/calendar?month=2026-10");
  day=response.body.days.find(x=>x.on_date==="2026-10-27");
  assert.deepEqual([day.planned,day.rest,day.exception],[false,false,0]);
});
test("explicit gym overrides a repeating rest; future rest remains intact",async()=>{
  const db=new FakeD1();
  db.repeatSeries=[{id:1,group_id:"r",starts_on:"2026-10-19",ends_on:null,
    cadence:"weekly",every_n:1,content_json:JSON.stringify({kind:"rest",exercises:[]})}];
  let changed=await api(db,"/api/calendar/2026-10-26","PUT",
    {planned:true,attended:false,rest:false});
  assert.equal(changed.status,200);
  let month=(await api(db,"/api/calendar?month=2026-10")).body;
  const day=month.days.find(x=>x.on_date==="2026-10-26");
  assert.deepEqual([day.planned,day.rest,day.source],[true,false,"exception"]);
  assert.equal(month.days.find(x=>x.on_date==="2026-10-19").rest,true);
});
test("snapshot recurrence cannot move without moving its exercise snapshot",async()=>{
  const db=new FakeD1();
  db.repeatSeries=[{id:1,group_id:"g",starts_on:"2026-10-20",ends_on:null,
    cadence:"weekly",every_n:1,content_json:JSON.stringify({kind:"gym",exercises:[]})}];
  const result=await api(db,"/api/calendar/move","POST",
    {from_date:"2026-10-20",to_date:"2026-10-21"});
  assert.equal(result.status,409);
  assert.equal(result.body.error,"repeat_move_requires_snapshot");
});

test("weekly schedule shows gym/rest with a linked menu, independent of repeated snapshots",async()=>{
  const db=new FakeD1();
  db.weeklySlots=[
    {weekday:2,starts_on:"2026-10-19",kind:"gym",template_id:12},
    {weekday:4,starts_on:"2026-10-19",kind:"rest",template_id:null},
    {weekday:1,starts_on:"2026-10-19",kind:"none",template_id:null}
  ];
  db.repeatSeries=[{id:1,group_id:"g",starts_on:"2026-10-20",ends_on:null,
    cadence:"weekly",every_n:1,content_json:JSON.stringify({kind:"rest",exercises:[]})}];
  db.rules=[{id:1,start_on:"2026-10-19",end_on:null,weekdays_mask:1}];
  const month=(await api(db,"/api/calendar?month=2026-10")).body;
  assert.equal(month.weekly_setup_ready,true);
  const tue=month.days.find(x=>x.on_date==="2026-10-20");
  const thu=month.days.find(x=>x.on_date==="2026-10-22");
  assert.deepEqual([tue.planned,tue.rest,tue.template_id,tue.source],
    [true,false,12,"weekly-template"]);
  assert.deepEqual([thu.planned,thu.rest,thu.template_id,thu.source],
    [false,true,null,"weekly-template"]);
  assert.equal(month.days.some(x=>x.on_date==="2026-10-26"&&x.planned),false);
});
test("manual one-day exception wins over linked menu, then next week restores schedule",async()=>{
  const db=new FakeD1();
  db.weeklySlots=[{weekday:2,starts_on:"2026-10-19",kind:"gym",template_id:12}];
  let response=await api(db,"/api/calendar/2026-10-27","PUT",
    {planned:false,attended:false,rest:true});
  assert.equal(response.status,200);
  const month=(await api(db,"/api/calendar?month=2026-11")).body;
  const day=(await api(db,"/api/calendar?month=2026-10")).body.days.find(x=>x.on_date==="2026-10-27");
  assert.deepEqual([day.planned,day.rest,day.template_id],[false,true,null]);
  assert.equal(month.days.find(x=>x.on_date==="2026-11-03").template_id,12);
});
