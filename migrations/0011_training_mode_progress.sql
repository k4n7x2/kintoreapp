-- Count only sets saved from the training mode; existing record-editor writes remain independent.
ALTER TABLE training_mode_exercises
ADD COLUMN completed_sets INTEGER NOT NULL DEFAULT 0 CHECK(completed_sets BETWEEN 0 AND 12);

-- Best-effort preservation of progress created by the older training mode.
-- Only rows already present in training_mode_exercises are included.
UPDATE training_mode_exercises
SET completed_sets = MIN(12, (
  SELECT COUNT(DISTINCT ws.set_number)
  FROM workout_sets ws
  JOIN workout_sessions s ON s.id=ws.session_id
  WHERE s.performed_on=training_mode_exercises.performed_on
    AND ws.exercise_name=training_mode_exercises.exercise_name
));
