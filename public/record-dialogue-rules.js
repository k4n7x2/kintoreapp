// 記録比較とカレンダー条件の純粋関数。D1やDOMへのアクセスは行わない。
const units = new Set(["kg_reps", "reps", "seconds"]);
const general = "record.saved_general";
const incomparable = "record.no_comparison";

function orderedSets(sets, current = false) {
  if (!Array.isArray(sets) || !sets.length || sets.length > 12) return null;
  const mapped = sets.map((set, index) => ({
    ...set, number: current ? index + 1 : Number(set?.set_number)
  })).sort((a, b) => a.number - b.number);
  if (mapped.some((set, i) => set.number !== i + 1)) return null;
  return mapped;
}
function validNumber(value) {
  return value !== null && value !== undefined && value !== "" &&
    Number.isFinite(Number(value));
}
function direction(current, previous) {
  if (!validNumber(current) || !validNumber(previous)) return null;
  return Math.sign(Number(current) - Number(previous));
}
function combine(values) {
  if (values.includes(null)) return null;
  const plus = values.includes(1), minus = values.includes(-1);
  if (plus && minus) return "mixed";
  return plus ? "up" : minus ? "down" : "same";
}

/**
 * 前回は選択日より前の同名種目をAPIから取得する。新規保存と更新済みの
 * 当日レコードは比較しない。比較不能と方向混在は区別して一般文へ逃がす。
 */
export function classifyRecordChange({ unit, sets, previousSets, performedOn }) {
  if (!units.has(unit)) return incomparable;
  const now = orderedSets(sets, true);
  const before = orderedSets(previousSets);
  if (!now || !Array.isArray(previousSets) || !previousSets.length) return incomparable;
  if (!before) return incomparable;
  if (now.length !== before.length) return general;
  if (before.some(set => (set.entry_unit ?? "kg_reps") !== unit ||
    (performedOn && (!set.performed_on || set.performed_on >= performedOn)))) {
    return incomparable;
  }
  const weight = [], reps = [], seconds = [];
  for (let i = 0; i < now.length; i++) {
    if (unit === "kg_reps") weight.push(direction(now[i].weight_kg, before[i].weight_kg));
    if (unit !== "seconds") reps.push(direction(now[i].reps, before[i].reps));
    if (unit === "seconds") seconds.push(direction(now[i].duration_seconds, before[i].duration_seconds));
  }
  const w = unit === "kg_reps" ? combine(weight) : "same";
  const r = unit !== "seconds" ? combine(reps) : "same";
  const s = unit === "seconds" ? combine(seconds) : "same";
  if ([w, r, s].includes(null)) return incomparable;
  if ([w, r, s].includes("mixed")) return general;
  if (unit === "seconds") return s === "same" ? "record.unchanged" : "record.seconds_" + s;
  if (unit === "reps") return r === "same" ? "record.unchanged" : "record.reps_" + r;
  if (w === "same" && r === "same") return "record.unchanged";
  if (w === "same") return "record.reps_" + r;
  if (r === "same") return "record.weight_" + w;
  if (w === r) return "record.both_" + w;
  return "record.weight_" + w + "_reps_" + r;
}

// 当日の再保存や数値を変えない既存記録の保存は、新規の数値向上としない。
export function chooseRecordSaveGroup({ samePersisted = false, alreadySaved = false, ...comparison }) {
  return samePersisted || alreadySaved ? "record.saved_general" :
    classifyRecordChange(comparison);
}

export function savedNumericSnapshot(unit, sets) {
  return JSON.stringify((sets || []).map(set => [
    unit === "kg_reps" ? Number(set.weight_kg) : 0,
    unit === "seconds" ? 0 : Number(set.reps),
    unit === "seconds" ? Number(set.duration_seconds) : 0
  ]));
}

/** 状態の未取得と「空」を別扱いにする。月はYYYY-MMで現地年月を比較。 */
export function calendarConditionGroups({
  month, localMonth, recordsKnown, calendarKnown, hasPlan, hasAttendance,
  hasWorkout, truncated = false
}) {
  const conditions = [];
  if (calendarKnown && hasPlan) conditions.push("calendar.has_plan");
  if (calendarKnown && hasAttendance) conditions.push("calendar.has_attendance");
  if (recordsKnown && hasWorkout) conditions.push("calendar.has_workout");
  if (recordsKnown && calendarKnown && !truncated &&
      !hasPlan && !hasAttendance && !hasWorkout) conditions.push("calendar.empty_month");
  if (month < localMonth) conditions.push("calendar.past_month");
  if (month > localMonth) conditions.push("calendar.future_month");
  return conditions;
}
