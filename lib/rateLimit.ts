import { query } from './db.ts';

/**
 * A small fixed-window limiter for the three doors that face the internet:
 * creating a game, entering a game PIN and entering the admin password.
 *
 * Fixed windows let a burst land on a boundary, which is fine here — the point
 * is to make PIN guessing and bulk game creation impractical for a classroom
 * app, not to shape traffic precisely.
 */

export interface RateLimitRule { limit: number; windowSeconds: number }

function limitFrom(envName: string, fallback: number): number {
  const raw = Number(process.env[envName]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/* Defaults sized for one classroom, not a public service. A school running
 * several tables at once can raise them without a code change. */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  createGame: { limit: limitFrom('RATE_LIMIT_CREATE_GAME', 30), windowSeconds: 3600 },
  moderatorLogin: { limit: limitFrom('RATE_LIMIT_MODERATOR_LOGIN', 10), windowSeconds: 600 },
  adminLogin: { limit: limitFrom('RATE_LIMIT_ADMIN_LOGIN', 10), windowSeconds: 600 }
};

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('พยายามบ่อยเกินไป กรุณารออีกสักครู่แล้วลองใหม่');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Best-effort client identity: the first hop in x-forwarded-for, as Vercel sets it. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  return ip;
}

/**
 * Counts one hit against `${name}:${key}` and throws once the window is full.
 * A database hiccup must not lock the teacher out mid-lesson, so failures here
 * let the request through.
 */
export async function enforceRateLimit(name: string, key: string): Promise<void> {
  const rule = RATE_LIMITS[name];
  if (!rule) return;
  /* An escape hatch for local runs only — never honoured in production. */
  if (process.env.RATE_LIMIT_DISABLED === '1' && process.env.NODE_ENV !== 'production') return;

  const bucket = name + ':' + key;
  try {
    const res = await query<{ count: number; retry_after: number }>(
      `INSERT INTO rate_limits (bucket, count, expires_at)
       VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (bucket) DO UPDATE SET
         count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
         expires_at = CASE WHEN rate_limits.expires_at < now()
                           THEN now() + make_interval(secs => $2) ELSE rate_limits.expires_at END
       RETURNING count, CEIL(EXTRACT(EPOCH FROM (expires_at - now())))::int AS retry_after`,
      [bucket, rule.windowSeconds]);

    const row = res.rows[0];
    if (row && row.count > rule.limit) {
      throw new RateLimitError(Math.max(1, Number(row.retry_after || rule.windowSeconds)));
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    console.error('rate limit check failed, allowing request:', (e as Error).message);
  }
}

/** Housekeeping for expired buckets — cheap enough to run opportunistically. */
export async function purgeExpiredRateLimits(): Promise<void> {
  try {
    await query('DELETE FROM rate_limits WHERE expires_at < now() - interval \'1 day\'');
  } catch { /* not worth failing a request over */ }
}
