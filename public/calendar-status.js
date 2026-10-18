// 来館は実績へ自動変換しない。休息は明示された日のみ。
export function resolveCalendarIcon({ hasWorkout = false, planned = false, rest = false } = {}) {
  if (hasWorkout) return "workout";
  if (planned) return "planned";
  if (rest) return "rest";
  return "none";
}
