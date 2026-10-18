import test from "node:test";
import assert from "node:assert/strict";
import {handlePlanResetAPI} from "../src/plan-reset.js";

class FakeD1 {
  constructor({tables="all",rest=true}={}) {
    const all=["gym_calendar_days","gym_plan_rules","gym_plan_overrides",
      "workout_repeat_series","workout_repeat_exceptions"];
    this.existing=new Set(tables==="all"?all:tables);
    this.hasRest=rest;
    this.days=[
      {on_date:"2026-10-20",planned:1,attended:1,rest:0},
      {on_date:"2026-10-21",planned:0,attended:1,rest:1},
      {on_date:"2026-10-22",planned:1,attended:0,rest:0},
      {on_date:"2026-10-23",planned:0,attended:0,rest:0}
    ];
    this.legacyRules=[{id:1}];this.legacyExceptions=[{on_date:"2026-10-27"}];
    this.repeatSeries=[{id:1}];this.repeatExceptions=[{series_id:1}];
    this.workout_sessions=[{id:1,performed_on:"2026-10-20"}];
    this.workout_sets=[{session_id:1,weight_kg:30,reps:10}];
    this.exercise_catalog=[{name:"チェストプレス"}];
    this.executed=[];
  }
  prepare(sql) {
    const db=this;
    return {bind(...params) {
      return {
        all:async()=>({results:db.read(sql,params)}),
        first:async()=>db.read(sql,params)[0]??null,
        run:async()=>db.apply(sql)
      };
    },run:async()=>db.apply(sql),
       all:async()=>({results:db.read(sql,[])}),
       first:async()=>db.read(sql,[])[0]??null};
  }
  read(sql,params) {
    if(sql.startsWith("SELECT name FROM sqlite_master"))
      return [...this.existing].filter(name=>params.includes(name)).map(name=>({name}));
    if(sql.startsWith("PRAGMA table_info"))
      return ["on_date","planned","attended","updated_at",
        ...(this.hasRest?["rest"]:[])].map(name=>({name}));
    if(sql.startsWith("SELECT SUM(CASE WHEN planned"))
      return [{plans:this.days.filter(x=>x.planned).length,
        rests:this.hasRest?this.days.filter(x=>x.rest).length:undefined}];
    if(sql.startsWith("SELECT COUNT(*) AS total FROM ")){
      const table=sql.replace("SELECT COUNT(*) AS total FROM ","");
      const k={"gym_plan_rules":"legacyRules","gym_plan_overrides":"legacyExceptions",
        "workout_repeat_series":"repeatSeries","workout_repeat_exceptions":"repeatExceptions"}[table];
      if(!k)throw Error("unknown count table "+table);
      return [{total:this[k].length}];
    }
    throw Error("unexpected query "+sql);
  }
  apply(sql) {
    this.executed.push(sql);
    const tables={"workout_repeat_exceptions":"repeatExceptions",
      "workout_repeat_series":"repeatSeries","gym_plan_overrides":"legacyExceptions",
      "gym_plan_rules":"legacyRules"};
    for(const [name,key] of Object.entries(tables))
      if(sql==="DELETE FROM "+name){this[key]=[];return {success:true}};
    if(sql==="DELETE FROM gym_calendar_days WHERE attended = 0") {
      this.days=this.days.filter(day=>day.attended!==0);return {success:true};
    }
    if(sql.startsWith("UPDATE gym_calendar_days SET planned = 0")) {
      for(const day of this.days)if(day.attended===1){day.planned=0;
        if(this.hasRest)day.rest=0;}
      return {success:true};
    }
    throw Error("unexpected write "+sql);
  }
  async batch(statements) {for(const statement of statements)await statement.run();}
}
const deps={respond:(body,status=200)=>({body,status}),readJSON:async request=>({
  value:JSON.parse(await request.text())
})};
async function api(db,method="GET",body={}) {
  return handlePlanResetAPI(db,{text:async()=>JSON.stringify(body)},method,deps);
}
const confirmed={scope:"plans_only",confirm:"DELETE_ALL_PLANS"};

test("preview counts all plan sources without changes",async()=>{
  const db=new FakeD1();
  const result=await api(db);
  assert.equal(result.status,200);
  assert.deepEqual(result.body.counts,{
    singlePlans:2,restDays:1,legacyRules:1,
    legacyExceptions:1,repeatSeries:1,repeatExceptions:1
  });
  assert.deepEqual(db.executed,[]);
});
test("confirmation required before any destructive mutation",async()=>{
  const db=new FakeD1();
  assert.equal((await api(db,"POST",{})).status,400);
  assert.equal((await api(db,"POST",{scope:"plans_only",confirm:"YES"})).status,400);
  assert.equal((await api(db,"DELETE",confirmed)).status,405);
  assert.deepEqual(db.executed,[]);
});
test("clears all plans, rest and overrides, but preserves workout, attendance, catalog",async()=>{
  const db=new FakeD1();
  const workouts=JSON.stringify(db.workout_sessions);
  const sets=JSON.stringify(db.workout_sets);
  const catalog=JSON.stringify(db.exercise_catalog);
  const result=await api(db,"POST",confirmed);
  assert.equal(result.status,200);
  assert.equal(result.body.cleared,true);
  assert.equal(db.days.length,2);
  assert.deepEqual(db.days.map(day=>[day.attended,day.planned,day.rest]),
    [[1,0,0],[1,0,0]]);
  for(const key of ["legacyRules","legacyExceptions","repeatSeries","repeatExceptions"])
    assert.deepEqual(db[key],[]);
  assert.equal(JSON.stringify(db.workout_sessions),workouts);
  assert.equal(JSON.stringify(db.workout_sets),sets);
  assert.equal(JSON.stringify(db.exercise_catalog),catalog);
  assert.equal(db.executed.some(sql=>/DELETE FROM workout_(?:sessions|sets)|exercise_catalog/.test(sql)),false);
});
test("legacy schema without rest or 0007 is supported and attendance remains",async()=>{
  const db=new FakeD1({tables:["gym_calendar_days","gym_plan_rules","gym_plan_overrides"],rest:false});
  db.days=[{planned:1,attended:1},{planned:1,attended:0}];
  const result=await api(db,"POST",confirmed);
  assert.equal(result.status,200);
  assert.equal(db.days.length,1);
  assert.equal(db.days[0].attended,1);
  assert.equal(db.days[0].planned,0);
  assert.equal(db.executed.some(sql=>/workout_repeat/.test(sql)),false);
  assert.equal(db.executed.some(sql=>/SET planned = 0, rest = 0/.test(sql)),false);
});
test("nothing to clear succeeds safely and reset is idempotent",async()=>{
  const db=new FakeD1({tables:[]});
  assert.equal((await api(db,"POST",confirmed)).status,200);
  assert.deepEqual(db.executed,[]);
  const full=new FakeD1();
  assert.equal((await api(full,"POST",confirmed)).status,200);
  assert.equal((await api(full,"POST",confirmed)).status,200);
  assert.equal((await api(full)).body.counts.repeatSeries,0);
});
