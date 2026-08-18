import { summaryView } from '@/lib/storage.ts';
import { requireModerator } from '@/lib/auth.ts';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await ctx.params;
    await requireModerator(gameId);
    return json(await summaryView(gameId));
  } catch (e) {
    return errorResponse(e);
  }
}
