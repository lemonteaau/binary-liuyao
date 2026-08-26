CREATE TABLE IF NOT EXISTS hexagram_counter_events (
  ordinal INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hexagram_counter_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value INTEGER NOT NULL
);

INSERT OR IGNORE INTO hexagram_counter_state (id, value)
VALUES (1, 166);

INSERT OR IGNORE INTO hexagram_counter_events (ordinal, event_id)
VALUES (166, '00000000-0000-0000-0000-000000000000');
