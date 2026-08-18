import { publicView } from '@/lib/storage.ts';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * No auth: this is the screen on the classroom wall. It returns publicViewModel
 * and nothing else — the moderator view must never be reachable from here, or
 * every living player's role leaks (CLAUDE.md §11 item 5).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await ctx.params;
    return json(await publicView(gameId));
  } catch (e) {
    return errorResponse(e);
  }
}
