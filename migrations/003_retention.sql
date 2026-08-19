-- 003_retention.sql — housekeeping so the database does not grow without bound,
-- and so children's names do not sit around forever.
--
-- Nothing here deletes on its own; lib/retention.ts decides what is old enough,
-- and the admin screen triggers it. Games are only ever removed by an explicit
-- request or when they have been abandoned for a long time.

ALTER TABLE games ADD COLUMN IF NOT EXISTS outcome TEXT;

/* Existing finished games are backfilled as completed unless the engine never
   named a winning team, which is what a manual "จบเกมทันที" looks like. */
UPDATE games
   SET outcome = CASE
     WHEN finished AND jsonb_array_length(COALESCE(state->'winners'->'primaryWinningTeams', '[]'::jsonb)) > 0
       THEN 'completed'
     WHEN finished THEN 'manual_end'
     ELSE NULL
   END
 WHERE outcome IS NULL;

CREATE INDEX IF NOT EXISTS games_outcome_idx ON games (outcome, updated_at DESC);
