import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

// The actual scene-to-outfit mapping is exercised by gym-presence-ui.test.js.
test("changing development location also refreshes the home portrait", () => {
  const changeLocation = app.match(/function setSceneLocation\(nextLocation\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(changeLocation, "scene changer exists");
  assert.match(changeLocation, /sceneLocation = nextLocation/);
  assert.match(changeLocation, /refreshScene\(\)/);
  assert.match(changeLocation, /refreshOutfit\(\{ reroll: true \}\)/);
  assert.doesNotMatch(app, /currentOutfit|selectOutfit\(/);
});

test("outfit selector is read-only and reflects the effective scene", () => {
  assert.match(html, /id="shiori-outfit"[^>]*disabled/);
  assert.match(html, /value="private-v2">私服/);
  assert.match(app, /outfitSelect\.value = activeOutfit/);
  assert.doesNotMatch(app, /outfitSelect\.addEventListener\("change"/);
});

test("gallery private preview selects street or retains campus instead of roomwear", () => {
  const preview = app.match(/function previewPrivateExpression\(expression\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(preview);
  assert.match(preview, /sceneLocation = "city"/);
  assert.match(preview, /refreshScene\(\)/);
  assert.match(preview, /refreshOutfit\(\{ reroll: true \}\)/);
  assert.match(app, /privateExpressionWrap\.hidden = activeOutfit !== "private-v2"/);
});
