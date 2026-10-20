import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html = readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

test("changing development location refreshes both scene and portrait", () => {
  const fn=app.match(/function setSceneLocation\(nextLocation\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(fn);
  assert.match(fn,/sceneLocation = nextLocation/);
  assert.match(fn,/refreshScene\(\)/);
  assert.match(fn,/refreshOutfit\(\{ reroll: true \}\)/);
  assert.doesNotMatch(app,/currentOutfit|selectOutfit\(/);
});
test("readonly outfit selector reflects v1/v2 resolved day (never manually chosen)", () => {
  assert.match(html,/id="shiori-outfit"[^>]*disabled/);
  assert.match(html,/value="private-v1">私服/);
  assert.match(html,/value="private-v2">私服/);
  assert.match(app,/outfitSelect\.value = activeOutfit/);
  assert.doesNotMatch(app,/outfitSelect\.addEventListener\("change"/);
});
test("gallery private expression preview keeps daily clothes, retains campus or selects street", () => {
  const fn=app.match(/function previewPrivateExpression\(expression, outfit\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(fn);
  assert.match(fn,/outfit !== dailyPrivateOutfit\(\)/);
  assert.match(fn,/sceneLocation = "city"/);
  assert.match(fn,/refreshScene\(\)/);
  assert.match(fn,/refreshOutfit\(\{ reroll: true \}\)/);
  assert.match(app,/privateExpressionWrap.hidden = !isPrivateOutfit\(activeOutfit\)/);
});
