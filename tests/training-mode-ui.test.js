import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolvePreviousSet,initialTrainingSetValues,visibleTrainingSets,completedTrainingSets,nextTrainingSetNumber,resolveTrainingTargetSets} from "../public/training-mode.js";

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
  assert.match(js,/initialTrainingSetValues\(item,state\.setNumber\)/);
  assert.match(css,/\.tm-data-row\s*\{/);
  assert.match(css,/\.tm-compact-save\s*\{/);
  assert.doesNotMatch(js,/shiori-training-frame/);
});

test("reps prefill from matching previous set for first and later sets",()=>{
  const item={unit:"kg_reps",sets:[],previous:[
    {set_number:1,entry_unit:"kg_reps",weight_kg:40,reps:10},
    {set_number:2,entry_unit:"kg_reps",weight_kg:42.5,reps:8},
    {set_number:3,entry_unit:"kg_reps",weight_kg:42.5,reps:7}
  ]};
  assert.deepEqual(initialTrainingSetValues(item,1),{weight:"40",reps:"10"});
  assert.deepEqual(initialTrainingSetValues(item,2),{weight:"42.5",reps:"8"});
  assert.deepEqual(initialTrainingSetValues(item,3),{weight:"42.5",reps:"7"});
});
test("extra sets inherit previous final set's weight and reps",()=>{
  const item={unit:"kg_reps",sets:[],previous:[
    {set_number:1,entry_unit:"kg_reps",weight_kg:35,reps:12},
    {set_number:3,entry_unit:"kg_reps",weight_kg:40,reps:8}
  ]};
  assert.deepEqual(initialTrainingSetValues(item,4),{weight:"40",reps:"8"});
  assert.deepEqual(initialTrainingSetValues(item,5),{weight:"40",reps:"8"});
});
test("saved same-day set takes priority over previous-session defaults",()=>{
  const item={unit:"kg_reps",
    sets:[{set_number:2,weight_kg:30,reps:12}],
    previous:[{set_number:2,entry_unit:"kg_reps",weight_kg:35,reps:9}]
  };
  assert.deepEqual(initialTrainingSetValues(item,2),{weight:"30",reps:"12"});
});
test("no prior reps remains blank; zero reps are not prefilled",()=>{
  assert.deepEqual(initialTrainingSetValues({unit:"kg_reps",sets:[],previous:[]},1),{weight:"0",reps:""});
  assert.deepEqual(initialTrainingSetValues({unit:"kg_reps",sets:[],previous:[{set_number:1,entry_unit:"kg_reps",weight_kg:30,reps:0}]},1),{weight:"30",reps:""});
});
test("reps-only and seconds exercises prefill their corresponding units",()=>{
  const bodyweight={unit:"reps",sets:[],previous:[{set_number:1,entry_unit:"reps",weight_kg:0,reps:15}]};
  const time={unit:"seconds",sets:[],previous:[{set_number:1,entry_unit:"seconds",weight_kg:0,reps:0,duration_seconds:60}]};
  assert.deepEqual(initialTrainingSetValues(bodyweight,1),{weight:"0",reps:"15"});
  assert.deepEqual(initialTrainingSetValues(time,1),{weight:"0",reps:"60"});
});

test("training status and set markers use independent mode-only progress",()=>{
  const js=readFileSync(new URL("../public/training-mode.js",import.meta.url),"utf8");
  assert.match(js,/const count=item\.sets\.length,modeCount=item\.modeSets/);
  assert.match(js,/const status=finished\?"完了":modeCount\?"途中"/);
  assert.match(js,/const saved=item\.sets\.some/);
  assert.match(js,/item\.modeSets=completedTrainingSets\(item\)/);
  assert.match(js,/state\.setNumber=nextTrainingSetNumber\(item\)/);
  assert.match(js,/expected_completed_sets:item\.modeSets/);
  assert.match(js,/replace_set_id:Number\(existing\.id\)/);
  assert.match(js,/if\(!confirm\(/);
});

test("set completion uses checked flags, including gaps and historic sets",()=>{
  const item={sets:[
    {set_number:1,is_completed:1},
    {set_number:2,is_completed:0},
    {set_number:3,is_completed:1}
  ]};
  assert.equal(completedTrainingSets(item),2);
  assert.equal(nextTrainingSetNumber(item),2);
  item.sets[1].is_completed=1;
  assert.equal(nextTrainingSetNumber(item),4);
  assert.equal(completedTrainingSets({sets:[]}),0);
  assert.equal(nextTrainingSetNumber({sets:Array.from({length:12},(_,i)=>({set_number:i+1,is_completed:1}))}),13);
});

test("record-editor set count overrides template and remains stable after guided saves",()=>{
  const manual=[{set_number:1,is_completed:0},{set_number:2,is_completed:0}];
  assert.equal(resolveTrainingTargetSets(3,manual,2,false),2);
  assert.equal(resolveTrainingTargetSets(3,manual,2,true),2);
  assert.equal(resolveTrainingTargetSets(3,manual,null,false),2); // existing record-only day
  assert.equal(resolveTrainingTargetSets(3,manual,null,true),2); // old manual unchecked rows
  assert.equal(resolveTrainingTargetSets(2,manual,4,true),4); // record changed to 4
  assert.equal(resolveTrainingTargetSets(3,[],null,false),3); // no saved record: weekly plan
  assert.equal(resolveTrainingTargetSets(3,[{set_number:1,is_completed:1}],null,true),3);
  assert.equal(resolveTrainingTargetSets(3,[
    {set_number:1,is_completed:1},{set_number:2,is_completed:0}],null,true),2);
  assert.equal(resolveTrainingTargetSets(2,[{set_number:1,is_completed:1},
    {set_number:2,is_completed:1},{set_number:3,is_completed:1}],null,true),3);
});

test("target display uses record-set override rather than inflating to completed count",()=>{
  const js=readFileSync(new URL("../public/training-mode.js",import.meta.url),"utf8");
  assert.match(js,/item\.targetSets=resolveTrainingTargetSets\(/);
  assert.match(js,/\$\{modeCount\} \/ \$\{item\.targetSets\} セット/);
});
