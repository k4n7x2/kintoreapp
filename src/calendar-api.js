import { repeatMonth, repeatOnDate, missingWorkoutRepeat } from "./workout-repeat.js";
import { resolveDayPlan, dayPlanKind } from "./calendar-day-state.js";
import { weekdaysToMask, recurringOn, previousISODate } from "./calendar-plan.js";

function missingPlanTables(error) {
  return /no such table:\s*(?:main\.)?gym_plan_(?:rules|overrides)/i.test(String(error?.message ?? error));
}

function missingRestColumn(error) {
  return /no such column:\s*rest\b/i.test(String(error?.message ?? error));
}

async function readManualDay(db, date) {
  try {
    const manual = await db.prepare(
      "SELECT planned, attended, rest FROM gym_calendar_days WHERE on_date = ?"
    ).bind(date).first();
    return { manual, restReady: true };
  } catch (error) {
    if (!missingRestColumn(error)) throw error;
    const manual = await db.prepare(
      "SELECT planned, attended FROM gym_calendar_days WHERE on_date = ?"
    ).bind(date).first();
    return { manual, restReady: false };
  }
}

async function oneDay(db, date) {
  const info = await readManualDay(db, date);
  let rules=[], exception=null, recurrenceReady=true;
  try {
    const [ruleRows, override] = await Promise.all([
      db.prepare("SELECT id, start_on, end_on, weekdays_mask FROM gym_plan_rules WHERE start_on <= ? AND (end_on IS NULL OR end_on >= ?)").bind(date,date).all(),
      db.prepare("SELECT planned FROM gym_plan_overrides WHERE on_date = ?").bind(date).first()
    ]);
    rules=ruleRows.results??[];
    exception=override?.planned??null;
  } catch(error) {
    // Retain the legacy per-day editing fallback when 0005 was never applied.
    throw error;
  }
  let repeats=[];
  try { repeats=await repeatOnDate(db,date); }
  catch(error) { if (!missingWorkoutRepeat(error)) throw error; }
  const repeat=repeats.at(-1)??null;
  const legacyRecurring=recurringOn(date,rules);
  const state=resolveDayPlan({manual:info.manual,legacyOverride:exception,
    legacyRecurring,repeat});
  return {...state,manual:info.manual,restReady:info.restReady,
    rules,exception,legacyRecurring,repeat,repeatConflict:repeats.length>1,
    recurrenceReady};
}

