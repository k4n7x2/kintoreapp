import test from "node:test";
import assert from "node:assert/strict";
import {normalizeTrainingSet,handleTrainingModeAPI} from "../src/training-mode.js";

const date = "2026-10-22";
const validDate = value => /^20\d\d-\d\d-\d\d$/.test(value||"");
const base = {performed_on:date,exercise_name:"チェストプレス",unit:"kg_reps"};

class FakeD1 {
  constructor() {this.sessions=[];this.sets=[];this.progress=[];this.next=1;}
  prepare(sql) {const db=this;return {bind(...args) {return {
    async first() {
      if(sql.startsWith("SELECT s.id FROM workout_sessions s WHERE"))
        return db.sessions.find(s=>s.date===args[0] &&
          db.sets.some(x=>x.session_id===s.id&&x.exercise_name===args[1]) &&
          !db.sets.some(x=>x.session_id===s.id&&x.exercise_name!==args[1]))??null;
      if(sql.startsWith("SELECT s.id FROM workout_sessions s JOIN"))
        return db.sessions.find(s=>s.date===args[0] &&
          db.sets.some(x=>x.session_id===s.id&&x.exercise_name===args[1]))??null;
      if(sql.startsWith("SELECT ws.id FROM workout_sets ws JOIN") && sql.includes("ws.set_number=?"))
        return db.sets.find(x=>x.exercise_name===args[1] &&
          x.set_number===args[2] &&
          db.sessions.some(s=>s.id===x.session_id&&s.date===args[0]))??null;
      if(sql.startsWith("SELECT ws.id FROM workout_sets"))
        return db.sets.find(x=>x.exercise_name===args[1]&&
          db.sessions.some(s=>s.id===x.session_id&&s.date===args[0]))??null;
      if(sql.startsWith("SELECT completed_sets FROM training_mode_exercises"))
        return db.progress.find(x=>x.date===args[0]&&x.name===args[1])??null;
      return null;
    },
    async all() {
      if(sql.startsWith("SELECT ws.exercise_name"))
        return {results:db.sets.filter(x=>db.sessions.some(s=>s.id===x.session_id&&s.date===args[0]))};
      if(sql.startsWith("SELECT exercise_name, finished"))
        return {results:db.progress.filter(x=>x.date===args[0])
          .map(x=>({exercise_name:x.name,finished:x.finished,completed_sets:x.completed_sets}))};
      return {results:[]};
    },
    async run() {
      if(sql.startsWith("INSERT INTO workout_sessions"))
        db.sessions.push({id:args[0],date:args[1]});
      if(sql.startsWith("DELETE FROM workout_sets"))
        db.sets=db.sets.filter(x=>!(x.session_id===args[0] &&
          x.exercise_name===args[1]&&x.set_number===args[2]));
      if(sql.startsWith("INSERT INTO workout_sets"))
        db.sets.push({id:db.next++,session_id:args[0],exercise_name:args[1],set_number:args[2],
          weight_kg:args[3],reps:args[4],entry_unit:args[5],duration_seconds:args[6]});
      if(sql.startsWith("INSERT INTO training_mode_exercises")) {
        let state=db.progress.find(x=>x.date===args[0]&&x.name===args[1]);
        if(!state)db.progress.push(state={date:args[0],name:args[1],finished:0,completed_sets:0});
        state.completed_sets=Math.min(12,state.completed_sets+1);
        state.finished=0;
      }
      if(sql.startsWith("UPDATE training_mode_exercises SET finished=1")) {
        const state=db.progress.find(x=>x.date===args[0]&&x.name===args[1]);
        if(state)state.finished=1;
      }
      return {success:true};
    }
  };}};}
  async batch(tasks) {for(const task of tasks)await task.run();}
}
function request(db,path,method="GET",body) {
  const [pathname,query]=path.split("?");
  const url={pathname,searchParams:{get:key=>query?.split("&")
    .map(part=>part.split("=")).find(pair=>pair[0]===key)?.[1]??null}};
  return handleTrainingModeAPI(db,url,body,method,{validDate,
    readJSON:async value=>({value}),
    respond:(payload,status=200)=>({status,body:payload})});
}

