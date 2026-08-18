import * as E from '@/lib/engine.generated.js';
import { loadState } from '@/lib/storage.ts';
import { ensureCatalogLoaded, impactVerified } from '@/lib/catalog.ts';
import { requireModerator } from '@/lib/auth.ts';
import { errorResponse, json, readJson } from '@/lib/api.ts';
import type { SelectedRole } from '@/lib/types.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Checks a role selection without saving it, so the picker screen can warn while
 * the moderator is still choosing. The state loaded here is never persisted.
 */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await ctx.params;
    await requireModerator(gameId);
    await ensureCatalogLoaded();

    const body = await readJson(req);
    const state = await loadState(gameId);
    const selected = (body.selectedRoles as SelectedRole[]) || null;
    if (selected) state.selectedRoles = selected.filter((r) => r.count > 0);

    const impact = E.villageImpactSummary(state);
    impact.verified = impactVerified();
    if (impact.verified) impact.note = '';
    return json({ ...E.validateRoleSelection(state), impact });
  } catch (e) {
    return errorResponse(e);
  }
}
