import { requireAdmin } from '@/lib/auth.ts';
import { deleteGame } from '@/lib/retention.ts';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deletes a game and everything attached to it — players' names included. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  try {
    await requireAdmin();
    const { gameId } = await ctx.params;
    const removed = await deleteGame(gameId);
    if (!removed) return json({ error: 'ไม่พบเกมรหัส ' + gameId }, 404);
    return json({ ok: true, gameId });
  } catch (e) {
    return errorResponse(e);
  }
}
