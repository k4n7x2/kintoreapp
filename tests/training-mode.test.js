import test from "node:test";
import assert from "node:assert/strict";
import {normalizeTrainingSet,handleTrainingModeAPI,isTrainingExerciseActive} from "../src/training-mode.js";

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
      if(sql.startsWith("SELECT ws.id, ws.session_id, ws.is_completed FROM workout_sets ws JOIN"))
        return db.sets.find(x=>x.exercise_name===args[1] &&
          x.set_number===args[2] &&
          db.sessions.some(s=>s.id===x.session_id&&s.date===args[0]))??null;
      if(sql.startsWith("SELECT 1 AS active FROM training_mode_exercises"))
        return db.progress.find(x=>x.date===args[0]&&x.name===args[1] &&
          !x.finished && db.sets.some(row=>row.exercise_name===args[1] &&
            Number(row.is_completed)===1 && db.sessions.some(session=>session.id===row.session_id&&session.date===args[0])))??null;
      if(sql.startsWith("SELECT ws.id FROM workout_sets"))
        return db.sets.find(x=>x.exercise_name===args[1]&&
          db.sessions.some(s=>s.id===x.session_id&&s.date===args[0]))??null;
      if(sql.startsWith("SELECT COUNT(*) AS checked"))
        return {checked:db.sets.filter(x=>x.exercise_name===args[1] &&
          Number(x.is_completed)===1 && db.sessions.some(s=>s.id===x.session_id&&s.date===args[0])).length};
      if(sql.startsWith("SELECT configured_sets FROM training_mode_exercises"))
        return db.progress.find(x=>x.date===args[0]&&x.name===args[1])??null;
      if(sql.startsWith("SELECT completed_sets FROM training_mode_exercises"))
        return db.progress.find(x=>x.date===args[0]&&x.name===args[1])??null;
      return null;
    },
    async all() {
      if(sql.startsWith("SELECT ws.exercise_name"))
        return {results:db.sets.filter(x=>db.sessions.some(s=>s.id===x.session_id&&s.date===args[0]))};
      if(sql.startsWith("SELECT ws.set_number, ws.is_completed FROM workout_sets"))
        return {results:db.sets.filter(x=>x.exercise_name===args[1]&&db.sessions.some(s=>s.id===x.session_id&&s.date===args[0]))};
      if(sql.startsWith("SELECT exercise_name, finished"))
        return {results:db.progress.filter(x=>x.date===args[0])
          .map(x=>({exercise_name:x.name,finished:x.finished,completed_sets:x.completed_sets,
            configured_sets:x.configured_sets}))};
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
          weight_kg:args[3],reps:args[4],entry_unit:args[5],duration_seconds:args[6],is_completed:1});
      if(sql.startsWith("UPDATE workout_sets SET weight_kg=")) {
        const row=db.sets.find(x=>x.id===args[4]&&x.session_id===args[5]&&x.exercise_name===args[6]&&x.set_number===args[7]);
        if(!row)throw Error("missing target set");
        row.weight_kg=args[0];row.reps=args[1];row.entry_unit=args[2];row.duration_seconds=args[3];
        row.is_completed=1;
      }
      if(sql.startsWith("INSERT INTO training_mode_exercises")) {
        let state=db.progress.find(x=>x.date===args[0]&&x.name===args[1]);
        if(!state)db.progress.push(state={date:args[0],name:args[1],finished:0,
          completed_sets:0,configured_sets:args[2]??null});
        if(sql.includes("VALUES(?,?,1,0)"))state.finished=1;
        else {
          state.completed_sets=Math.min(12,state.completed_sets+1);state.finished=0;
          if(state.configured_sets==null && args[2]!=null)state.configured_sets=args[2];
        }
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
  const first={...base,set_number:1,expected_completed_sets:0,weight_kg:40,reps:10};
  const second={...base,set_number:2,expected_completed_sets:1,weight_kg:40,reps:9};
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
  const third={...second,set_number:3,expected_completed_sets:2,weight_kg:42.5,reps:8};
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
    {...base,set_number:1,expected_completed_sets:0,weight_kg:40,reps:10});
  assert.equal(response.status,409);
  assert.equal(response.body.error,"legacy_session_conflict");
  assert.equal(db.sets.length,2);
});

test("preexisting manual sets require confirmation and share matching set numbers",async()=>{
  const db=new FakeD1();
  db.sessions.push({id:"record-only",date});
  for(let i=1;i<=3;i++)db.sets.push({id:i,session_id:"record-only",
    exercise_name:"チェストプレス",set_number:i,weight_kg:40,reps:10,is_completed:0});
  db.next=4;
  let day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.sets.length,3);
  assert.equal(day.body.progress.length,0);
  assert.equal((await request(db,"/api/training-mode/finish","PUT",base)).status,409);
  const first={...base,set_number:1,expected_completed_sets:0,weight_kg:42.5,reps:9};
  assert.equal((await request(db,"/api/training-mode/set","PUT",first)).status,409);
  assert.equal(db.sets[0].weight_kg,40);
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...first,replace_set_id:1})).status,200);
  day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.sets.length,3); // No phantom 4th set.
  assert.deepEqual(db.sets.map(x=>x.set_number),[1,2,3]);
  assert.equal(db.sets[0].weight_kg,42.5);
  assert.equal(db.sets[0].id,1); // Same persisted set was updated.
  assert.equal(day.body.progress[0].completed_sets,1);
  assert.ok(await isTrainingExerciseActive(db,date,base.exercise_name));
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...first,replace_set_id:1})).status,409); // Stale progress.
  const second={...base,set_number:2,expected_completed_sets:1,weight_kg:45,reps:8};
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...second,replace_set_id:999})).status,409);
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...second,replace_set_id:2})).status,200);
  day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.progress[0].completed_sets,2);
  db.sets[0].weight_kg=47.5; // Record-editor correction must not change mode progress.
  day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.progress[0].completed_sets,2);
  assert.equal((await request(db,"/api/training-mode/finish","PUT",base)).status,200);
  assert.equal(db.progress[0].finished,1);
  assert.equal(await isTrainingExerciseActive(db,date,base.exercise_name),false);
});

