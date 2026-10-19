// Gym Wi-Fi presence changes the home scene only. No attendance or workout records.
export const REGULAR_SCENE_LOCATIONS = Object.freeze(["city", "campus", "room"]);

export function resolveGymVisuals({ connected = false, preview = false, scene = "room", outfit = "roomwear" } = {}) {
  const automatic = connected === true && preview !== true;
  return {
    automatic,
    scene: automatic ? "gym" : scene,
    outfit: automatic ? "training" : outfit
  };
}

// Use server timestamps to calculate a lease duration; local device clock can be inaccurate.
export function gymLeaseDuration(response) {
  if (response?.connected !== true ||
      !Number.isSafeInteger(response?.expires_at_ms) ||
      !Number.isSafeInteger(response?.server_time_ms)) return 0;
  return Math.max(0, Math.min(30 * 60 * 1000, response.expires_at_ms - response.server_time_ms));
}
