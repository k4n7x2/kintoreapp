import test from "node:test";
import assert from "node:assert/strict";
import { handleRepeatAPI } from "../src/workout-repeat.js";

class FakeDB {
  constructor() { this.series=[]; this.exceptions=[]; this.next=1; this.sqlLog=[]; this.restDays=new Set();this.plannedDays=new Set();this.dayOverrides=new Map(); }
  prepare(sql) {
    const db=this;
    return {bind(...args) {return {
      first:async()=>db.read(sql,args)[0]??null,
      all:async()=>({results:db.read(sql,args)}),
      run:async()=>db.write(sql,args)
    }}};
  }
  async batch(statements) { const results=[];for(const statement of statements) results.push(await statement.run()); return results; }
  read(sql,a) {
    if(sql.startsWith("SELECT planned, rest FROM gym_calendar_days"))return [{
      planned:this.plannedDays.has(a[0])?1:0,rest:this.restDays.has(a[0])?1:0}];
    if(sql.startsWith("SELECT planned FROM gym_calendar_days"))return [{planned:this.plannedDays.has(a[0])?1:0}];
    if(sql.startsWith("SELECT starts_on, ends_on, cadence, every_n FROM workout_repeat_series"))
      return this.series.filter(x=>(!x.ends_on||x.ends_on>=a[0])&&x.starts_on<=a[1]&&
        (a.length<3||x.group_id!==a[2]));
    if(sql.startsWith("SELECT starts_on, ends_on FROM workout_repeat_series WHERE group_id"))
      return this.series.filter(x=>x.group_id===a[0])
        .sort((x,y)=>y.starts_on.localeCompare(x.starts_on))
        .map(x=>({starts_on:x.starts_on,ends_on:x.ends_on}));
    if(sql.startsWith("SELECT ends_on FROM workout_repeat_series WHERE group_id"))return this.series
      .filter(x=>x.group_id===a[0]).sort((x,y)=>y.starts_on.localeCompare(x.starts_on))
      .slice(0,1).map(x=>({ends_on:x.ends_on}));
    if(sql.startsWith("SELECT id, starts_on FROM workout_repeat_series WHERE group_id"))return this.series
      .filter(x=>x.group_id===a[0]).sort((x,y)=>y.starts_on.localeCompare(x.starts_on))
      .map(x=>({id:x.id,starts_on:x.starts_on}));
    if(sql.startsWith("SELECT * FROM workout_repeat_series WHERE id"))return this.series.filter(x=>x.id===a[0]);
    if(sql.startsWith("SELECT * FROM workout_repeat_series")) {
      if(a.length===2) return this.series.filter(x=>x.starts_on<=a[0]&&(!x.ends_on||x.ends_on>=a[1]));
    }
    if(sql.startsWith("SELECT * FROM workout_repeat_exceptions"))return this.exceptions.filter(x=>x.on_date===a[0]);
    throw Error("Unexpected SELECT: "+sql);
  }
  write(sql,a) {
    this.sqlLog.push(sql);
    if(sql.startsWith("DELETE FROM gym_plan_overrides WHERE on_date=?")) {
      this.dayOverrides.delete(a[0]);
      return {success:true};
    }
    if(sql.startsWith("UPDATE gym_calendar_days SET planned=0")) {
      this.plannedDays.delete(a[0]);
      if(sql.includes("rest=0"))this.restDays.delete(a[0]);
      return {success:true};
    }
    if(sql.startsWith("INSERT INTO workout_repeat_series")) {
      const row={id:this.next++,group_id:a[0],starts_on:a[1],ends_on:a[2],cadence:a[3],
        every_n:a[4],content_json:a[5]};
      this.series.push(row);
      return {meta:{last_row_id:row.id}};
    }
    if(sql.startsWith("INSERT INTO workout_repeat_exceptions")) {
      this.exceptions=this.exceptions.filter(x=>x.series_id!==a[0]||x.on_date!==a[1]);
      this.exceptions.push({series_id:a[0],on_date:a[1],cancelled:a[2],content_json:a[3]});
    } else if(sql.startsWith("UPDATE workout_repeat_series SET content_json")) {
      if(sql.includes("WHERE group_id")) {
        this.series.forEach(row=>{if(row.group_id===a[3]) {
          row.content_json=a[0];row.cadence=a[1];row.every_n=a[2];
        }});
      } else {
        this.series.forEach(row=>{if(row.id===a[4]){
          row.content_json=a[0];row.cadence=a[1];row.every_n=a[2];row.ends_on=a[3];
        }});
      }
    } else if(sql.startsWith("UPDATE workout_repeat_series SET ends_on")) {
      this.series.forEach(row=>{if(row.id===a[1])row.ends_on=a[0]});
    } else if(sql.startsWith("DELETE FROM workout_repeat_exceptions")) {
      if(sql.includes("on_date>="))this.exceptions=this.exceptions.filter(row=>row.series_id!==a[0]||row.on_date<a[1]);
      else if(sql.includes("SELECT id FROM workout_repeat_series")) {
        const ids=new Set(this.series.filter(row=>row.group_id===a[0]).map(row=>row.id));
        if(sql.includes("starts_on>?")) {
          const next=new Set(this.series.filter(row=>row.group_id===a[0]&&row.starts_on>a[1]).map(row=>row.id));
          this.exceptions=this.exceptions.filter(row=>!next.has(row.series_id));
        } else this.exceptions=this.exceptions.filter(row=>!ids.has(row.series_id));
      } else this.exceptions=this.exceptions.filter(row=>row.series_id!==a[0]);
    } else if(sql.startsWith("DELETE FROM workout_repeat_series")) {
      if(sql.includes("starts_on>?"))this.series=this.series.filter(row=>row.group_id!==a[0]||row.starts_on<=a[1]);
      else if(sql.includes("group_id=?"))this.series=this.series.filter(row=>row.group_id!==a[0]);
      else this.series=this.series.filter(row=>row.id!==a[0]);
    } else throw Error("Unexpected SQL: "+sql);
    return {success:true};
  }
}
const validDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  new Date(value).toISOString().slice(0,10)===value;
const deps={respond:(body,status=200)=>({body,status}),validDate,
  monthRange:()=>null,readJSON:async request=>({value:JSON.parse(await request.text())})};
