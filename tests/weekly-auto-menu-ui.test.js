import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");
const server=readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const reset=readFileSync(new URL("../src/plan-reset.js",import.meta.url),"utf8");

test("weekly schedule and menu management are separate from performed workout entry",()=>{
  assert.match(html,/id="weekly-setup-days"/);
  assert.match(html,/id="weekly-templates-list"/);
  assert.match(html,/id="record-template-open"/);
  assert.match(html,/id="record-linked-template"/);
  assert.match(html,/id="record-template-form" hidden/);
  assert.match(js,/starts_on:todayISO\(\),slots/);
});
test("linked weekly menu is applied on day open without manual pick",()=>{
  assert.match(js,/async function loadRepeatForDate\(date\)/);
  assert.match(js,/currentState\?\.source==="weekly-template"/);
  assert.match(js,/fetchJSON\("\/api\/training-setup\/day\?date="/);
  assert.match(js,/hasRecordChanges\(\)/);
  assert.match(js,/addExercise\(name,rows,item.note\|\|"",false,item.unit\)/);
  assert.match(js,/markRecordBaseline\(\)/);
});
test("template is saved from exercise configuration and not completed records",()=>{
  assert.match(js,/card\.rows\.querySelectorAll\("\.exercise-set"\)\.length/);
  assert.match(js,/method:"POST",headers:\{"Content-Type":"application\/json"\}/);
  assert.doesNotMatch(js,/localStorage\.setItem\([^\n]*template/);
});
test("old repeating snapshots cannot be created from the new UI",()=>{
  assert.match(js,/repeatTrigger\.hidden = !existing \|\| calendarDays\.get\(selectedDate\)\?\.source==="weekly-template"/);
  assert.match(css,/\.record-repeat-trigger\[hidden\]/);
});
test("plan reset covers weekly rule but preserves menu templates",()=>{
  assert.match(reset,/"gym_weekly_slots"/);
  assert.match(reset,/DELETE FROM gym_weekly_slots/);
  assert.doesNotMatch(reset,/DELETE FROM workout_menu_templates/);
});
test("new APIs still use authenticated JSON same-origin routing",()=>{
  assert.match(server,/handleTrainingSetupAPI\(env\.DB,url,request,method/);
  assert.match(server,/sameOriginJSON\(request, url\)/);
  assert.match(server,/isAuthenticated\(request, env\)/);
});
