-- 0004: repeating weekly gym plans and one-day overrides.
-- Existing gym_calendar_days, workout_sessions, and workout_sets remain untouched.
-- ISO date TEXT maintains lexical ordering for valid YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS gym_plan_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_on TEXT NOT NULL,
  end_on TEXT,
  weekdays_mask INTEGER NOT NULL CHECK(weekdays_mask BETWEEN 1 AND 127),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(end_on IS NULL OR end_on >= start_on)
);
CREATE INDEX IF NOT EXISTS idx_gym_plan_rules_date ON gym_plan_rules(start_on, end_on);

CREATE TABLE IF NOT EXISTS gym_plan_overrides (
  on_date TEXT PRIMARY KEY,
  planned INTEGER NOT NULL CHECK(planned IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
