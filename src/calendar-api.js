import { weekdaysToMask, effectivePlan, previousISODate } from "./calendar-plan.js";

function missingPlanTables(error) {
  return /no such table:\s*(?:main\.)?gym_plan_(?:rules|overrides)/i.test(String(error?.message ?? error));
}

async function oneDay(db, date) {
  const [manual, rules, exception] = await Promise.all([
    db.prepare("SELECT planned, attended FROM gym_calendar_days WHERE on_date = ?").bind(date).first(),
    db.prepare("SELECT id, start_on, end_on, weekdays_mask FROM gym_plan_rules WHERE start_on <= ? AND (end_on IS NULL OR end_on >= ?)").bind(date, date).all(),
    db.prepare("SELECT planned FROM gym_plan_overrides WHERE on_date = ?").bind(date).first()
  ]);
  return { manual, rules: rules.results ?? [], exception: exception?.planned ?? null,
    planned: effectivePlan(date, !!manual?.planned, rules.results ?? [], exception?.planned ?? null) };
}

export async function handleCalendarAPI(db, url, request, method, { respond, monthRange, validDate, readJSON }) {
  if (url.pathname === "/api/calendar" && method === "GET") {
    const range = monthRange(url.searchParams.get("month"));
    if (!range) return respond({ error: "invalid_month" }, 400);
    const rows = await db.prepare(
      "SELECT on_date, planned, attended FROM gym_calendar_days WHERE on_date >= ? AND on_date < ? ORDER BY on_date"
    ).bind(...range).all();
    const oldDays = rows.results ?? [];
    try {
      const [ruleRows, overrideRows] = await Promise.all([
        db.prepare("SELECT id, start_on, end_on, weekdays_mask FROM gym_plan_rules WHERE start_on < ? AND (end_on IS NULL OR end_on >= ?) ORDER BY start_on, id").bind(range[1], range[0]).all(),
        db.prepare("SELECT on_date, planned FROM gym_plan_overrides WHERE on_date >= ? AND on_date < ?").bind(...range).all()
      ]);
      const rules = ruleRows.results ?? [];
      const manualDays = new Map(oldDays.map(day => [day.on_date, day]));
      const exceptions = new Map((overrideRows.results ?? []).map(day => [day.on_date, Number(day.planned)]));
      const [year, month] = range[0].split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const days = [];
      for (let day = 1; day <= lastDay; day++) {
        const date = range[0].slice(0, 8) + String(day).padStart(2, "0");
        const old = manualDays.get(date);
        const planned = effectivePlan(date, !!old?.planned, rules, exceptions.get(date));
        if (planned || old?.attended || old?.planned || exceptions.has(date)) {
          days.push({ on_date: date, planned, attended: !!old?.attended,
            recurring: effectivePlan(date, false, rules), exception: exceptions.get(date) ?? null });
        }
      }
      return respond({ days, rules, recurrence_ready: true });
    } catch (error) {
      if (!missingPlanTables(error)) throw error;
      return respond({ days: oldDays, rules: [], recurrence_ready: false });
    }
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
      if (target.planned) return respond({ error: "target_already_planned" }, 409);
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
    const { planned, attended } = parsed.value ?? {};
    if (typeof planned !== "boolean" || typeof attended !== "boolean") {
      return respond({ error: "invalid_calendar_state" }, 400);
    }
    let current;
    try { current = await oneDay(db, date); }
    catch (error) {
      if (!missingPlanTables(error)) throw error;
      // Preserves pre-0004 single-day editing.
      if (!planned && !attended) {
        await db.prepare("DELETE FROM gym_calendar_days WHERE on_date = ?").bind(date).run();
      } else {
        await db.prepare("INSERT INTO gym_calendar_days (on_date, planned, attended) VALUES (?, ?, ?) " +
          "ON CONFLICT(on_date) DO UPDATE SET planned = excluded.planned, attended = excluded.attended, updated_at = CURRENT_TIMESTAMP"
        ).bind(date, Number(planned), Number(attended)).run();
      }
      return respond({ on_date: date, planned, attended });
    }
    const statements = [];
    if (current.planned !== planned) statements.push(db.prepare(
      "INSERT INTO gym_plan_overrides (on_date, planned) VALUES (?, ?) " +
      "ON CONFLICT(on_date) DO UPDATE SET planned = excluded.planned, updated_at = CURRENT_TIMESTAMP"
    ).bind(date, Number(planned)));
    const oldPlanned = Number(current.manual?.planned ?? 0);
    if (!oldPlanned && !attended) {
      statements.push(db.prepare("DELETE FROM gym_calendar_days WHERE on_date = ?").bind(date));
    } else {
      statements.push(db.prepare("INSERT INTO gym_calendar_days (on_date, planned, attended) VALUES (?, ?, ?) " +
        "ON CONFLICT(on_date) DO UPDATE SET attended = excluded.attended, updated_at = CURRENT_TIMESTAMP"
      ).bind(date, oldPlanned, Number(attended)));
    }
    await db.batch(statements);
    return respond({ on_date: date, planned, attended });
  }
  return respond({ error: "method_not_allowed" }, 405);
}
