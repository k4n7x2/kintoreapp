-- ユーザー認証方式が決まるまで、記録APIは外部公開しない。
-- 実行前にユーザー識別・アクセス制御の設計を確認すること。
CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  performed_on TEXT NOT NULL,            -- YYYY-MM-DD (Asia/Tokyo想定)
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_performed_on
ON workout_sessions (performed_on);

CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL CHECK(set_number > 0),
  weight_kg REAL NOT NULL DEFAULT 0 CHECK(weight_kg >= 0),
  reps INTEGER NOT NULL CHECK(reps >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workout_sets_session_id
ON workout_sets (session_id);