export async function handleCalendarAPI(db, url, request, method, { respond, monthRange, validDate, readJSON }) {
  if (url.pathname === "/api/calendar" && method === "GET") {
    const range = monthRange(url.searchParams.get("month"));
    if (!range) return respond({ error: "invalid_month" }, 400);
    let rows, restReady = true;
    try {
      rows = await db.prepare(
        "SELECT on_date, planned, attended, rest FROM gym_calendar_days WHERE on_date >= ? AND on_date < ? ORDER BY on_date"
      ).bind(...range).all();
    } catch(error) {
      if (!missingRestColumn(error)) throw error;
      restReady = false;
      rows = await db.prepare(
        "SELECT on_date, planned, attended FROM gym_calendar_days WHERE on_date >= ? AND on_date < ? ORDER BY on_date"
      ).bind(...range).all();
    }
    const manualDays = new Map((rows.results??[]).map(day=>[day.on_date,day]));
    let rules=[], exceptions=new Map(), recurrenceReady=true;
    try {
      const [ruleRows, overrideRows] = await Promise.all([
        db.prepare("SELECT id, start_on, end_on, weekdays_mask FROM gym_plan_rules WHERE start_on < ? AND (end_on IS NULL OR end_on >= ?) ORDER BY start_on, id").bind(range[1],range[0]).all(),
        db.prepare("SELECT on_date, planned FROM gym_plan_overrides WHERE on_date >= ? AND on_date < ?").bind(...range).all()
      ]);
      rules=ruleRows.results??[];
      exceptions=new Map((overrideRows.results??[]).map(row=>[row.on_date,Number(row.planned)]));
    } catch(error) {
      if (!missingPlanTables(error)) throw error;
      recurrenceReady=false;
    }
    const repeat=await repeatMonth(db,range);
    const repeating=new Map(repeat.days.map(item=>[item.on_date,item]));
    const [year,month]=range[0].split("-").map(Number);
    const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
    const days=[];
    for(let day=1;day<=lastDay;day++){
      const date=range[0].slice(0,8)+String(day).padStart(2,"0");
      const manual=manualDays.get(date);
      const occurrence=repeating.get(date);
      const exception=exceptions.get(date)??null;
      const legacyRecurring=recurringOn(date,rules);
      const status=resolveDayPlan({manual,legacyOverride:exception,
        legacyRecurring,repeat:occurrence});
      if (status.planned || status.rest || manual?.attended || manual?.planned ||
          exceptions.has(date) || occurrence) {
        days.push({on_date:date,planned:status.planned,rest:status.rest,
          attended:!!manual?.attended,source:status.source,
          recurring:legacyRecurring,exception,repeat_kind:occurrence?.kind??null,
          repeated_workout:!!occurrence,repeat_conflict:!!occurrence?.conflict});
      }
    }
    return respond({days,rules,recurrence_ready:recurrenceReady,
      rest_ready:restReady,repeat_ready:repeat.ready});
  }

  if (url.pathname === "/api/calendar/recurrence" && method === "PUT") {
    const parsed = await readJSON(request, 512);
    if (parsed.error) return respond({ error: parsed.error }, parsed.status);
    const { start_on, weekdays } = parsed.value ?? {};
    const mask = Array.isArray(weekdays) && weekdays.length === 0 ? 0 : weekdaysToMask(weekdays);
    if (!validDate(start_on) || mask === null) return respond({ error: "invalid_recurrence" }, 400);
    const statements = [
      db.prepare("UPDATE gym_plan_rules SET end_on = ? WHERE start_on < ? AND (end_on IS NULL OR end_on >= ?)").bind(previousISODate(start_on), start_on, start_on),
      db.prepare("DELETE FROM gym_plan_rules WHERE start_on >= ?").bind(start_on)
    ];
    if (mask) statements.push(db.prepare("INSERT INTO gym_plan_rules (start_on, weekdays_mask) VALUES (?, ?)").bind(start_on, mask));
    try { await db.batch(statements); }
    catch (error) {
      if (missingPlanTables(error)) return respond({ error: "weekly_plan_migration_required" }, 503);
      throw error;
    }
    return respond({ saved: true, start_on, weekdays, stopped: !mask });
  }

  if (url.pathname === "/api/calendar/move" && method === "POST") {
    const parsed = await readJSON(request, 512);
    if (parsed.error) return respond({ error: parsed.error }, parsed.status);
    const { from_date, to_date } = parsed.value ?? {};
    if (!validDate(from_date) || !validDate(to_date) || from_date === to_date) {
      return respond({ error: "invalid_move" }, 400);
    }
    try {
      const [source, target] = await Promise.all([oneDay(db, from_date), oneDay(db, to_date)]);
      if (!source.planned) return respond({ error: "source_not_planned" }, 409);
      if (source.repeat) return respond({ error: "repeat_move_requires_snapshot" }, 409);
      if (target.planned || target.rest) return respond({ error: "target_already_planned_or_rest" }, 409);
      await db.batch([
        db.prepare("INSERT INTO gym_plan_overrides (on_date, planned) VALUES (?, 0) ON CONFLICT(on_date) DO UPDATE SET planned = 0, updated_at = CURRENT_TIMESTAMP").bind(from_date),
        db.prepare("INSERT INTO gym_plan_overrides (on_date, planned) VALUES (?, 1) ON CONFLICT(on_date) DO UPDATE SET planned = 1, updated_at = CURRENT_TIMESTAMP").bind(to_date)
      ]);
    } catch (error) {
      if (missingPlanTables(error)) return respond({ error: "weekly_plan_migration_required" }, 503);
      throw error;
    }
    return respond({ moved: true, from_date, to_date });
  }

  if (url.pathname.startsWith("/api/calendar/") && method === "PUT") {
    const date = url.pathname.slice("/api/calendar/".length);
    if (!validDate(date)) return respond({ error: "invalid_date" }, 400);
    const parsed = await readJSON(request, 256);
    if (parsed.error) return respond({ error: parsed.error }, parsed.status);
    const { planned, attended, rest } = parsed.value ?? {};
    if (typeof planned !== "boolean" || typeof attended !== "boolean" ||
        (rest !== undefined && typeof rest !== "boolean")) {
      return respond({ error: "invalid_calendar_state" }, 400);
    }

    let current;
    try { current = await oneDay(db, date); }
    catch (error) {
      if (!missingPlanTables(error)) throw error;
      // 0005 not applied: keep all 0004 rest-day behaviour, including its fallback.
      const { manual, restReady } = await readManualDay(db, date);
      // Without 0005 no durable daily cancellation is available for a 0007 repeat.
      let repeated=[];
      try { repeated=await repeatOnDate(db,date); }
      catch(error) { if (!missingWorkoutRepeat(error)) throw error; }
      if (repeated.length) return respond({error:"weekly_plan_migration_required"},503);
      if (!restReady && rest === true) return respond({ error: "rest_migration_required" }, 503);
      const nextRest = restReady ? (rest === undefined ? !!manual?.rest && !planned : rest) : false;
      if (nextRest && planned) return respond({ error: "invalid_calendar_state" }, 400);
      if (!planned && !attended && !nextRest) {
        await db.prepare("DELETE FROM gym_calendar_days WHERE on_date = ?").bind(date).run();
      } else if (restReady) {
        await db.prepare("INSERT INTO gym_calendar_days (on_date, planned, attended, rest) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(on_date) DO UPDATE SET planned = excluded.planned, attended = excluded.attended, rest = excluded.rest, updated_at = CURRENT_TIMESTAMP"
        ).bind(date, Number(planned), Number(attended), Number(nextRest)).run();
      } else {
        await db.prepare("INSERT INTO gym_calendar_days (on_date, planned, attended) VALUES (?, ?, ?) " +
          "ON CONFLICT(on_date) DO UPDATE SET planned = excluded.planned, attended = excluded.attended, updated_at = CURRENT_TIMESTAMP"
        ).bind(date, Number(planned), Number(attended)).run();
      }
      return respond({ on_date: date, planned, attended, rest: nextRest, rest_ready: restReady });
    }

    if (!current.restReady && rest === true) return respond({ error: "rest_migration_required" }, 503);
    const nextRest = current.restReady ? (rest === undefined ? current.rest && !planned : rest) : false;
    if (planned && nextRest) return respond({ error: "invalid_calendar_state" }, 400);
    const statements = [];
    // A one-off choice must hide both weekly tables and snapshot-based recurrence.
    // "none" on a recurring rest day is an explicit cancellation too.
    const desiredKind=nextRest?"rest":planned?"gym":"none";
    const currentKind=dayPlanKind(current);
    const needsException=currentKind!==desiredKind;
    if (needsException) statements.push(db.prepare(
      "INSERT INTO gym_plan_overrides (on_date, planned) VALUES (?, ?) " +
      "ON CONFLICT(on_date) DO UPDATE SET planned = excluded.planned, updated_at = CURRENT_TIMESTAMP"
    ).bind(date, Number(planned)));
    const oldPlanned = Number(current.manual?.planned ?? 0);
    if (!oldPlanned && !attended && !nextRest) {
      statements.push(db.prepare("DELETE FROM gym_calendar_days WHERE on_date = ?").bind(date));
    } else if (current.restReady) {
      statements.push(db.prepare("INSERT INTO gym_calendar_days (on_date, planned, attended, rest) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(on_date) DO UPDATE SET attended = excluded.attended, rest = excluded.rest, updated_at = CURRENT_TIMESTAMP"
      ).bind(date, oldPlanned, Number(attended), Number(nextRest)));
    } else {
      statements.push(db.prepare("INSERT INTO gym_calendar_days (on_date, planned, attended) VALUES (?, ?, ?) " +
        "ON CONFLICT(on_date) DO UPDATE SET attended = excluded.attended, updated_at = CURRENT_TIMESTAMP"
      ).bind(date, oldPlanned, Number(attended)));
    }
    await db.batch(statements);
    const effective=await oneDay(db,date);
    return respond({on_date:date,planned:effective.planned,rest:effective.rest,
      attended,source:effective.source,exception:effective.exception,
      repeat_kind:effective.repeat?.kind??null,repeated_workout:!!effective.repeat,
      rest_ready:current.restReady});
  }
  return respond({ error: "method_not_allowed" }, 405);
}
