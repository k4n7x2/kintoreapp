-- Shared completion state for both record and guided training screens.
-- Existing saved workout sets represent completed historical workouts.
-- New records can explicitly save is_completed=0 without modifying prior data.
ALTER TABLE workout_sets
ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 1 CHECK(is_completed IN (0,1));

CREATE INDEX IF NOT EXISTS idx_workout_sets_completed
ON workout_sets(session_id, exercise_name, set_number, is_completed);
