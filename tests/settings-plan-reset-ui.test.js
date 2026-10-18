import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const script=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const worker=readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");

test("destructive control exists only in authenticated settings page with explanation",()=>{
  const settings=html.slice(html.indexOf('id="page-settings"'),html.indexOf('id="story-test-player"'));
  assert.match(settings,/id="settings-plan-reset-open"/);
  assert.match(settings,/筋トレ記録と来館実績は残ります/);
  assert.match(settings,/id="settings-plan-reset-confirm"[^>]*hidden/);
  assert.match(settings,/id="settings-plan-reset-check"[^>]*disabled/);
  assert.match(settings,/id="settings-plan-reset-execute"[^>]*disabled/);
  assert.match(css,/\.settings-plan-reset-confirm\[hidden\]/);
});
test("UI requires checkbox and server-side explicit destructive confirmation",()=>{
  assert.match(script,/!settingsPlanResetReady\s*\|\|\s*!settingsPlanResetCheck\.checked/);
  assert.match(script,/scope:"plans_only",confirm:"DELETE_ALL_PLANS"/);
  assert.match(worker,/handlePlanResetAPI\(env\.DB,request,method,\{respond,readJSON\}\)/);
  assert.match(worker,/if \(\["POST", "PUT", "PATCH", "DELETE"\]\.includes\(method\) && !sameOriginJSON/);
  assert.match(worker,/if \(!\(await isAuthenticated\(request, env\)\)\)/);
});
test("successful reset refreshes calendar without clearing unsaved workouts",()=>{
  assert.match(script,/await loadWorkouts\(\)/);
  assert.match(script,/if \(authorized && !hasRecordChanges\(\)\) hydrateStoredRecordForDate\(selectedDate\)/);
  assert.match(script,/repeatOccurrence=null/);
});
