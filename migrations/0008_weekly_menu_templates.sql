-- 0008: Separate reusable one-day exercise templates from weekly plan status.
-- Existing 0002/0005/0007 and performed workouts remain untouched.
CREATE TABLE IF NOT EXISTS workout_menu_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 60),
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS gym_weekly_slots (
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
  starts_on TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('gym', 'rest', 'none')),
  template_id INTEGER REFERENCES workout_menu_templates(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(kind='gym' OR template_id IS NULL),
  PRIMARY KEY (weekday, starts_on)
);
