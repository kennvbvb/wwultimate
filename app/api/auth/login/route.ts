import { loginWithPin } from '@/lib/auth.ts';
import { gameExists, moderatorView } from '@/lib/storage.ts';
import { errorResponse, json, readJson } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PIN in the body, never in the URL (CLAUDE.md §4). */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const gameId = String(body.gameId || '').trim().toUpperCase();
    const pin = String(body.pin || '');
    if (!gameId) return json({ error: 'ต้องระบุรหัสเกม' }, 400);
    if (!(await gameExists(gameId))) return json({ error: 'ไม่พบเกมรหัส ' + gameId }, 404);
    if (!(await loginWithPin(gameId, pin))) {
      return json({ error: 'PIN ผู้ดำเนินเกมไม่ถูกต้อง' }, 401);
    }
    return json(await moderatorView(gameId));
  } catch (e) {
    return errorResponse(e);
  }
}
