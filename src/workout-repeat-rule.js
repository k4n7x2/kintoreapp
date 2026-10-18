// Pure recurrence mathematics: dates are validated ISO calendar days in 2000..2100.
export function dayNumber(date) {
  const [y,m,d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y,m-1,d) / 86400000);
}
export function matchesSeries(date, row) {
  if (date < row.starts_on || (row.ends_on && date > row.ends_on)) return false;
  const difference = dayNumber(date) - dayNumber(row.starts_on);
  if (difference < 0) return false;
  if (row.cadence === "daily") return difference % row.every_n === 0;
  if (row.cadence === "weekly") return difference % (7 * row.every_n) === 0;
  if (row.cadence === "monthly") {
    const [sy,sm,sd] = row.starts_on.split("-").map(Number);
    const [y,m,d] = date.split("-").map(Number);
    return d === sd && ((y-sy)*12 + m-sm) % row.every_n === 0;
  }
  return false;
}
export function validateWorkoutSnapshot(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;
  const normalized = [], seen = new Set();
  for (const raw of value) {
    if (!raw || typeof raw.name !== "string" || typeof raw.note !== "string" ||
        raw.note.length > 300 || !["kg_reps","reps","seconds"].includes(raw.unit) ||
        !Array.isArray(raw.sets) || raw.sets.length < 1 || raw.sets.length > 12) return null;
    const name = raw.name.normalize("NFKC").replace(/[\s\u3000]+/g,"").toLowerCase();
    if (!name || name.length > 60 || seen.has(name)) return null;
    seen.add(name);
    const sets=[];
    for (const set of raw.sets) {
      if (!set || !Number.isFinite(set.weight_kg) || set.weight_kg < 0 || set.weight_kg > 2000 ||
          !Number.isInteger(set.reps) || set.reps < 0 || set.reps > 1000 ||
          !Number.isInteger(set.duration_seconds) || set.duration_seconds < 0 || set.duration_seconds > 36000) return null;
      if (raw.unit === "seconds" && set.duration_seconds < 1) return null;
      sets.push({weight_kg:raw.unit==="kg_reps"?set.weight_kg:0,
        reps:raw.unit==="seconds"?0:set.reps,
        duration_seconds:raw.unit==="seconds"?set.duration_seconds:0});
    }
    normalized.push({name,unit:raw.unit,note:raw.note,sets});
  }
  return normalized;
}

// 0007 stores JSON, so newer status-aware payloads need no schema migration.
// Legacy rows are plain exercise arrays and must continue to mean a gym workout.
export function validateRepeatContent(value) {
  if (Array.isArray(value)) {
    const exercises = validateWorkoutSnapshot(value);
    return exercises ? {kind:"gym",exercises} : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.kind === "rest") {
    return Array.isArray(value.exercises) && value.exercises.length === 0
      ? {kind:"rest",exercises:[]} : null;
  }
  if (value.kind !== "gym" || !Array.isArray(value.exercises)) return null;
  if (value.exercises.length === 0) return {kind:"gym",exercises:[]};
  const exercises = validateWorkoutSnapshot(value.exercises);
  return exercises ? {kind:"gym",exercises} : null;
}
