import test from "node:test";
import assert from "node:assert/strict";
import { dialogueExpressions, expressionForDialogue, resolveDialoguePortrait, pickDialogue } from "../public/shiori-dialogue-expression.js";

test("all forty dialogues have exactly one fixed expression", () => {
  assert.equal(Object.values(dialogueExpressions).reduce((n, a) => n + a.length, 0), 40);
  for (const [group, list] of Object.entries(dialogueExpressions)) {
    list.forEach((value, index) => {
      assert.equal(typeof value, "string");
      assert.equal(expressionForDialogue(group,index), value);
    });
  }
});
test("same dialogue always chooses one expression; avoid identical previous id", () => {
  const lines = [["morning", ["one", "two"]]];
  assert.equal(pickDialogue(lines, () => 0).expression, "normal");
  assert.equal(pickDialogue(lines, () => 0, "morning_001").id, "morning_002");
});
test("outfit-specific fallback never changes outfit", () => {
  const portraits = {
    "private-v1": ["normal","smile"].map(id => ({id,src:"v1/"+id})),
    "private-v2": ["normal","soft_smile"].map(id => ({id,src:"v2/"+id})),
    training: ["normal","wry_smile"].map(id => ({id,src:"gym/"+id})),
    roomwear: ["normal","joy"].map(id => ({id,src:"room/"+id}))
  };
  assert.equal(resolveDialoguePortrait("soft_smile","private-v1",portraits).id,"smile");
  assert.equal(resolveDialoguePortrait("soft_smile","private-v2",portraits).id,"soft_smile");
  assert.equal(resolveDialoguePortrait("wry_smile","training",portraits).id,"wry_smile");
  assert.equal(resolveDialoguePortrait("smile","roomwear",portraits).id,"joy");
  assert.equal(resolveDialoguePortrait("smile","roomwear",portraits,new Set(["room/joy"])).id,"normal");
  assert.equal(resolveDialoguePortrait("smile","roomwear",portraits,new Set(["room/joy","room/normal"])),null);
});
