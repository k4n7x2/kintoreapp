import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolveTrainingTargetSets} from "../public/training-mode.js";

const worker=readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const modeAPI=readFileSync(new URL("../src/training-mode.js",import.meta.url),"utf8");
const modeUI=readFileSync(new URL("../public/training-mode.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/0013_training_record_set_targets.sql",import.meta.url),"utf8");

test("record editor writes its number of rows atomically with its workout",()=>{
  assert.match(worker,/const saveSetTarget=env\.DB\.prepare/);
  assert.match(worker,/configured_sets=excluded\.configured_sets/);
  assert.match(worker,/\.bind\(body\.performed_on,body\.exercise_name,body\.sets\.length\)/);
  const saveStatementCount=worker.split(/\s+saveSetTarget\s*\n/).length-1;
  assert.equal(saveStatementCount,2); // existing and new session branches
});

test("guided day returns explicit target from the same D1 progress row",()=>{
  assert.match(modeAPI,/SELECT exercise_name, finished, completed_sets, configured_sets/);
  assert.match(modeUI,/progress\?\.configured_sets/);
  assert.match(modeUI,/item\.targetSets=resolveTrainingTargetSets\(/);
});

test("old record-only target is kept when first guided set starts",()=>{
  assert.match(modeAPI,/const existingModeState=await db\.prepare/);
  assert.match(modeAPI,/const inferredRecordTarget=canInferTarget && recordedNumbers\.length/);
  assert.match(modeAPI,/\.bind\(date,name,inferredRecordTarget\)/);
  assert.equal(resolveTrainingTargetSets(3,[{set_number:1},{set_number:2}],null,false),2);
  assert.equal(resolveTrainingTargetSets(3,[{set_number:1},{set_number:2}],2,true),2);
  assert.equal(resolveTrainingTargetSets(3,[{set_number:1}],null,true),3);
});

test("migration adds nullable target but never rewrites existing workout data",()=>{
  assert.match(migration,/ADD COLUMN configured_sets INTEGER DEFAULT NULL/);
  assert.doesNotMatch(migration,/DROP |DELETE |UPDATE /i);
});
