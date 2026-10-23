import test from "node:test";
import assert from "node:assert/strict";
import {validateTemplateDraft} from "../public/saved-template-editor.js";

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
