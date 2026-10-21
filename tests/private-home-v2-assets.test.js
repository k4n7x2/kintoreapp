import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const expected = {
  normal: ["da3b5bcce9a69fd1f495a91dd8f33652f12c0ff0",259126],
  smile: ["e7c0bc131922bab6fb16ddef253c9feb5a10d3bc",212370],
  thinking: ["4c36fca4e91a107357c8a90c4eca9a7bebfb0dd2",220832],
  surprised: ["0d9ec3584c027d0bbff82c216ffee9222ee0a268",227886],
  playful: ["e36024f737c483b2f32c89ba1a89836981e4df2d",194632],
  soft_smile: ["25e9b121264e67994dafb3d6622fb277f504fe55",201142],
  closed_eye_smile: ["19592cf927eb31f58dce3c559e624eaa015f0cfa",202152],
  sleepy: ["1e607bc2e81fc822767ef85fe872925e48fc2016",204892],
  shy: ["9c838cb9e02bd04c4c7a41a248b80bd11bfebdab",204124]
};
test("new town v2 exact registered WebP blobs, final playful, alpha and dimensions", () => {
  for (const [id,[sha,size]] of Object.entries(expected)) {
    const binary=readFileSync(new URL(`../public/assets/shiori/town/v2/shiori-town-home-${id}-r1.webp`,import.meta.url));
    assert.equal(binary.length,size);
    assert.equal(binary.toString("ascii",0,4),"RIFF");
    assert.equal(binary.toString("ascii",8,12),"WEBP");
    assert.equal(binary.toString("ascii",12,16),"VP8X");
    assert.ok(binary[20]&0x10);
    assert.deepEqual([binary.readUIntLE(24,3)+1,binary.readUIntLE(27,3)+1],[1086,1448]);
    assert.equal(createHash("sha1").update("blob "+binary.length).update(Buffer.from([0])).update(binary).digest("hex"),sha);
  }
});
