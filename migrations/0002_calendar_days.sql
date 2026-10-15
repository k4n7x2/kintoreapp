-- 予定・来館は、トレーニング実施記録とは独立して管理する。
-- 既存の workout_sessions / workout_sets と過去データは変更しない。
CREATE TABLE IF NOT EXISTS gym_calendar_days (
  on_date TEXT PRIMARY KEY,
  planned INTEGER NOT NULL DEFAULT 0 CHECK(planned IN (0, 1)),
  attended INTEGER NOT NULL DEFAULT 0 CHECK(attended IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
