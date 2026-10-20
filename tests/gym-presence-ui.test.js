import test from "node:test";
import assert from "node:assert/strict";
import { REGULAR_SCENE_LOCATIONS, SCENE_OUTFITS, resolveGymVisuals, gymLeaseDuration } from "../public/gym-presence-ui.js";
const morning = new Date("2026-10-20T09:00:00+09:00");
const nextDay = new Date("2026-10-21T09:00:00+09:00");

test("all scenes keep exactly one logical clothing category", () => {
  assert.deepEqual([...REGULAR_SCENE_LOCATIONS], ["city","campus","room"]);
  assert.deepEqual(SCENE_OUTFITS, {gym:"training",city:"private",campus:"private",room:"roomwear"});
  for (const scene of ["gym","city","campus","room"]) {
    const outfit = scene==="gym"?"training":scene==="room"?"roomwear":"private-v2";
    assert.deepEqual(resolveGymVisuals({scene,at:morning}),{automatic:false,scene,outfit});
  }
});
test("Wi-Fi overrides, disconnect resumes today's clothes and preview takes precedence", () => {
  assert.deepEqual(resolveGymVisuals({connected:true,scene:"campus",at:morning}),
    {automatic:true,scene:"gym",outfit:"training"});
  assert.deepEqual(resolveGymVisuals({connected:false,scene:"campus",at:morning}),
    {automatic:false,scene:"campus",outfit:"private-v2"});
  assert.deepEqual(resolveGymVisuals({connected:true,preview:true,scene:"city",at:morning}),
    {automatic:false,scene:"city",outfit:"private-v2"});
  assert.deepEqual(resolveGymVisuals({connected:false,scene:"campus",at:nextDay}),
    {automatic:false,scene:"campus",outfit:"private-v1"});
  assert.deepEqual(resolveGymVisuals({connected:true,preview:true,scene:"room",at:morning}),
    {automatic:false,scene:"room",outfit:"roomwear"});
  assert.deepEqual(resolveGymVisuals({scene:"unexpected",at:morning}),
    {automatic:false,scene:"room",outfit:"roomwear"});
});
test("invalid lease expires without relying on local clock", () => {
  const now = 1792411000000;
  assert.equal(gymLeaseDuration({connected:true,expires_at_ms:now+120000,server_time_ms:now}),120000);
  assert.equal(gymLeaseDuration({connected:false,expires_at_ms:now+120000,server_time_ms:now}),0);
  assert.equal(gymLeaseDuration({connected:true,expires_at_ms:null,server_time_ms:now}),0);
  assert.equal(gymLeaseDuration({connected:true,expires_at_ms:now+99999999,server_time_ms:now}),1800000);
});
