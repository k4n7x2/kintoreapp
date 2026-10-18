import test from "node:test";
import assert from "node:assert/strict";
import {matchesSeries,validateWorkoutSnapshot} from "../src/workout-repeat-rule.js";

const rule=(starts_on,cadence="weekly",every_n=1,ends_on=null)=>
  ({starts_on,cadence,every_n,ends_on});
test("weekly clones the exact weekday only",()=>{
  assert.equal(matchesSeries("2026-10-20",rule("2026-10-20")),true);
  assert.equal(matchesSeries("2026-10-21",rule("2026-10-20")),false);
  assert.equal(matchesSeries("2026-10-27",rule("2026-10-20")),true);
});
test("fortnightly and daily recurrence",()=>{
  assert.equal(matchesSeries("2026-10-27",rule("2026-10-20","weekly",2)),false);
  assert.equal(matchesSeries("2026-11-03",rule("2026-10-20","weekly",2)),true);
  assert.equal(matchesSeries("2026-10-22",rule("2026-10-20","daily",2)),true);
  assert.equal(matchesSeries("2026-10-23",rule("2026-10-20","daily",2)),false);
});
test("monthly 31st skips months without 31st, with end date",()=>{
  assert.equal(matchesSeries("2026-11-30",rule("2026-10-31","monthly")),false);
  assert.equal(matchesSeries("2026-12-31",rule("2026-10-31","monthly")),true);
  assert.equal(matchesSeries("2027-01-31",rule("2026-10-31","monthly",1,"2026-12-31")),false);
});
test("full snapshot retains units, order, numeric values, and per-exercise notes",()=>{
  const input=[
    {name:"チェストプレス",unit:"kg_reps",note:"肩甲骨",sets:[
      {weight_kg:30,reps:10,duration_seconds:0},{weight_kg:32.5,reps:8,duration_seconds:0}]},
    {name:"プランク",unit:"seconds",note:"姿勢",sets:[
      {weight_kg:0,reps:0,duration_seconds:45}]}];
  assert.deepEqual(validateWorkoutSnapshot(input),input);
});
test("reject malformed or duplicate input without truncation",()=>{
  const valid={name:"チェストプレス",unit:"kg_reps",note:"",
    sets:[{weight_kg:30,reps:10,duration_seconds:0}]};
  assert.equal(validateWorkoutSnapshot([]),null);
  assert.equal(validateWorkoutSnapshot([valid,{...valid,name:"チェスト プレス"}]),null);
  assert.equal(validateWorkoutSnapshot([{...valid,sets:[]}]),null);
  assert.equal(validateWorkoutSnapshot([{...valid,sets:[{weight_kg:NaN,reps:10,duration_seconds:0}]}]),null);
  assert.equal(validateWorkoutSnapshot([{...valid,note:"x".repeat(301)}]),null);
});
