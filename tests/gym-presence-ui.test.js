import test from "node:test";
import assert from "node:assert/strict";
import { REGULAR_SCENE_LOCATIONS, SCENE_OUTFITS, resolveGymVisuals, gymLeaseDuration } from "../public/gym-presence-ui.js";

test("regular backgrounds do not include gym and every location has one outfit", () => {
  assert.deepEqual([...REGULAR_SCENE_LOCATIONS], ["city", "campus", "room"]);
  assert.deepEqual(SCENE_OUTFITS, { gym: "training", city: "private-v2", campus: "private-v2", room: "roomwear" });
  for (const scene of ["gym", "city", "campus", "room"]) {
    assert.deepEqual(resolveGymVisuals({ scene }),
      { automatic: false, scene, outfit: SCENE_OUTFITS[scene] });
  }
});
test("Wi-Fi overrides scene and outfit, and disconnect restores the corresponding clothes", () => {
  assert.deepEqual(resolveGymVisuals({ connected: true, scene: "campus" }),
    { automatic: true, scene: "gym", outfit: "training" });
  assert.deepEqual(resolveGymVisuals({ connected: false, scene: "campus" }),
    { automatic: false, scene: "campus", outfit: "private-v2" });
});
test("development preview selects scene and cannot independently change clothes", () => {
  assert.deepEqual(resolveGymVisuals({ connected: true, preview: true, scene: "city", outfit: "training" }),
    { automatic: false, scene: "city", outfit: "private-v2" });
  assert.deepEqual(resolveGymVisuals({ connected: true, preview: true, scene: "room", outfit: "training" }),
    { automatic: false, scene: "room", outfit: "roomwear" });
  assert.deepEqual(resolveGymVisuals({ scene: "unexpected" }),
    { automatic: false, scene: "room", outfit: "roomwear" });
});
test("invalid lease expires safely without relying on local clock", () => {
  const now = 1792411000000;
  assert.equal(gymLeaseDuration({ connected: true, expires_at_ms: now + 120000, server_time_ms: now }), 120000);
  assert.equal(gymLeaseDuration({ connected: false, expires_at_ms: now + 120000, server_time_ms: now }), 0);
  assert.equal(gymLeaseDuration({ connected: true, expires_at_ms: null, server_time_ms: now }), 0);
  assert.equal(gymLeaseDuration({ connected: true, expires_at_ms: now + 99999999, server_time_ms: now }), 1800000);
});
