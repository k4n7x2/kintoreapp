// 来館は実績へ自動変換しない。休息は明示された日のみ。
export function resolveCalendarIcon({ hasWorkout = false, planned = false, rest = false, attended = false } = {}) {
  // 緑のダンベルは実績数ではなく、ユーザーが登録した来館記録だけで表示する。
  if (attended) return "attended";
  if (hasWorkout) return "workout";
  if (planned) return "planned";
  if (rest) return "rest";
  return "none";
}
