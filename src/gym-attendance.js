// App-open check-in uses the existing MacroDroid presence lease; its webhook stays read/write isolated.
import { resolveGymPresence } from "./gym-presence.js";
const PRESENCE_SQL = "SELECT connected, last_event_ms, expires_at_ms FROM gym_presence_state WHERE id = 1";
const CHECK_IN_SQL = `INSERT INTO gym_calendar_days (on_date, attended)
  VALUES (?, 1)
  ON CONFLICT(on_date) DO UPDATE SET
    attended = 1, updated_at = CURRENT_TIMESTAMP
  WHERE gym_calendar_days.attended = 0`;

export function japanAttendanceDate(nowMs) {
  // JST does not have daylight saving; calculate from the Worker clock, not the device.
  return new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function checkInGymAttendance(db, respond, nowMs = Date.now()) {
  if (!db) return respond({ error: "database_not_configured" }, 503);
  try {
    const row = await db.prepare(PRESENCE_SQL).first();
    const presence = resolveGymPresence(row, nowMs);
    const onDate = japanAttendanceDate(nowMs);
    if (!presence.connected) {
      return respond({ ...presence, on_date: onDate, attended: false, changed: false });
    }
    // Attendance-only UPSERT. Never change plans, rest, exercises or historical visits.
    const result = await db.prepare(CHECK_IN_SQL).bind(onDate).run();
    return respond({ ...presence, on_date: onDate, attended: true,
      changed: (result.meta?.changes ?? 0) > 0 });
  } catch {
    return respond({ error: "gym_attendance_unavailable_or_migration_required" }, 503);
  }
}