const sample=[{name:"チェストプレス",unit:"kg_reps",note:"30秒休憩",
  sets:[{weight_kg:30,reps:10,duration_seconds:0},{weight_kg:30,reps:10,duration_seconds:0}]}];
const newer=[{name:"チェストプレス",unit:"kg_reps",note:"負荷UP",
  sets:[{weight_kg:35,reps:8,duration_seconds:0}]}];
async function api(db,path,method="GET",body={}) {
  return handleRepeatAPI(db,new URL("https://example.test"+path),
    {text:async()=>JSON.stringify(body)},method,deps);
}
test("create and read full day snapshot; no workout data insert",async()=>{
  const db=new FakeDB();
  const created=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-20",cadence:"weekly",every_n:1,end_on:null,exercises:sample});
  assert.equal(created.status,201);
  const tuesday=await api(db,"/api/repeat?date=2026-10-27");
  assert.deepEqual(tuesday.body.occurrences[0].exercises,sample);
  assert.deepEqual((await api(db,"/api/repeat?date=2026-10-21")).body.occurrences,[]);
  assert.equal(db.sqlLog.some(sql=>/workout_sessions|workout_sets/.test(sql)),false);
});
test("only, future, all edit scope and deletion",async()=>{
  const db=new FakeDB();
  const created=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-20",cadence:"weekly",every_n:1,exercises:sample});
  const id=created.body.id;
  assert.equal((await api(db,"/api/repeat/"+id,"PATCH",
    {date:"2026-10-27",scope:"only",exercises:newer})).status,200);
  assert.deepEqual((await api(db,"/api/repeat?date=2026-10-27")).body.occurrences[0].exercises,newer);
  assert.deepEqual((await api(db,"/api/repeat?date=2026-11-03")).body.occurrences[0].exercises,sample);
  assert.equal((await api(db,"/api/repeat/"+id,"PATCH",
    {date:"2026-11-03",scope:"future",exercises:newer,cadence:"weekly",every_n:1,end_on:null})).status,200);
  assert.deepEqual((await api(db,"/api/repeat?date=2026-10-20")).body.occurrences[0].exercises,sample);
  const future=(await api(db,"/api/repeat?date=2026-11-10")).body.occurrences[0];
  assert.deepEqual(future.exercises,newer);
  const allContent=await api(db,"/api/repeat/"+future.id,"PATCH",
    {date:"2026-11-10",scope:"all",exercises:sample,cadence:"weekly",every_n:1,end_on:null});
  assert.equal(allContent.status,200);
  assert.deepEqual((await api(db,"/api/repeat?date=2026-10-20")).body.occurrences[0].exercises,sample);
  await api(db,"/api/repeat/"+future.id,"DELETE",{date:"2026-11-10",scope:"only"});
  assert.deepEqual((await api(db,"/api/repeat?date=2026-11-10")).body.occurrences,[]);
  assert.equal((await api(db,"/api/repeat?date=2026-11-17")).body.occurrences.length,1);
  await api(db,"/api/repeat/"+future.id,"DELETE",{date:"2026-11-17",scope:"future"});
  assert.deepEqual((await api(db,"/api/repeat?date=2026-11-24")).body.occurrences,[]);
  await api(db,"/api/repeat/"+id,"DELETE",{date:"2026-10-20",scope:"all"});
  assert.equal(db.series.length,0);
});
test("bad snapshots or invalid dates do not write",async()=>{
  const db=new FakeDB();
  const bad=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-20",cadence:"weekly",exercises:[]});
  assert.equal(bad.status,400);
  assert.equal(db.sqlLog.length,0);
});

