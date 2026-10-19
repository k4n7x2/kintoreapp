// Outfit is a function of the effective scene. Wi-Fi can change the scene,
// and a manual scene preview takes precedence. Never combine mismatched clothes.
export const REGULAR_SCENE_LOCATIONS = Object.freeze(["city", "campus", "room"]);
export const SCENE_OUTFITS = Object.freeze({
  gym: "training",
  city: "private-v2",
  campus: "private-v2",
  room: "roomwear"
});

export function resolveGymVisuals({ connected = false, preview = false, scene = "room" } = {}) {
  const automatic = connected === true && preview !== true;
  const requestedScene = Object.hasOwn(SCENE_OUTFITS, scene) ? scene : "room";
  const effectiveScene = automatic ? "gym" : requestedScene;
  return { automatic, scene: effectiveScene, outfit: SCENE_OUTFITS[effectiveScene] };
}

// Use server timestamps to calculate a lease duration; local device clock can be inaccurate.
export function gymLeaseDuration(response) {
  if (response?.connected !== true ||
      !Number.isSafeInteger(response?.expires_at_ms) ||
      !Number.isSafeInteger(response?.server_time_ms)) return 0;
  return Math.max(0, Math.min(30 * 60 * 1000, response.expires_at_ms - response.server_time_ms));
}
