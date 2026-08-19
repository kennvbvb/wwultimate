-- 002_rate_limit.sql — throttling for the endpoints anyone on the internet can reach.
--
-- Kept in Postgres rather than instance memory on purpose: Vercel spreads
-- requests across instances that share nothing, so an in-memory counter would
-- reset every time a new one spins up — exactly when an attacker is hammering.

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits (expires_at);
