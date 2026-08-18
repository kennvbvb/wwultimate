import * as E from '@/lib/engine.generated.js';
import { catalogPayload, readOverrides, resetOverrides, saveOverrides } from '@/lib/catalog.ts';
import { isAdmin, requireAdmin } from '@/lib/auth.ts';
import { errorResponse, json, readJson } from '@/lib/api.ts';
import type { RoleOverrideRow } from '@/lib/types.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The admin screen replaces the RoleCatalog sheet the moderator used to edit by
 * hand. It never touches lib/engine/RoleCatalog.gs — corrections live in the
 * role_overrides table and are layered on at read time.
 */
export async function GET() {
  try {
    await requireAdmin();
    const [payload, overrides] = await Promise.all([catalogPayload(), readOverrides()]);
    const overridden: Record<string, RoleOverrideRow> = {};
    for (const row of overrides) overridden[row.roleId] = row;
    return json({
      roles: payload.roles.map((r) => ({ ...r, overridden: !!overridden[r.roleId] })),
      impactVerified: payload.impactVerified,
      appVersion: E.APP_VERSION
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await readJson(req);
    const rows = (body.rows as RoleOverrideRow[]) || [];
    const saved = await saveOverrides(rows);
    return json({ saved, ...(await catalogPayload()) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await resetOverrides();
    return json(await catalogPayload());
  } catch (e) {
    return errorResponse(e);
  }
}

/** Lets the admin screen decide whether to show the password form. */
export async function HEAD() {
  return new Response(null, { status: (await isAdmin()) ? 204 : 401 });
}
