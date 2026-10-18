import test from "node:test";
import assert from "node:assert/strict";
import { handleRepeatAPI } from "../src/workout-repeat.js";

class FakeDB {
  constructor() { this.series=[]; this.exceptions=[]; this.next=1; this.sqlLog=[]; }
  prepare(sql) {
    const db=this;
    return {bind(...args) {return {
      first:async()=>db.read(sql,args)[0]??null,
      all:async()=>({results:db.read(sql,args)}),
      run:async()=>db.write(sql,args)
    }}};
  }
  async batch(statements) { for(const statement of statements) await statement.run(); }
  read(sql,a) {
    if(sql.startsWith("SELECT rest FROM gym_calendar_days"))return [{rest:0}];
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
