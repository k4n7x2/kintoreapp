import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseSdTouchGroup, registerSdTap, chooseLineWithoutRepeat, isValidSdTouchData, SD_TOUCH_CONFIG
} from "../public/sd-touch-rules.js";

const script = readFileSync(new URL("../docs/shiori/dialogues/sd-touch-v0.1.md", import.meta.url), "utf8");
const data = JSON.parse(readFileSync(new URL("../public/data/shiori-sd-touch-v0.1.json", import.meta.url), "utf8"));
const expected = {"touch.normal":[],"touch.record":[],"touch.calendar":[],"touch.analysis":[],"touch.repeat":[],"touch.rare":[]};
const tick = String.fromCharCode(96);
const linePattern = new RegExp("^- " + tick + "(touch\\.[a-z]+\\.\\d{2})" + tick + " (.+)$", "gm");
for (const [, id, text] of script.matchAll(linePattern)) {
  expected[id.slice(0, id.lastIndexOf("."))].push({id, text});
}
test("台本の30本・6条件グループがIDと本文まで完全一致", () => {
  assert.equal(isValidSdTouchData(data), true);
  assert.deepEqual(data.groups, expected);
  assert.deepEqual(Object.values(data.groups).map(rows => rows.length), [12,4,4,4,4,2]);
});
test("欠落・余分なグループ・重複本文・不正IDは不採用", () => {
  assert.equal(isValidSdTouchData({...data,groups:{...data.groups,"touch.extra":[]}}), false);
  const missing = structuredClone(data);
  missing.groups["touch.normal"].pop();
  assert.equal(isValidSdTouchData(missing), false);
  const duplicate = structuredClone(data);
  duplicate.groups["touch.rare"][0].text = duplicate.groups["touch.normal"][0].text;
  assert.equal(isValidSdTouchData(duplicate), false);
  const badId = structuredClone(data);
  badId.groups["touch.analysis"][0].id = "touch.analysis.99";
  assert.equal(isValidSdTouchData(badId), false);
});
test("60%・35%・5%の境界と画面切替", () => {
  for(const page of ["record","calendar","analysis"]) {
    assert.equal(chooseSdTouchGroup(page,0), "touch.normal");
    assert.equal(chooseSdTouchGroup(page,0.599999), "touch.normal");
    assert.equal(chooseSdTouchGroup(page,0.6), "touch."+page);
    assert.equal(chooseSdTouchGroup(page,0.949999), "touch."+page);
    assert.equal(chooseSdTouchGroup(page,0.95), "touch.rare");
    assert.equal(chooseSdTouchGroup(page,0.999999), "touch.rare");
    assert.equal(chooseSdTouchGroup(page,0,true), "touch.repeat");
  }
  assert.equal(chooseSdTouchGroup("home",0),null);
  assert.equal(SD_TOUCH_CONFIG.normalWeight+SD_TOUCH_CONFIG.screenWeight+SD_TOUCH_CONFIG.rareWeight,1);
});
test("5秒以内の3回目からrepeat、5秒窓外では通常", () => {
  let state=registerSdTap([],1000);
  assert.equal(state.repeat,false);
  state=registerSdTap(state.history,5999);
  assert.equal(state.repeat,false);
  state=registerSdTap(state.history,6000);
  assert.equal(state.repeat,true);
  state=registerSdTap([],1000);
  state=registerSdTap(state.history,6001);
  state=registerSdTap(state.history,11002);
  assert.equal(state.repeat,false);
});
test("8秒以上の無操作で履歴リセット、時刻逆転にも耐える", () => {
  let state=registerSdTap([1000,1100,1200],9200);
  assert.deepEqual(state,{history:[9200],repeat:false});
  state=registerSdTap([1000,1100,1200],500);
  assert.deepEqual(state,{history:[500],repeat:false});
  state=registerSdTap([1000,1100,1200],9199);
  assert.deepEqual(state,{history:[9199],repeat:false});
});
test("長時間連打でもメモリ履歴は64件以下", () => {
  let state={history:[]};
  for(let i=0;i<150;i++)state=registerSdTap(state.history,1000+i*10);
  assert.equal(state.history.length,64);
  assert.equal(state.repeat,true);
});
test("直前との重複抑制と固定フォールバック", () => {
  const rows=[{text:"ん？ 呼んだ？"},{text:"あ、どうしたの？"}];
  assert.equal(chooseLineWithoutRepeat(rows,"ん？ 呼んだ？","fallback",0),"あ、どうしたの？");
  assert.equal(chooseLineWithoutRepeat(rows,"あ、どうしたの？","fallback",0),"ん？ 呼んだ？");
  assert.equal(chooseLineWithoutRepeat([],"","ん？ 呼んだ？",0),"ん？ 呼んだ？");
  assert.equal(chooseLineWithoutRepeat([{text:"ひとつ"}],"ひとつ","fallback",0),"ひとつ");
});
