-- Chezable MVP schema (build spec §10.4), plus the few columns the challenge flows need.
CREATE TABLE players (
  id TEXT PRIMARY KEY, handle TEXT UNIQUE, secret_hash TEXT NOT NULL,
  recovery_hash TEXT, lang TEXT DEFAULT 'en',
  xp INTEGER DEFAULT 0, coins INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
  variant_cohort TEXT, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX players_handle_lc ON players (lower(handle));
CREATE UNIQUE INDEX players_recovery ON players (recovery_hash);

CREATE TABLE runs (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, game TEXT NOT NULL,
  mode TEXT NOT NULL, variant TEXT NOT NULL, seed TEXT NOT NULL,
  score REAL, detail TEXT, input_hash TEXT, assist INTEGER DEFAULT 0,
  challenge_id TEXT, started_at INTEGER NOT NULL, finished_at INTEGER,
  verified INTEGER DEFAULT 0,
  tiebreak REAL,               -- lower is better; each stage defines it (§7)
  day TEXT,                    -- Africa/Nairobi date of finish, for the Today board
  local INTEGER DEFAULT 0      -- finished offline or pass-the-phone; never shown as verified
);
CREATE INDEX runs_board ON runs (game, mode, variant, assist, score);
CREATE INDEX runs_player ON runs (player_id, game, finished_at);
CREATE INDEX runs_day ON runs (game, day, mode);

CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL,
  event TEXT NOT NULL, game TEXT, ref TEXT,
  xp_delta INTEGER NOT NULL, coin_delta INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX ledger_player ON ledger (player_id, created_at);
CREATE INDEX ledger_event ON ledger (player_id, event, game);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY, kind TEXT DEFAULT 'beat',        -- beat | revive | turn (Shisima)
  game TEXT NOT NULL, variant TEXT NOT NULL, seed TEXT NOT NULL, payload TEXT,
  creator_id TEXT NOT NULL, creator_run_id TEXT NOT NULL, creator_score REAL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  target_id TEXT,              -- set on "Send it back" so it lands in their inbox
  creator_tiebreak REAL,
  state TEXT,                  -- turn games: JSON board state; revive: {"continued":1}
  turn_of TEXT,                -- turn games: player id to move ('*' = anyone who opens it)
  opponent_id TEXT,            -- turn games: the second player once joined
  updated_at INTEGER
);
CREATE INDEX challenges_creator ON challenges (creator_id, created_at);
CREATE INDEX challenges_target ON challenges (target_id, created_at);
CREATE INDEX challenges_opp ON challenges (opponent_id, updated_at);

CREATE TABLE challenge_entries (
  challenge_id TEXT NOT NULL, player_id TEXT NOT NULL, run_id TEXT NOT NULL,
  score REAL, result TEXT, created_at INTEGER NOT NULL,
  tiebreak REAL,
  PRIMARY KEY (challenge_id, player_id)
);
CREATE INDEX entries_player ON challenge_entries (player_id, created_at);

CREATE TABLE challenge_views (           -- opened links, for "Waiting for you"
  challenge_id TEXT NOT NULL, player_id TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, player_id)
);
CREATE INDEX views_player ON challenge_views (player_id, at);

CREATE TABLE edges (                 -- the play graph
  a_id TEXT NOT NULL, b_id TEXT NOT NULL, game TEXT NOT NULL,
  kind TEXT NOT NULL,                -- challenged | beat | lost_to | revived | recruited
  count INTEGER DEFAULT 1, last_at INTEGER NOT NULL,
  PRIMARY KEY (a_id, b_id, game, kind)
);
CREATE INDEX edges_b ON edges (b_id);

CREATE TABLE daily_seeds (game TEXT NOT NULL, day TEXT NOT NULL, seed TEXT NOT NULL,
  PRIMARY KEY (game, day));

CREATE TABLE events (                -- telemetry (move to Analytics Engine when volume grows)
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, session_id TEXT,
  name TEXT NOT NULL, game TEXT, props TEXT, ts INTEGER NOT NULL
);
CREATE INDEX events_name ON events (name, ts);

CREATE TABLE rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL);
