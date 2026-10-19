-- 0009: MacroDroid Wi-Fi presence is transient and separate from attendance,
-- planned/rest days, workout sessions and training templates.
CREATE TABLE IF NOT EXISTS gym_presence_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  connected INTEGER NOT NULL CHECK (connected IN (0, 1)),
  last_event_ms INTEGER NOT NULL,
  refreshed_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL
);
