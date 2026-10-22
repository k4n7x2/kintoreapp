-- A completed exercise is distinct from having recorded sets.
-- Existing sessions, sets, plans and attendance remain unchanged.
CREATE TABLE IF NOT EXISTS training_mode_exercises (
  performed_on TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  finished INTEGER NOT NULL DEFAULT 0 CHECK(finished IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (performed_on, exercise_name)
);
