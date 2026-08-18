import { playerTableCsv } from '@/lib/storage.ts';
import { requireModerator } from '@/lib/auth.ts';
import { errorResponse } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Replaces the old Players sheet: the moderator downloads it when they want it. */
export async function GET(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await ctx.params;
    await requireModerator(gameId);
    const csv = await playerTableCsv(gameId);
    /* BOM so Excel opens Thai text in UTF-8 instead of mojibake. */
    return new Response('﻿' + csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="' + gameId + '-players.csv"'
      }
    });
  } catch (e) {
    return errorResponse(e);
  }
}
