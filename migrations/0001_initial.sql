-- まだ未適用の初期スキーマ。認証したユーザーごとに記録を分離。
-- productionのD1への適用はCloudflare側の操作が必要。
CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  performed_on TEXT NOT NULL,             -- YYYY-MM-DD
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_owner_date
ON workout_sessions (owner_email, performed_on);

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
