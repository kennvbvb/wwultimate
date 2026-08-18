import { readEvents } from '@/lib/storage.ts';
import { requireModerator } from '@/lib/auth.ts';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await ctx.params;
    await requireModerator(gameId);
    const limit = Number(new URL(req.url).searchParams.get('limit') || 150);
    return json(await readEvents(gameId, Math.min(Math.max(limit, 1), 500)));
  } catch (e) {
    return errorResponse(e);
  }
}
