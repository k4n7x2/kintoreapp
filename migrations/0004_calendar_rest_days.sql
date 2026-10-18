-- 休息日は明示した日付だけを記録する。既存の予定・来館・実績を保全する。
ALTER TABLE gym_calendar_days
  ADD COLUMN rest INTEGER NOT NULL DEFAULT 0 CHECK(rest IN (0, 1));
