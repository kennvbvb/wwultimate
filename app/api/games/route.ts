import { createGame } from '@/lib/storage.ts';
import { grantModerator } from '@/lib/auth.ts';
import { errorResponse, json, readJson } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates a game and unlocks it on this device in one step. The PIN is returned
 * exactly once, on the creation screen, and never again.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const created = await createGame({
      playerNames: (body.playerNames as string[]) || [],
      title: body.title as string | undefined,
      deckProfile: body.deckProfile as { packs: string[] } | undefined
    });
    await grantModerator(created.view.gameId);
    return json({ ...created.view, moderatorPin: created.moderatorPin }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
