-- Spec v1 (cleanup + core loop): name rules and moderation, weekly boards, score integrity, reports.
-- The spec's `sessions` and `scores` tables map onto `runs` (a run is issued with a token at start and
-- carries the score at finish); see README "Data model".

ALTER TABLE players ADD COLUMN name_normalized TEXT;        -- unique, compared on the normalised form
ALTER TABLE players ADD COLUMN name_changed_at INTEGER;     -- last change (not the first claim)
ALTER TABLE players ADD COLUMN name_changes INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN status TEXT DEFAULT 'ok';    -- ok | flagged (name needs review) | hidden (off boards)
CREATE UNIQUE INDEX players_name_norm ON players (name_normalized);

ALTER TABLE runs ADD COLUMN week_key TEXT;                  -- Monday (EAT) of the finish week, e.g. 2026-09-28
ALTER TABLE runs ADD COLUMN flagged INTEGER DEFAULT 0;      -- above the plausible maximum: stored, hidden until reviewed
ALTER TABLE runs ADD COLUMN hidden INTEGER DEFAULT 0;       -- hidden by an admin
CREATE INDEX runs_week ON runs (game, week_key, mode);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,          -- the reported player
  reporter_id TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL,
  resolved INTEGER DEFAULT 0
);
CREATE INDEX reports_open ON reports (resolved, created_at);

-- backfill: existing names, weeks
UPDATE players SET name_normalized = lower(handle) WHERE handle IS NOT NULL;
