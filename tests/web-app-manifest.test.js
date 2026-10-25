import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("Android home-screen icon uses the cropped Shiori face artwork", () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "kintoreapp");
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.equal(manifest.icons.length, 1);
  const icon = manifest.icons[0];
  assert.equal(icon.sizes, "192x192");
  assert.equal(icon.type, "image/webp");
  assert.equal(icon.purpose, "any");
  const bytes = readFileSync(new URL("../public" + icon.src, import.meta.url));
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.toString("ascii", 12, 16), "VP8X");
  assert.equal(bytes.readUIntLE(24, 3) + 1, 192);
  assert.equal(bytes.readUIntLE(27, 3) + 1, 192);
  assert.ok(html.includes('<link rel="icon" type="image/webp" href="' + icon.src + '">'));
});
