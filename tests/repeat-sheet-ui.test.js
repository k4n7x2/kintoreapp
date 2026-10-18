import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url),"utf8");
const js = readFileSync(new URL("../public/app.js", import.meta.url),"utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url),"utf8");
const between = (s,a,b) => s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));

test("single-row repeat entry is in workout overview, separate from day status settings",()=>{
  const overview = between(html, 'id="record-overview-view"', 'id="exercise-picker-view"');
  const dailyPlan = between(html, 'id="record-plan-panel"', 'id="day-attended"');
  assert.match(overview, /id="repeat-trigger"/);
  assert.doesNotMatch(dailyPlan, /id="repeat-cadence"|class="repeat-editor"/);
  assert.match(html, /aria-controls="repeat-sheet"/);
});
test("sheet has a distinct form and post-action edit scope choices",()=>{
  assert.match(html, /id="repeat-sheet" class="repeat-sheet" hidden/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /id="repeat-sheet-form"/);
  assert.match(html, /id="repeat-scope-panel" class="repeat-scope-panel" hidden/);
  for(const scope of ["only","future","all"]) assert.match(html,new RegExp('data-repeat-scope="'+scope+'"'));
  assert.doesNotMatch(html,/id="repeat-scope"\s*>/);
  assert.match(js,/repeatSave.addEventListener\("click",\(\)=>repeatOccurrence \? chooseRepeatScope\("PATCH"\)/);
  assert.match(js,/repeatDelete.addEventListener\("click",\(\)=>chooseRepeatScope\("DELETE"\)/);
});
test("dialog closes on backdrop, Escape, navigation, date change and logout",()=>{
  assert.match(js,/repeatSheetBackdrop.addEventListener\("click",\(\)=>closeRepeatSheet\(\)\)/);
  assert.match(js,/event.key === "Escape"[\s\S]{0,80}closeRepeatSheet\(\)/);
  assert.match(js,/if \(repeatSheetOpen && screen !== "record"\) closeRepeatSheet\(false\)/);
  assert.match(js,/closeRepeatSheet\(false\);\s*const previousMonth = currentMonth\(\)/);
  assert.match(js,/if \(!next\) closeRepeatSheet\(false\)/);
});
test("styles guarantee hidden, touch friendly, reduced motion and safe-area",()=>{
  assert.match(css,/\.repeat-sheet\[hidden\]/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/min-height:56px/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test("the same bottom sheet accepts rest and no-exercise gym planning",()=>{
  assert.match(js,/function snapshotRepeatDay\(\)/);
  assert.match(js,/dayRest\.checked\) return \{kind:"rest",exercises:\[\]\}/);
  assert.match(js,/if \(!exercises\.length && !dayPlanned\.checked\)/);
  assert.match(js,/return \{kind:"gym",exercises\}/);
  assert.match(js,/repeatSheetPreview\.textContent[\s\S]*?dayRest\.checked[\s\S]*?dayPlanned\.checked/);
  assert.match(html,/休息日／ジム予定／入力済み種目/);
});
