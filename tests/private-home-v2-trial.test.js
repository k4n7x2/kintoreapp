import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const files = [
  {
    "id": "normal",
    "sha": "27f6e49dce05a46765213ca968372cdefe72587f",
    "bytes": 246548
  },
  {
    "id": "smile",
    "sha": "5b8038c32a8368c76a0d090d04a0a99db0889009",
    "bytes": 199912
  },
  {
    "id": "thinking",
    "sha": "a2ba4eaa0f42161333fcee4a6119451293277d91",
    "bytes": 206782
  },
  {
    "id": "surprised",
    "sha": "44dede4aac99fa4e8893932e618bd2d2e7d24f2e",
    "bytes": 212460
  },
  {
    "id": "playful",
    "sha": "e7d64d3cc049be2db249a5f3d810e33a3fe861cb",
    "bytes": 211132
  }
];
const root = new URL("../public/assets/shiori/home/v2/", import.meta.url);

test("private v2 trial images retain exact PR #28 blobs, canvas and alpha", () => {
  for (const {id, sha, bytes} of files) {
    const binary = readFileSync(new URL("shiori-private-home-" + id + "-r1.webp", root));
    assert.equal(binary.length, bytes, id + " size");
    assert.equal(binary.toString("ascii", 0, 4), "RIFF");
    assert.equal(binary.toString("ascii", 8, 12), "WEBP");
    assert.equal(binary.toString("ascii", 12, 16), "VP8X");
    assert.ok(binary[20] & 0x10, id + " transparency flag");
    const width = 1 + binary.readUIntLE(24, 3);
    const height = 1 + binary.readUIntLE(27, 3);
    assert.deepEqual([width,height], [1086,1448], id + " dimensions");
    const objectSha = createHash("sha1")
      .update("blob " + binary.length + "\\0")
      .update(binary).digest("hex");
    assert.equal(objectSha, sha, id + " original Git blob SHA");
  }
});

test("private v2 gallery items and home image paths are aligned", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/data/shiori-gallery.json", import.meta.url), "utf8"));
  const group = catalog.groups.find(({ id }) => id === "private-v2");
  assert.equal(group.status,"trial-unapproved");
  assert.deepEqual(group.items.map(({ id })=>id), files.map(({id})=>id));
  const app = readFileSync(new URL("../public/app.js", import.meta.url),"utf8");
  const css = readFileSync(new URL("../public/styles.css", import.meta.url),"utf8");
  for (const {id} of files) {
    const path = "/assets/shiori/home/v2/shiori-private-home-" + id + "-r1.webp";
    assert.equal(group.items.find(item=>item.id===id).versions.current,path);
  }
  assert.match(app,/home\\/v2\\/shiori-private-home-/);
  assert.match(css,/data-outfit="private-v2"/);
  assert.match(app,/privateExpressionMode === "random"/);
});
