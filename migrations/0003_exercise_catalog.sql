-- 種目設定の名前キー（種目マスター用の数値IDは作らない）。
-- 既存の workout_sessions / workout_sets / gym_calendar_days は削除・初期化しない。
CREATE TABLE IF NOT EXISTS exercise_catalog (
  exercise_name TEXT PRIMARY KEY,
  body_part TEXT NOT NULL DEFAULT 'その他'
    CHECK (body_part IN ('胸','背中','肩','腕','脚','腹筋','全身','その他')),
  unit TEXT NOT NULL DEFAULT 'kg_reps'
    CHECK (unit IN ('kg_reps','reps','seconds')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 既存の重量×回数実績は kg_reps としてそのまま残す。
-- 秒単位や回数のみの新規セットと、設定変更前の実績の単位を区別する。
ALTER TABLE workout_sets ADD COLUMN entry_unit TEXT NOT NULL DEFAULT 'kg_reps'
  CHECK (entry_unit IN ('kg_reps','reps','seconds'));
ALTER TABLE workout_sets ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0
  CHECK (duration_seconds >= 0 AND duration_seconds <= 36000);

-- 既存の固定候補を初期登録。ユーザーの変更は後続の再適用でも上書きしない。
INSERT OR IGNORE INTO exercise_catalog (exercise_name, body_part, unit) VALUES
  ('ベンチプレス','胸','kg_reps'),
  ('チェストプレス','胸','kg_reps'),
  ('ダンベルプレス','胸','kg_reps'),
  ('ラットプルダウン','背中','kg_reps'),
  ('シーテッドロー','背中','kg_reps'),
  ('ショルダープレス','肩','kg_reps'),
  ('アームカール','腕','kg_reps'),
  ('レッグプレス','脚','kg_reps'),
  ('スクワット','脚','kg_reps'),
  ('レッグカール','脚','kg_reps'),
  ('クランチ','腹筋','reps');
