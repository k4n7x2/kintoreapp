-- Remember an explicitly saved per-day exercise set count from the record editor.
-- NULL means no explicit record-editor override: use the scheduled menu target.
-- Existing completed sets, training progress and exercise completion are preserved.
ALTER TABLE training_mode_exercises
ADD COLUMN configured_sets INTEGER DEFAULT NULL
CHECK(configured_sets IS NULL OR configured_sets BETWEEN 1 AND 12);
