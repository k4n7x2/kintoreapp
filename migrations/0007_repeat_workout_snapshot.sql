-- 0007: recurrence copies the whole workout draft, not attendance or performed sets.
-- Keep 0004 rest-days, 0005 weekday flags, 0006 catalog, and all historical data untouched.
CREATE TABLE IF NOT EXISTS workout_repeat_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),
  every_n INTEGER NOT NULL DEFAULT 1 CHECK(every_n BETWEEN 1 AND 12),
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS idx_workout_repeat_range
  ON workout_repeat_series(starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_workout_repeat_group
  ON workout_repeat_series(group_id);

CREATE TABLE IF NOT EXISTS workout_repeat_exceptions (
  series_id INTEGER NOT NULL,
  on_date TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
  content_json TEXT,
  PRIMARY KEY(series_id, on_date)
);
CREATE INDEX IF NOT EXISTS idx_workout_repeat_exceptions_date ON workout_repeat_exceptions(on_date);