test("rest schedule repeats without any exercise, and can be scoped to empty gym",async()=>{
  const db=new FakeDB();
  db.restDays.add("2026-10-19");
  const created=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-19",cadence:"weekly",every_n:1,kind:"rest",exercises:[]});
  assert.equal(created.status,201);
  assert.equal(db.restDays.has("2026-10-19"),false);
  let first=(await api(db,"/api/repeat?date=2026-10-26")).body.occurrences[0];
  assert.equal(first.kind,"rest");
  assert.deepEqual(first.exercises,[]);
  assert.equal((await api(db,"/api/repeat/"+created.body.id,"PATCH",
    {date:"2026-10-26",scope:"only",kind:"gym",exercises:[]})).status,200);
  first=(await api(db,"/api/repeat?date=2026-10-26")).body.occurrences[0];
  assert.deepEqual({kind:first.kind,exercises:first.exercises},{kind:"gym",exercises:[]});
  assert.equal((await api(db,"/api/repeat?date=2026-11-02")).body.occurrences[0].kind,"rest");
});
test("empty gym schedule updates future and all, preserving previous occurrences",async()=>{
  const db=new FakeDB();
  db.plannedDays.add("2026-10-20");
  const created=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-20",cadence:"weekly",kind:"gym",exercises:[]});
  assert.equal(created.status,201);
  assert.equal(db.plannedDays.has("2026-10-20"),false);
  assert.deepEqual((await api(db,"/api/repeat?date=2026-10-27")).body.occurrences[0].exercises,[]);
  const changed=await api(db,"/api/repeat/"+created.body.id,"PATCH",
    {date:"2026-10-27",scope:"future",kind:"rest",exercises:[],
     cadence:"weekly",every_n:1,end_on:null});
  assert.equal(changed.status,200);
  assert.equal((await api(db,"/api/repeat?date=2026-10-20")).body.occurrences[0].kind,"gym");
  const future=(await api(db,"/api/repeat?date=2026-11-03")).body.occurrences[0];
  assert.equal(future.kind,"rest");
  await api(db,"/api/repeat/"+future.id,"DELETE",{date:"2026-11-03",scope:"only"});
  assert.deepEqual((await api(db,"/api/repeat?date=2026-11-03")).body.occurrences,[]);
  assert.equal((await api(db,"/api/repeat?date=2026-11-10")).body.occurrences[0].kind,"rest");
  const all=await api(db,"/api/repeat/"+future.id,"PATCH",
    {date:"2026-11-10",scope:"all",kind:"gym",exercises:[],
     cadence:"weekly",every_n:1,end_on:null});
  assert.equal(all.status,200);
  assert.equal((await api(db,"/api/repeat?date=2026-10-20")).body.occurrences[0].kind,"gym");
});
test("rest-plan mismatch is rejected without writing",async()=>{
  const db=new FakeDB();db.restDays.add("2026-10-20");
  const blocked=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-20",cadence:"weekly",kind:"gym",exercises:[]});
  assert.equal(blocked.status,409);
  assert.equal(db.series.length,0);
});

