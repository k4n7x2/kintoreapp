// Authenticated settings-only operation. All plan types are cleared together,
// while performed workout sessions, attendance, and exercise catalog are untouched.
const PLAN_TABLES = [
  "gym_calendar_days",
  "gym_plan_rules",
  "gym_plan_overrides",
  "workout_repeat_series",
  "workout_repeat_exceptions",
  "gym_weekly_slots"
];

async function planInventory(db) {
  const rows = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (" +
      PLAN_TABLES.map(() => "?").join(",") + ")"
  ).bind(...PLAN_TABLES).all();
  const present = new Set((rows.results ?? []).map(row => row.name));
  const counts = {
    singlePlans: 0, restDays: 0, legacyRules: 0,
    legacyExceptions: 0, repeatSeries: 0, repeatExceptions: 0, weeklySlots: 0
  };
  let hasRest = false;
  if (present.has("gym_calendar_days")) {
    const columns = await db.prepare("PRAGMA table_info(gym_calendar_days)").all();
    hasRest = (columns.results ?? []).some(column => column.name === "rest");
    const statement = hasRest
      ? "SELECT SUM(CASE WHEN planned = 1 THEN 1 ELSE 0 END) AS plans, " +
        "SUM(CASE WHEN rest = 1 THEN 1 ELSE 0 END) AS rests FROM gym_calendar_days"
      : "SELECT SUM(CASE WHEN planned = 1 THEN 1 ELSE 0 END) AS plans FROM gym_calendar_days";
    const row = await db.prepare(statement).first();
    counts.singlePlans = Number(row?.plans ?? 0);
    counts.restDays = hasRest ? Number(row?.rests ?? 0) : 0;
  }
  const tables = [
    ["gym_plan_rules","legacyRules"],
    ["gym_plan_overrides","legacyExceptions"],
    ["workout_repeat_series","repeatSeries"],
    ["workout_repeat_exceptions","repeatExceptions"],
    ["gym_weekly_slots","weeklySlots"]
  ];
  for (const [table, key] of tables) {
    if (!present.has(table)) continue;
    // Identifiers come from a static allowlist, never from request input.
    const row = await db.prepare("SELECT COUNT(*) AS total FROM " + table).first();
    counts[key] = Number(row?.total ?? 0);
  }
  return {present,hasRest,counts};
}

export async function handlePlanResetAPI(db,request,method,{respond,readJSON}) {
  if (method !== "GET" && method !== "POST")
    return respond({error:"method_not_allowed"},405);
  const inventory = await planInventory(db);
  if (method === "GET") return respond({counts:inventory.counts});
  const parsed = await readJSON(request,256);
  if (parsed.error) return respond({error:parsed.error},parsed.status);
  if (parsed.value?.confirm !== "DELETE_ALL_PLANS" ||
      parsed.value?.scope !== "plans_only")
    return respond({error:"confirmation_required"},400);
  const {present,hasRest,counts} = inventory;
  const statements=[];
  if (present.has("gym_weekly_slots"))
    statements.push(db.prepare("DELETE FROM gym_weekly_slots"));
  if (present.has("workout_repeat_exceptions"))
    statements.push(db.prepare("DELETE FROM workout_repeat_exceptions"));
  if (present.has("workout_repeat_series"))
    statements.push(db.prepare("DELETE FROM workout_repeat_series"));
  if (present.has("gym_plan_overrides"))
    statements.push(db.prepare("DELETE FROM gym_plan_overrides"));
  if (present.has("gym_plan_rules"))
    statements.push(db.prepare("DELETE FROM gym_plan_rules"));
  if (present.has("gym_calendar_days")) {
    // Non-attendance rows hold only plan/rest state: delete them entirely.
    statements.push(db.prepare("DELETE FROM gym_calendar_days WHERE attended = 0"));
    // An attended day must survive; clear only its scheduling flags.
    statements.push(db.prepare(hasRest
      ? "UPDATE gym_calendar_days SET planned = 0, rest = 0, updated_at = CURRENT_TIMESTAMP WHERE attended = 1"
      : "UPDATE gym_calendar_days SET planned = 0, updated_at = CURRENT_TIMESTAMP WHERE attended = 1"));
  }
  if (statements.length) await db.batch(statements);
  return respond({cleared:true,counts,attendance_preserved:true,workouts_preserved:true});
}
