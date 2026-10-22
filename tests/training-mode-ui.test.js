import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolvePreviousSet,visibleTrainingSets} from "../public/training-mode.js";

test("exact previous set wins, including same unit filter",()=>{
  const rows=[{set_number:1,entry_unit:"kg_reps",weight_kg:40,reps:10},
    {set_number:2,entry_unit:"kg_reps",weight_kg:37.5,reps:8},
    {set_number:3,entry_unit:"reps",reps:12}];
  assert.deepEqual(resolvePreviousSet(rows,2,"kg_reps"),{set:rows[1],fallback:false});
  assert.deepEqual(resolvePreviousSet(rows,3,"kg_reps"),{set:rows[1],fallback:true});
  assert.deepEqual(resolvePreviousSet(rows,1,"seconds"),{set:null,fallback:false});
});
test("set 4 and beyond use previous last set when no matching number",()=>{
  const rows=[{set_number:1,entry_unit:"kg_reps",weight_kg:40},
    {set_number:2,entry_unit:"kg_reps",weight_kg:42.5},
    {set_number:3,entry_unit:"kg_reps",weight_kg:45}];
  assert.equal(resolvePreviousSet(rows,4,"kg_reps").set.weight_kg,45);
  assert.equal(resolvePreviousSet(rows,4,"kg_reps").fallback,true);
});
test("progress markers stay compact and track additional sets",()=>{
  assert.deepEqual(visibleTrainingSets({targetSets:3},1),[1,2,3]);
  assert.deepEqual(visibleTrainingSets({targetSets:3},4),[1,2,3,4]);
  assert.deepEqual(visibleTrainingSets({targetSets:3},5),[2,3,4,5]);
  assert.deepEqual(visibleTrainingSets({targetSets:1},1),[1]);
  assert.deepEqual(visibleTrainingSets({targetSets:12},12),[9,10,11,12]);
});
test("set view keeps editable steppers with embedded units, without shiori panel",()=>{
  const js=readFileSync(new URL("../public/training-mode.js",import.meta.url),"utf8");
  const css=readFileSync(new URL("../public/training-mode.css",import.meta.url),"utf8");
  assert.match(js,/data-action="step" data-field="weight"/);
  assert.match(js,/data-action="step" data-field="reps"/);
  assert.match(js,/class="tm-stepper-unit"/);
  assert.match(js,/追加セット/);
  assert.match(js,/state\.reps=own\?String\(item\.unit/);
  assert.match(css,/\.tm-data-row\s*\{/);
  assert.match(css,/\.tm-compact-save\s*\{/);
  assert.doesNotMatch(js,/shiori-training-frame/);
});