test("cancel first rest occurrence does not resurrect its original manual status",async()=>{
  const db=new FakeDB();db.restDays.add("2026-10-19");
  const created=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-19",kind:"rest",cadence:"weekly",exercises:[]});
  assert.equal(created.status,201);
  assert.equal(db.restDays.has("2026-10-19"),false);
  const del=await api(db,"/api/repeat/"+created.body.id,"DELETE",
    {date:"2026-10-19",scope:"only"});
  assert.equal(del.status,200);
  assert.equal((await api(db,"/api/repeat?date=2026-10-19")).body.occurrences.length,0);
  assert.equal((await api(db,"/api/repeat?date=2026-10-26")).body.occurrences[0].kind,"rest");
  assert.equal(db.sqlLog.some(sql=>sql.includes("workout_sets")||sql.includes("attended=")),false);
});

test("creating a repeat removes only the initial explicit one-off day override",async()=>{
  const db=new FakeDB();
  db.dayOverrides.set("2026-10-20",0);
  db.plannedDays.add("2026-10-20");
  db.dayOverrides.set("2026-10-21",0);
  const created=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-20",cadence:"weekly",every_n:1,kind:"gym",exercises:[]});
  assert.equal(created.status,201);
  assert.equal(db.dayOverrides.has("2026-10-20"),false);
  assert.equal(db.dayOverrides.get("2026-10-21"),0);
});
test("overlap between repeat series cannot be created from another start date",async()=>{
  const db=new FakeDB();
  const a=await api(db,"/api/repeat","POST",{start_on:"2026-10-20",cadence:"weekly",every_n:1,kind:"gym",exercises:[]});
  assert.equal(a.status,201);
  const duplicate=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-21",cadence:"daily",every_n:1,kind:"rest",exercises:[]});
  assert.equal(duplicate.status,409);
  assert.equal(duplicate.body.error,"overlapping_recurrence");
  assert.equal(db.series.length,1);
  const different=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-22",cadence:"weekly",every_n:1,kind:"rest",exercises:[]});
  assert.equal(different.status,201);
  assert.equal(db.series.length,2);
});

test("changing a weekly series to daily cannot overlap another weekly series",async()=>{
  const db=new FakeDB();
  const a=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-20",cadence:"weekly",every_n:1,kind:"gym",exercises:[]});
  const b=await api(db,"/api/repeat","POST",
    {start_on:"2026-10-21",cadence:"weekly",every_n:1,kind:"rest",exercises:[]});
  assert.equal(a.status,201);
  assert.equal(b.status,201);
  const blocked=await api(db,"/api/repeat/"+a.body.id,"PATCH",
    {date:"2026-10-20",scope:"future",cadence:"daily",every_n:1,end_on:null,
      kind:"gym",exercises:[]});
  assert.equal(blocked.status,409);
  assert.equal(blocked.body.error,"overlapping_recurrence");
  const existing=(await api(db,"/api/repeat?date=2026-10-27")).body.occurrences;
  assert.equal(existing.length,1);
  assert.equal(existing[0].cadence,"weekly");
  const blockedAll=await api(db,"/api/repeat/"+a.body.id,"PATCH",
    {date:"2026-10-20",scope:"all",cadence:"daily",every_n:1,end_on:null,
      kind:"gym",exercises:[]});
  assert.equal(blockedAll.status,409);
});
