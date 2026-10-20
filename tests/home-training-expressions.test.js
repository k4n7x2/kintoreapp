import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const gallery = JSON.parse(readFileSync(new URL("../public/data/shiori-gallery.json", import.meta.url), "utf8"));
const group = gallery.groups.find(({ id }) => id === "story");
const expressions = [
  ["normal", "normal-alt1-before", "before"],
  ["thinking", "thinking-alt1", "current"],
  ["surprised", "surprised-alt1", "current"],
  ["smile", "smile-alt1", "current"],
  ["playful", "playful-alt1", "current"]
];

test("training portraits reuse all five adopted gym story assets", () => {
  assert.equal(expressions.length, 5);
  for (const [id, file, version] of expressions) {
    const path = `/assets/shiori/gim/v1/shiori-gim-story-${file}.webp`;
    assert.ok(existsSync(new URL("../public" + path, import.meta.url)), path);
    assert.match(app, new RegExp('id: "' + id + '", label: "[^"]+", file: "' + file + '"'));
    const item = group.items.find(item => item.id === id);
    assert.ok(item, "gallery entry for " + id);
    assert.equal(item.versions[version], path, "adopted asset for " + id);
  }
  assert.match(app, /training: trainingVariantDefinitions\.map/);
});

test("training home rerolls on tap and revisit and handles image failures", () => {
  assert.match(app, /outfit === "roomwear" \|\| outfit === "training"/);
  assert.match(app, /\["roomwear", "training"\]\.includes\(currentGymVisuals\(\)\.outfit\)/);
  assert.match(app, /homePortraits\[outfit\]/);
  assert.match(app, /failedHomePortraits\.add\(currentPortrait\.src\)/);
  assert.match(app, /choosePortraitVariant\(candidates, currentPortrait, reroll\)/);
});
