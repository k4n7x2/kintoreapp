import { dailyPrivateOutfit } from "./daily-private-outfit.js?v=20261020-daily-private-v1";

// Outfit is a function of the effective scene. Wi-Fi can change the scene,
// and a manual scene preview takes precedence. Never combine mismatched clothes.
export const REGULAR_SCENE_LOCATIONS = Object.freeze(["city", "campus", "room"]);
export const SCENE_OUTFITS = Object.freeze({
  gym: "training",
  city: "private",
  campus: "private",
  room: "roomwear"
});

export function resolveGymVisuals({ connected = false, preview = false, scene = "room", at = new Date() } = {}) {
  const automatic = connected === true && preview !== true;
  const requestedScene = Object.hasOwn(SCENE_OUTFITS, scene) ? scene : "room";
  const effectiveScene = automatic ? "gym" : requestedScene;
  const kind = SCENE_OUTFITS[effectiveScene];
  return { automatic, scene: effectiveScene, outfit: kind === "private" ? dailyPrivateOutfit(at) : kind };
}

// Use server timestamps to calculate a lease duration; local device clock can be inaccurate.
export function gymLeaseDuration(response) {
  if (response?.connected !== true ||
      !Number.isSafeInteger(response?.expires_at_ms) ||
      !Number.isSafeInteger(response?.server_time_ms)) return 0;
  return Math.max(0, Math.min(30 * 60 * 1000, response.expires_at_ms - response.server_time_ms));
}
