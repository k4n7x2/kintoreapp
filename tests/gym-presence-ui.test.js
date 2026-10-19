import test from "node:test";
import assert from "node:assert/strict";
import { REGULAR_SCENE_LOCATIONS, resolveGymVisuals, gymLeaseDuration } from "../public/gym-presence-ui.js";

test("non-gym backgrounds never include the gym", () => {
  assert.deepEqual([...REGULAR_SCENE_LOCATIONS], ["city", "campus", "room"]);
});
test("gym presence changes both scene and clothing and OFF restores chosen defaults", () => {
  assert.deepEqual(resolveGymVisuals({ connected:true, scene:"room", outfit:"roomwear" }),
    { automatic:true, scene:"gym", outfit:"training" });
  assert.deepEqual(resolveGymVisuals({ connected:false, scene:"room", outfit:"roomwear" }),
    { automatic:false, scene:"room", outfit:"roomwear" });
});
test("development preview can inspect a manually selected scene or outfit", () => {
  assert.deepEqual(resolveGymVisuals({ connected:true, preview:true, scene:"city", outfit:"private-v2" }),
    { automatic:false, scene:"city", outfit:"private-v2" });
});
test("invalid lease expires safely without relying on local clock", () => {
  const now=1792411000000;
  assert.equal(gymLeaseDuration({ connected:true, expires_at_ms:now+120000, server_time_ms:now }),120000);
  assert.equal(gymLeaseDuration({ connected:false, expires_at_ms:now+120000, server_time_ms:now }),0);
  assert.equal(gymLeaseDuration({ connected:true, expires_at_ms:null, server_time_ms:now }),0);
  assert.equal(gymLeaseDuration({ connected:true, expires_at_ms:now+99999999, server_time_ms:now }),1800000);
});
