-- Spec 2: game threads, and challenge codes made on the device.
-- Challenge codes need no schema change: challenges.id holds the longer device-made code too. A code opened
-- before its creator's device registered it is stored with creator_id = '' and claimed on registration.

ALTER TABLE runs ADD COLUMN thread_id TEXT;        -- daily-YYYY-MM-DD or anytime-<id>
ALTER TABLE runs ADD COLUMN thread_turn INTEGER;   -- 0, 1, 2
ALTER TABLE runs ADD COLUMN thread_attempt TEXT;   -- one play-through of a thread, made on the device
CREATE INDEX runs_thread ON runs (player_id, thread_attempt);

CREATE TABLE thread_results (
  attempt_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL, kind TEXT NOT NULL, day TEXT,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL,              -- complete | out (out of lives)
  stars INTEGER NOT NULL, lives_left INTEGER NOT NULL, duration_ms INTEGER NOT NULL,
  ranked INTEGER DEFAULT 0,          -- the player's first completion of that day's Daily thread
  results TEXT,                      -- JSON: per turn { game, score, stars }
  created_at INTEGER NOT NULL
);
CREATE INDEX thread_board ON thread_results (thread_id, ranked, stars, duration_ms);
CREATE INDEX thread_player ON thread_results (player_id, thread_id);
