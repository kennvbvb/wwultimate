import { query } from '@/lib/db.ts';
import * as E from '@/lib/engine.generated.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness plus a real database round trip, for uptime monitoring.
 *
 * Public, so it says nothing an attacker could use: no connection strings, no
 * counts, no error details — just whether the app can reach its database.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    await query('SELECT 1');
    dbOk = true;
  } catch (e) {
    console.error('health check: database unreachable:', (e as Error).message);
  }

  return Response.json(
    {
      ok: dbOk,
      db: dbOk ? 'up' : 'down',
      appVersion: E.APP_VERSION,
      checkedInMs: Date.now() - startedAt
    },
    { status: dbOk ? 200 : 503, headers: { 'cache-control': 'no-store' } }
  );
}
