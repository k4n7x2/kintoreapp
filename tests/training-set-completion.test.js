import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const api=readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const guided=readFileSync(new URL("../src/training-mode.js",import.meta.url),"utf8");
const record=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/0012_workout_set_completion.sql",import.meta.url),"utf8");

test("migration preserves saved sets as checked and supports fresh unchecked sets",()=>{
  assert.match(migration,/ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 1/);
  assert.doesNotMatch(migration,/DELETE FROM|DROP TABLE|UPDATE workout_sets/i);
});
test("record editor shows and persists each set checkbox",()=>{
  assert.match(record,/completion\.type = "checkbox"/);
  assert.match(record,/completion\.checked = set\.is_completed/);
  assert.match(record,/row\.querySelector\("\.set-completed"\)\.checked/);
  assert.match(record,/is_completed: row\.querySelector\("\.set-completed"\)\.checked/);
  assert.match(record,/card\.savedSnapshot !== cardDraftSnapshot\(card\)/);
});
test("manual saved set ID is retained with completion state",()=>{
  assert.match(api,/SELECT id,set_number,is_completed FROM workout_sets/);
  assert.match(api,/UPDATE workout_sets SET weight_kg=\?,reps=\?,entry_unit=\?,duration_seconds=\?,is_completed=\?/);
  assert.match(api,/completionChanged/);
  assert.match(api,/SET finished=0,updated_at=CURRENT_TIMESTAMP/);
});
test("shared flag is fetched by both screens and guided saves mark completed",()=>{
  assert.match(api,/entry_unit, duration_seconds, is_completed/);
  assert.match(guided,/ws\.is_completed/);
  assert.match(guided,/duration_seconds=\?,is_completed=1/);
  assert.match(guided,/VALUES\(\?,\?,\?,\?,\?,\?,\?,1\)/);
  assert.match(guided,/error:"wrong_next_set"/);
});
