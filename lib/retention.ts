import { query } from './db.ts';

/**
 * Data lifecycle.
 *
 * The app stores the names of children and which role each of them held. That
 * is not something to keep indefinitely by default, and the idempotency and
 * rate-limit tables grow with every command. Nothing here runs on a timer —
 * the admin screen calls it — so a school can decide its own rhythm.
 */

export const IDEMPOTENCY_TTL_DAYS = 7;
export const ABANDONED_AFTER_DAYS = 30;

export interface CleanupResult {
  idempotency: number;
  rateLimits: number;
  abandonedGames: number;
}

export async function runCleanup(): Promise<CleanupResult> {
  const idem = await query(
    "DELETE FROM idempotency WHERE created_at < now() - ($1 || ' days')::interval",
    [IDEMPOTENCY_TTL_DAYS]);
  const limits = await query('DELETE FROM rate_limits WHERE expires_at < now()');

  /* A game nobody has touched in a month was abandoned, not finished. Marking
   * it keeps the win-rate statistics honest — and makes it findable for
   * deletion later. */
  const abandoned = await query(
    "UPDATE games SET finished = TRUE, outcome = 'abandoned' " +
    "WHERE finished = FALSE AND updated_at < now() - ($1 || ' days')::interval",
    [ABANDONED_AFTER_DAYS]);

  return {
    idempotency: idem.rowCount || 0,
    rateLimits: limits.rowCount || 0,
    abandonedGames: abandoned.rowCount || 0
  };
}

/** Removes one game and everything attached to it. There is no undo. */
export async function deleteGame(gameId: string): Promise<boolean> {
  const res = await query('DELETE FROM games WHERE game_id = $1', [gameId]);
  await query('DELETE FROM idempotency WHERE game_id = $1', [gameId]);
  return (res.rowCount || 0) > 0;
}

export interface RetentionSummary {
  games: number;
  finished: number;
  abandoned: number;
  oldestGameAt: string | null;
  events: number;
  snapshots: number;
  idempotency: number;
}

/** What the admin screen shows before offering to clean anything up. */
export async function retentionSummary(): Promise<RetentionSummary> {
  const res = await query<{
    games: string; finished: string; abandoned: string; oldest: Date | null;
    events: string; snapshots: string; idempotency: string;
  }>(`SELECT
        (SELECT COUNT(*) FROM games)::text AS games,
        (SELECT COUNT(*) FROM games WHERE finished)::text AS finished,
        (SELECT COUNT(*) FROM games WHERE outcome = 'abandoned')::text AS abandoned,
        (SELECT MIN(created_at) FROM games) AS oldest,
        (SELECT COUNT(*) FROM events)::text AS events,
        (SELECT COUNT(*) FROM snapshots)::text AS snapshots,
        (SELECT COUNT(*) FROM idempotency)::text AS idempotency`);
  const row = res.rows[0];
  return {
    games: Number(row.games),
    finished: Number(row.finished),
    abandoned: Number(row.abandoned),
    oldestGameAt: row.oldest ? row.oldest.toISOString() : null,
    events: Number(row.events),
    snapshots: Number(row.snapshots),
    idempotency: Number(row.idempotency)
  };
}
