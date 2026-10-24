import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const mode=readFileSync(new URL("../src/training-mode.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");

test("active means at least one guided set and no explicit exercise finish",()=>{
  assert.match(mode,/tm\.finished=0/);
  assert.match(mode,/ws\.is_completed=1/);
  assert.match(worker,/isTrainingExerciseActive\(env\.DB,body\.performed_on,body\.exercise_name\)/);
});
test("record editor can update active sets in place but never drop saved set IDs",()=>{
  assert.match(worker,/training_mode_active_delete_blocked/);
  assert.match(worker,/persisted\.some\(set=>!savedNumbers\.has\(Number\(set\.set_number\)\)\)/);
  assert.match(worker,/UPDATE workout_sets SET weight_kg=\?,reps=\?,entry_unit=\?,duration_seconds=\?,is_completed=\?/);
});
test("exercise and legacy session deletion are blocked by the API",()=>{
  assert.match(worker,/isTrainingExerciseActive\(env\.DB,date,name\)/);
  assert.match(worker,/JOIN training_mode_exercises tm ON tm\.performed_on=s\.performed_on/);
  assert.match(worker,/if \(activeSets\) return respond\(\{error:"training_mode_active_delete_blocked"\},409\)/);
});
test("record UI disables only the destructive controls while guarded",()=>{
  assert.match(app,/function refreshTrainingDeleteLocks\(date\)/);
  assert.match(app,/trainingDeleteLocksLoading=true/);
  assert.match(app,/button\.disabled=!dbReady \|\| blocked/);
  assert.match(app,/deleteExerciseButton\.disabled=!dbReady \|\| !!blocked/);
  assert.match(app,/if\(isTrainingDeleteBlocked\(container\.exerciseCard\?\.nameInput\.value\)\)return/);
  assert.match(app,/onFinished: \(\) => \{ trainingRecordNeedsReload = true;/);
});
