-- 001_init.sql — schema for the Vercel/Postgres version.
--
-- The Sheets version split the state JSON across six columns to dodge the
-- 50,000-character-per-cell limit. jsonb has no such limit, so the chunking
-- logic is gone entirely.

CREATE TABLE IF NOT EXISTS games (
  game_id     TEXT PRIMARY KEY,
  version     INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL,
  title       TEXT,
  pin_hash    TEXT NOT NULL,
  state       JSONB NOT NULL,
  finished    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS games_open_idx ON games (finished, updated_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id           BIGSERIAL PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  type         TEXT NOT NULL,
  day_number   INTEGER,
  night_number INTEGER,
  payload      JSONB
);
CREATE INDEX IF NOT EXISTS events_game_idx ON events (game_id, seq);

CREATE TABLE IF NOT EXISTS snapshots (
  id         BIGSERIAL PRIMARY KEY,
  game_id    TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  command_id TEXT,
  label      TEXT,
  state      JSONB NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshots_game_idx ON snapshots (game_id, id DESC);

CREATE TABLE IF NOT EXISTS role_overrides (
  role_id         TEXT PRIMARY KEY,
  display_name_th TEXT,
  village_impact  INTEGER,
  max_copies      INTEGER,
  enabled         BOOLEAN,
  note_th         TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency (
  key        TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL,
  result     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idempotency_age_idx ON idempotency (created_at);
