import { listOpenGames } from '@/lib/storage.ts';
import { requireAdmin } from '@/lib/auth.ts';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The recovery path for "I closed the tab and lost the game id". Behind the
 * admin password, because the same list in public hands is a map of every
 * running game.
 */
export async function GET() {
  try {
    await requireAdmin();
    return json({ games: await listOpenGames() });
  } catch (e) {
    return errorResponse(e);
  }
}
