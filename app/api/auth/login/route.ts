import { loginWithPin } from '@/lib/auth.ts';
import { moderatorView } from '@/lib/storage.ts';
import { errorResponse, json, readJson } from '@/lib/api.ts';
import { clientKey, enforceRateLimit } from '@/lib/rateLimit.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PIN in the body, never in the URL (CLAUDE.md §5). */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const gameId = String(body.gameId || '').trim().toUpperCase();
    const pin = String(body.pin || '');
    if (!gameId) return json({ error: 'ต้องระบุรหัสเกม' }, 400);

    /* Throttled per device and per game: without this, an 8-character PIN is
     * only as good as how fast someone can POST. */
    await enforceRateLimit('moderatorLogin', clientKey(req));
    await enforceRateLimit('moderatorLogin', gameId);

    /* One message for "no such game" and "wrong PIN" alike — telling them apart
     * turns the login form into a game-id oracle. */
    if (!(await loginWithPin(gameId, pin))) {
      return json({ error: 'รหัสเกมหรือ PIN ไม่ถูกต้อง' }, 401);
    }
    return json(await moderatorView(gameId));
  } catch (e) {
    return errorResponse(e);
  }
}