test("validates one set and rejects invalid numbers",()=>{
  assert.equal(normalizeTrainingSet({...base,set_number:1,weight_kg:40,reps:10},validDate).weight_kg,40);
  assert.equal(normalizeTrainingSet({...base,set_number:0,weight_kg:40,reps:10},validDate),null);
  assert.equal(normalizeTrainingSet({...base,set_number:13,weight_kg:40,reps:10},validDate),null);
  assert.equal(normalizeTrainingSet({...base,set_number:1,weight_kg:-1,reps:10},validDate),null);
  assert.equal(normalizeTrainingSet({...base,set_number:1,weight_kg:40,reps:0},validDate),null);
  assert.ok(normalizeTrainingSet({...base,unit:"reps",set_number:1,weight_kg:0,reps:10},validDate));
  assert.ok(normalizeTrainingSet({...base,unit:"seconds",set_number:1,
    weight_kg:0,reps:0,duration_seconds:60},validDate));
});

test("set-by-set saves preserve earlier sets, completion and resumable progress",async()=>{
  const db=new FakeD1();
  assert.equal((await request(db,"/api/training-mode/finish","PUT",base)).status,409);
  const first={...base,set_number:1,weight_kg:40,reps:10};
  const second={...base,set_number:2,weight_kg:40,reps:9};
  assert.equal((await request(db,"/api/training-mode/set","PUT",first)).status,200);
  assert.equal((await request(db,"/api/training-mode/set","PUT",second)).status,200);
  assert.deepEqual(db.sets.map(x=>x.reps),[10,9]);
  assert.equal(db.sessions.length,1);
  assert.equal((await request(db,"/api/training-mode/finish","PUT",base)).status,200);
  assert.equal(db.progress[0].finished,1);
  assert.equal(db.progress[0].completed_sets,2);
  const duplicate=await request(db,"/api/training-mode/set","PUT",{...second,weight_kg:42.5,reps:8});
  assert.equal(duplicate.status,409);
  assert.equal(db.progress[0].completed_sets,2);
  const third={...second,set_number:3,weight_kg:42.5,reps:8};
  assert.equal((await request(db,"/api/training-mode/set","PUT",third)).status,200);
  assert.equal(db.sets.length,3);
  assert.deepEqual(db.sets.map(x=>x.reps),[10,9,8]);
  assert.equal(db.progress[0].finished,0);
  assert.equal(db.progress[0].completed_sets,3);
  const day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.status,200);
  assert.equal(day.body.sets.length,3);
  assert.equal(day.body.progress[0].completed_sets,3);
  assert.equal(day.body.progress[0].finished,0);
});

test("legacy sessions with multiple exercise names are never rewritten",async()=>{
  const db=new FakeD1();
  db.sessions.push({id:"legacy",date});
  db.sets.push({session_id:"legacy",exercise_name:"チェストプレス",set_number:1,reps:10});
  db.sets.push({session_id:"legacy",exercise_name:"アームカール",set_number:1,reps:10});
  const response=await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:1,weight_kg:40,reps:10});
  assert.equal(response.status,409);
  assert.equal(response.body.error,"legacy_session_conflict");
  assert.equal(db.sets.length,2);
});

test("record-only sets never start training mode; next training save appends",async()=>{
  const db=new FakeD1();
  db.sessions.push({id:"record-only",date});
  for(let i=1;i<=3;i++)db.sets.push({id:i,session_id:"record-only",
    exercise_name:"チェストプレス",set_number:i,weight_kg:40,reps:10});
  let day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.sets.length,3);
  assert.equal(day.body.progress.length,0);
  assert.equal((await request(db,"/api/training-mode/finish","PUT",base)).status,409);
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:4,weight_kg:40,reps:10})).status,200);
  day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.sets.length,4);
  assert.equal(day.body.progress[0].completed_sets,1);
  db.sets[0].weight_kg=45; // Record-editor modification must not change mode progress.
  day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.progress[0].completed_sets,1);
  assert.equal((await request(db,"/api/training-mode/finish","PUT",base)).status,200);
  assert.equal(db.progress[0].finished,1);
});