test("set number must equal the guided progress number",async()=>{
  const db=new FakeD1();
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:2,expected_completed_sets:0,weight_kg:40,reps:10})).status,409);
  assert.equal(db.sets.length,0);
});

test("nonconsecutive completed checks guide the next set into the unchecked gap",async()=>{
  const db=new FakeD1();
  db.sessions.push({id:"manual",date});
  for(let i=1;i<=3;i++)db.sets.push({id:i,session_id:"manual",
    exercise_name:"チェストプレス",set_number:i,weight_kg:40,reps:10,is_completed:i===2?0:1});
  db.next=4;
  let day=await request(db,"/api/training-mode/day?date="+date);
  assert.deepEqual(day.body.sets.map(row=>row.is_completed),[1,0,1]);
  const payload={...base,set_number:2,expected_completed_sets:2,
    replace_set_id:2,weight_kg:45,reps:8};
  assert.equal((await request(db,"/api/training-mode/set","PUT",payload)).status,200);
  day=await request(db,"/api/training-mode/day?date="+date);
  assert.deepEqual(day.body.sets.map(row=>row.is_completed),[1,1,1]);
  assert.equal(db.sets.length,3);
  assert.equal(db.sets[1].weight_kg,45);
  assert.equal((await request(db,"/api/training-mode/finish","PUT",base)).status,200);
  assert.equal(db.progress[0].finished,1);
});

test("historical completed sets remain complete, and the next guided set is 4",async()=>{
  const db=new FakeD1();
  db.sessions.push({id:"manual",date});
  for(let i=1;i<=3;i++)db.sets.push({id:i,session_id:"manual",
    exercise_name:"チェストプレス",set_number:i,weight_kg:40,reps:10,is_completed:1});
  db.next=4;
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:1,expected_completed_sets:3,replace_set_id:1,weight_kg:40,reps:10})).status,409);
  assert.equal((await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:4,expected_completed_sets:3,weight_kg:42.5,reps:8})).status,200);
  assert.deepEqual(db.sets.map(x=>x.set_number),[1,2,3,4]);
});

test("first guided set preserves legacy manual record target of two sets",async()=>{
  const db=new FakeD1();
  db.sessions.push({id:"record-only",date});
  db.sets.push(
    {id:1,session_id:"record-only",exercise_name:"チェストプレス",set_number:1,
      weight_kg:35,reps:10,entry_unit:"kg_reps",is_completed:0},
    {id:2,session_id:"record-only",exercise_name:"チェストプレス",set_number:2,
      weight_kg:35,reps:10,entry_unit:"kg_reps",is_completed:0}
  );
  const result=await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:1,replace_set_id:1,expected_completed_sets:0,weight_kg:35,reps:10});
  assert.equal(result.status,200);
  assert.equal(db.progress[0].configured_sets,2);
  const day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.progress[0].configured_sets,2);
  assert.deepEqual(day.body.sets.map(x=>x.is_completed),[1,0]);
});

test("first mode-only set does not replace scheduled three-set target",async()=>{
  const db=new FakeD1();
  const result=await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:1,expected_completed_sets:0,weight_kg:35,reps:10});
  assert.equal(result.status,200);
  assert.equal(db.progress[0].configured_sets,null);
  const day=await request(db,"/api/training-mode/day?date="+date);
  assert.equal(day.body.progress[0].configured_sets,null);
});

test("legacy progress row with extra unchecked record rows keeps the record target",async()=>{
  const db=new FakeD1();
  db.sessions.push({id:"manual-with-progress",date});
  db.sets.push(
    {id:1,session_id:"manual-with-progress",exercise_name:"チェストプレス",
      set_number:1,weight_kg:35,reps:10,is_completed:1},
    {id:2,session_id:"manual-with-progress",exercise_name:"チェストプレス",
      set_number:2,weight_kg:35,reps:10,is_completed:0}
  );
  db.progress.push({date,name:"チェストプレス",finished:0,completed_sets:1,configured_sets:null});
  const result=await request(db,"/api/training-mode/set","PUT",
    {...base,set_number:2,replace_set_id:2,expected_completed_sets:1,weight_kg:35,reps:8});
  assert.equal(result.status,200);
  assert.equal(db.progress[0].configured_sets,2);
  assert.equal(db.sets.length,2);
});
