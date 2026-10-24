// Training mode writes one completed set at a time. Existing record-editor APIs remain unchanged.
export function normalizeTrainingSet(value, validDate) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !validDate(value.performed_on) || typeof value.exercise_name !== "string") return null;
  const name = value.exercise_name.normalize("NFKC").replace(/[\s\u3000]+/g, "").toLowerCase();
  const unit = value.unit ?? "kg_reps";
  const number = value.set_number;
  const weight = value.weight_kg ?? 0;
  const reps = value.reps ?? 0;
  const seconds = value.duration_seconds ?? 0;
  if (!name || name.length > 60 ||
      !["kg_reps", "reps", "seconds"].includes(unit) ||
      !Number.isInteger(number) || number < 1 || number > 12 ||
      typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 2000 ||
      !Number.isInteger(reps) || reps < 0 || reps > 1000 ||
      !Number.isInteger(seconds) || seconds < 0 || seconds > 36000 ||
      (unit === "kg_reps" && (reps < 1 || seconds !== 0)) ||
      (unit === "reps" && (weight !== 0 || reps < 1 || seconds !== 0)) ||
      (unit === "seconds" && (weight !== 0 || reps !== 0 || seconds < 1))) return null;
  return { performed_on: value.performed_on, exercise_name: name,
    unit, set_number: number, weight_kg: weight, reps, duration_seconds: seconds };
}

async function readDay(db, date) {
  const [sets, states] = await Promise.all([
    db.prepare("SELECT ws.exercise_name, ws.set_number, ws.weight_kg, ws.reps, " +
      "ws.entry_unit, ws.duration_seconds, s.updated_at, s.created_at, ws.id " +
      "FROM workout_sets ws JOIN workout_sessions s ON s.id=ws.session_id " +
      "WHERE s.performed_on=? ORDER BY s.updated_at DESC, s.created_at DESC, ws.id DESC LIMIT 500")
      .bind(date).all(),
    db.prepare("SELECT exercise_name, finished, completed_sets FROM training_mode_exercises WHERE performed_on=?")
      .bind(date).all()
  ]);
  return { date, sets: sets.results ?? [], progress: states.results ?? [],
    truncated: (sets.results ?? []).length === 500 };
}

export async function handleTrainingModeAPI(db, url, request, method,
    {respond, validDate, readJSON}) {
  if (url.pathname === "/api/training-mode/day" && method === "GET") {
    const date = url.searchParams.get("date");
    if (!validDate(date)) return respond({error:"invalid_date"}, 400);
    return respond(await readDay(db, date));
  }
  if (url.pathname === "/api/training-mode/set" && method === "PUT") {
    const parsed = await readJSON(request);
    if (parsed.error) return respond({error:parsed.error}, parsed.status);
    const data = normalizeTrainingSet(parsed.value, validDate);
    if (!data) return respond({error:"invalid_training_set"}, 400);
    const {performed_on:date, exercise_name:name, set_number:number,
      unit, weight_kg:weight, reps, duration_seconds:seconds} = data;
    const exclusive = await db.prepare(
      "SELECT s.id FROM workout_sessions s WHERE s.performed_on=? " +
      "AND EXISTS (SELECT 1 FROM workout_sets ws WHERE ws.session_id=s.id AND ws.exercise_name=?) " +
      "AND NOT EXISTS (SELECT 1 FROM workout_sets ws WHERE ws.session_id=s.id AND ws.exercise_name<>?) " +
      "ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC LIMIT 1"
    ).bind(date,name,name).first();
    if (!exclusive) {
      // Never split or silently overwrite sets inside an old multi-exercise session.
      const legacy = await db.prepare(
        "SELECT s.id FROM workout_sessions s JOIN workout_sets ws ON ws.session_id=s.id " +
        "WHERE s.performed_on=? AND ws.exercise_name=? LIMIT 1"
      ).bind(date,name).first();
      if (legacy) return respond({error:"legacy_session_conflict"},409);
    }
    // Training mode always adds a new set; it must not overwrite an existing record.
    const occupied = await db.prepare(
      "SELECT ws.id FROM workout_sets ws JOIN workout_sessions s ON s.id=ws.session_id " +
      "WHERE s.performed_on=? AND ws.exercise_name=? AND ws.set_number=? LIMIT 1"
    ).bind(date,name,number).first();
    if (occupied) return respond({error:"set_number_conflict"},409);
    const id = exclusive?.id ?? crypto.randomUUID();
    const writes = [];
    if (exclusive) {
      writes.push(db.prepare("UPDATE workout_sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id));
    } else {
      writes.push(db.prepare(
        "INSERT INTO workout_sessions(id,performed_on,note) VALUES(?,?,'')"
      ).bind(id,date));
    }
    writes.push(db.prepare(
      "INSERT INTO workout_sets(session_id,exercise_name,set_number,weight_kg,reps,entry_unit,duration_seconds) " +
      "VALUES(?,?,?,?,?,?,?)"
    ).bind(id,name,number,weight,reps,unit,seconds));
    writes.push(db.prepare(
      "INSERT INTO training_mode_exercises(performed_on,exercise_name,finished,completed_sets) VALUES(?,?,0,1) " +
      "ON CONFLICT(performed_on,exercise_name) DO UPDATE SET " +
      "finished=0,completed_sets=MIN(12,completed_sets+1),updated_at=CURRENT_TIMESTAMP"
    ).bind(date,name));
    await db.batch(writes);
    return respond({saved:true, set_number:number, exercise_name:name});
  }
  if (url.pathname === "/api/training-mode/finish" && method === "PUT") {
    const parsed = await readJSON(request);
    if (parsed.error) return respond({error:parsed.error}, parsed.status);
    const date = parsed.value?.performed_on;
    const raw = parsed.value?.exercise_name;
    if (!validDate(date) || typeof raw !== "string") return respond({error:"invalid_exercise"},400);
    const name = raw.normalize("NFKC").replace(/[\s\u3000]+/g,"").toLowerCase();
    if (!name || name.length > 60) return respond({error:"invalid_exercise"},400);
    const found = await db.prepare(
      "SELECT ws.id FROM workout_sets ws JOIN workout_sessions s ON s.id=ws.session_id " +
      "WHERE s.performed_on=? AND ws.exercise_name=? LIMIT 1"
    ).bind(date,name).first();
    if (!found) return respond({error:"no_completed_sets"},409);
    const progress = await db.prepare(
      "SELECT completed_sets FROM training_mode_exercises WHERE performed_on=? AND exercise_name=?"
    ).bind(date,name).first();
    if (!progress || progress.completed_sets < 1) return respond({error:"no_training_mode_sets"},409);
    await db.prepare(
      "UPDATE training_mode_exercises SET finished=1,updated_at=CURRENT_TIMESTAMP " +
      "WHERE performed_on=? AND exercise_name=?"
    ).bind(date,name).run();
    return respond({finished:true,exercise_name:name});
  }
  return respond({error:"method_not_allowed"},405);
}
