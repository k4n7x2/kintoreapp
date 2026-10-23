import test from "node:test";
import assert from "node:assert/strict";
import {validateTemplateDraft,templateExerciseCandidates,filterTemplateCandidates} from "../public/saved-template-editor.js";

const item={name:"チェストプレス",unit:"kg_reps",sets:"2",note:""};
test("editor accepts menu edits and converts the set count to a number",()=>{
  const result=validateTemplateDraft({title:" 胸の日 ",items:[item]});
  assert.equal(result.error,undefined);
  assert.equal(result.value.title,"胸の日");
  assert.deepEqual(result.value.items,[{...item,sets:2}]);
});
test("editor rejects duplicates and zero or excessive sets",()=>{
  assert.match(validateTemplateDraft({title:"test",items:[
    item,{name:"チェスト プレス",unit:"kg_reps",sets:"2",note:""}
  ]}).error,/重複/);
  assert.match(validateTemplateDraft({title:"test",items:[{...item,sets:"0"}]}).error,/セット数/);
  assert.match(validateTemplateDraft({title:"test",items:[{...item,sets:"13"}]}).error,/セット数/);
});
test("editor rejects empty recipes and retains existing notes and unit choices",()=>{
  assert.ok(validateTemplateDraft({title:"test",items:[]}).error);
  assert.ok(validateTemplateDraft({title:" ",items:[item]}).error);
  assert.deepEqual(validateTemplateDraft({title:"脚",items:[
    {name:"ランジ",unit:"reps",sets:"3",note:"丁寧に"},
    {name:"プランク",unit:"seconds",sets:"2",note:""}
  ]}).value.items,[
    {name:"ランジ",unit:"reps",sets:3,note:"丁寧に"},
    {name:"プランク",unit:"seconds",sets:2,note:""}
  ]);
});

test("picker merges exercise catalog and performed exercise names without duplicates",()=>{
  const list=templateExerciseCandidates({
    catalog:[
      {name:"チェストプレス",body_part:"胸",unit:"kg_reps"},
      {name:"プランク",body_part:"体幹",unit:"seconds"}
    ],
    recorded:["チェストプレス"," ロータリートーソ "],
    exercises:["プランク","レッグプレス"]
  });
  assert.equal(list.length,4);
  assert.equal(list.find(x=>x.name==="チェストプレス").recorded,true);
  assert.equal(list.find(x=>x.name==="プランク").unit,"seconds");
  assert.equal(list.find(x=>x.name==="ロータリートーソ").recorded,true);
  assert.equal(list.find(x=>x.name==="レッグプレス").recorded,false);
});
test("picker body-part and search filters exclude duplicate menu exercises",()=>{
  const candidates=templateExerciseCandidates({
    catalog:[
      {name:"チェストプレス",body_part:"胸",unit:"kg_reps"},
      {name:"ペクトラル",body_part:"胸",unit:"kg_reps"},
      {name:"アームカール",body_part:"腕",unit:"kg_reps"}
    ]
  });
  assert.deepEqual(filterTemplateCandidates(candidates,"胸","プレス",[], "").map(x=>x.name),["チェストプレス"]);
  assert.deepEqual(filterTemplateCandidates(candidates,"胸","",["チェストプレス"],"").map(x=>x.name),["ペクトラル"]);
  assert.deepEqual(filterTemplateCandidates(candidates,"胸","",["チェストプレス"],"チェストプレス").map(x=>x.name),
    ["チェストプレス","ペクトラル"]);
});
test("changing a menu via picker does not alter saved weight or workout data",()=>{
  const edited=validateTemplateDraft({title:"胸・肩",items:[
    {name:"ペクトラル",unit:"kg_reps",sets:"3",note:"フォーム意識"},
    {name:"ショルダープレス",unit:"kg_reps",sets:"2",note:""}
  ]});
  assert.equal(edited.error,undefined);
  assert.equal(Object.keys(edited.value.items[0]).includes("weight_kg"),false);
  assert.equal(edited.value.items.length,2);
});
