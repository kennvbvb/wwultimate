import { query } from '@/lib/db.ts';
import { checkSchema } from '@/lib/schema.ts';
import * as E from '@/lib/engine.generated.js';
import pkg from '../../../package.json';

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
  let schema: 'ok' | 'outdated' | 'unknown' = 'unknown';
  let hint: string | undefined;

  try {
    await query('SELECT 1');
    dbOk = true;

    /* A deploy that ran ahead of its migrations is the likeliest way this app
     * breaks in production, so the check says exactly what to run. */
    const check = await checkSchema();
    schema = check.ok ? 'ok' : 'outdated';
    if (!check.ok) {
      hint = 'ฐานข้อมูลยังไม่ได้อัปเดตเป็นเวอร์ชันล่าสุด — รัน npm run db:migrate ' +
        '(ขาด: ' + check.missing.join(', ') + ')';
      console.error('health check: schema outdated, missing', check.missing.join(', '));
    }
  } catch (e) {
    console.error('health check: database unreachable:', (e as Error).message);
  }

  const healthy = dbOk && schema === 'ok';
  return Response.json(
    {
      ok: healthy,
      db: dbOk ? 'up' : 'down',
      schema,
      ...(hint ? { hint } : {}),
      appVersion: pkg.version,
      /* The engine keeps its own version from the Apps Script era; it moves
       * independently of the web app's, so both are reported. */
      engineVersion: E.APP_VERSION,
      checkedInMs: Date.now() - startedAt
    },
    { status: healthy ? 200 : 503, headers: { 'cache-control': 'no-store' } }
  );
}
