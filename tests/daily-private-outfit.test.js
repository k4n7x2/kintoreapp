import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { tokyoDateKey, dailyPrivateOutfit, millisecondsUntilNextTokyoMidnight } from "../public/daily-private-outfit.js";
import { choosePortraitVariant } from "../public/home-portrait-selection.js";
import { resolveGymVisuals } from "../public/gym-presence-ui.js";
const jst = (day, time) => new Date(`${day}T${time}+09:00`);
const outfitFor = (scene, at, connected = false, preview = false) =>
  resolveGymVisuals({ scene, at, connected, preview }).outfit;

test("Asia/Tokyo date changes precisely at JST midnight", () => {
  const before = new Date("2026-10-20T14:59:59.999Z");
  const after = new Date("2026-10-20T15:00:00.000Z");
  assert.equal(tokyoDateKey(before), "2026-10-20");
  assert.equal(tokyoDateKey(after), "2026-10-21");
  assert.equal(millisecondsUntilNextTokyoMidnight(before), 1);
  assert.equal(dailyPrivateOutfit(before), "private-v2");
  assert.equal(dailyPrivateOutfit(after), "private-v1");
  assert.equal(dailyPrivateOutfit(jst("2026-10-22","12:00:00")), "private-v2");
  assert.equal(dailyPrivateOutfit(jst("2027-01-01","00:00:00")),dailyPrivateOutfit(new Date("2026-12-31T15:00:00Z")));
});

test("ten opens, reload, re-login, device changes or deploy do not affect outfit", () => {
  const at = jst("2026-10-20","12:34:56");
  for (let i=0;i<10;i++) {
    assert.equal(dailyPrivateOutfit(new Date(at.getTime())), "private-v2");
    assert.equal(outfitFor("city",new Date(at.getTime())), "private-v2");
  }
  assert.equal(outfitFor("city",at),outfitFor("campus",at));
  assert.equal(outfitFor("gym",at),"training");
  assert.equal(outfitFor("city",at),"private-v2");
  assert.equal(outfitFor("room",at),"roomwear");
  assert.equal(outfitFor("city",at),"private-v2");
  assert.equal(outfitFor("city",at,true),"training");
  assert.equal(outfitFor("city",at,true,true),"private-v2");
  assert.equal(outfitFor("city",at,false),"private-v2");
  assert.equal(outfitFor("city",jst("2026-10-21","08:00:00")),"private-v1");
});

test("expression rerolls independently and failed pictures never switch outfits", () => {
  for (const outfit of ["private-v1","private-v2"]) {
    const versions = ["normal","smile","thinking","surprised","playful"]
      .map(id=>({id,src:`${outfit}/${id}`,outfit}));
    let last = choosePortraitVariant(versions,null,true,()=>0);
    for (let i=0;i<12;i++) {
      const next = choosePortraitVariant(versions,last,true,()=>i%2===0?0:0.99);
      assert.notEqual(next.src,last.src);
      assert.equal(next.outfit,outfit);
      last=next;
    }
    const available=versions.slice(1);
    assert.equal(choosePortraitVariant(available,versions[0],true,()=>0).outfit,outfit);
    assert.equal(choosePortraitVariant([],last,true),null);
    assert.equal(choosePortraitVariant([versions[0]],versions[0],true,()=>0),versions[0]);
  }
});

test("both five-expression sets are registered under correct immutable paths", () => {
  const catalog=JSON.parse(readFileSync(new URL("../public/data/shiori-gallery.json",import.meta.url),"utf8"));
  const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
  for (const [id,folder,prefix] of [
    ["private-v1","home/v2","shiori-private-home"],
    ["private-v2","town/v2","shiori-town-home"]
  ]) {
    const group=catalog.groups.find(g=>g.id===id);
    assert.ok(group);
    assert.deepEqual(group.items.map(i=>i.id),["normal","smile","thinking","surprised","playful"]);
    for (const item of group.items) {
      const path=`/assets/shiori/${folder}/${prefix}-${item.id}-r1.webp`;
      assert.equal(item.versions.current,path);
      assert.ok(existsSync(new URL("../public"+path,import.meta.url)),path);
    }
    assert.match(html,new RegExp('data-gallery-group="'+id+'"'));
  }
  assert.match(app,/if \(!homePortraits\[outfit\]/);
  assert.match(app,/outfit !== dailyPrivateOutfit\(\)/);
  assert.match(app,/new Event\("shiori:daily-private-changed"\)/);
});
