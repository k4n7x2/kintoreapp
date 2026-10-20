// Deterministic Tokyo-calendar-day outfit schedule. This anchor/mapping must
// remain immutable across deployments. Add future outfits only using a new
// effective-date epoch, never by changing this two-version historical mapping.
const DAY_MS = 86_400_000;
const JST_MS = 9 * 60 * 60 * 1000;
const ANCHOR_DAY = Date.UTC(2026, 9, 20) / DAY_MS;

export function tokyoDateKey(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(at);
  const field = (name) => parts.find((part) => part.type === name)?.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
}

export function dailyPrivateOutfit(at = new Date()) {
  const [y, m, d] = tokyoDateKey(at).split("-").map(Number);
  return (Date.UTC(y, m - 1, d) / DAY_MS - ANCHOR_DAY) % 2 === 0
    ? "private-v2" : "private-v1";
}

export function millisecondsUntilNextTokyoMidnight(at = new Date()) {
  const [y, m, d] = tokyoDateKey(at).split("-").map(Number);
  return Math.max(1, Date.UTC(y, m - 1, d + 1) - JST_MS - at.getTime());
}

export function isPrivateOutfit(outfit) {
  return outfit === "private-v1" || outfit === "private-v2";
}
