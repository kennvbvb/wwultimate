import * as E from './engine.generated.js';
import { query } from './db.ts';
import type { RoleOverrideRow, CatalogViewModel } from './types.ts';

/**
 * Role-catalog overrides, formerly the RoleCatalog sheet.
 *
 * applyCatalogOverrides() writes straight into the engine's in-memory role
 * definitions, which live for as long as the instance does. On Apps Script every
 * execution started clean; here a warm instance would keep an override that the
 * admin has since deleted, so the pristine values are captured once at load and
 * restored before each new set is applied.
 */

type Overridable = Pick<RoleOverrideRow, 'displayNameTh' | 'villageImpact' | 'maxCopies' | 'enabled' | 'noteTh'>;

const PRISTINE: Record<string, Overridable> = {};
for (const def of E.listRoles()) {
  PRISTINE[def.roleId] = {
    displayNameTh: def.displayNameTh,
    villageImpact: def.villageImpact,
    maxCopies: def.maxCopies,
    enabled: def.enabled,
    noteTh: def.noteTh
  };
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const globalForCatalog = globalThis as unknown as {
  __uwCatalog?: { rows: RoleOverrideRow[]; at: number };
};

function restoreDefaults(): void {
  for (const def of E.listRoles()) {
    const base = PRISTINE[def.roleId];
    if (!base) continue;
    def.displayNameTh = base.displayNameTh as string;
    def.villageImpact = base.villageImpact as number;
    def.maxCopies = base.maxCopies as number;
    def.enabled = base.enabled as boolean;
    def.noteTh = base.noteTh as string;
  }
}

function apply(rows: RoleOverrideRow[]): void {
  restoreDefaults();
  if (rows.length) E.applyCatalogOverrides(rows);
}

export async function readOverrides(): Promise<RoleOverrideRow[]> {
  const res = await query<{
    role_id: string; display_name_th: string | null; village_impact: number | null;
    max_copies: number | null; enabled: boolean | null; note_th: string | null;
  }>('SELECT role_id, display_name_th, village_impact, max_copies, enabled, note_th FROM role_overrides');
  return res.rows.map((r) => ({
    roleId: r.role_id,
    displayNameTh: r.display_name_th,
    villageImpact: r.village_impact,
    maxCopies: r.max_copies,
    enabled: r.enabled,
    noteTh: r.note_th
  }));
}

/**
 * Makes sure the engine's catalog reflects the admin's corrections.
 * Cheap on a warm instance, one small query at most every six hours otherwise.
 */
export async function ensureCatalogLoaded(): Promise<void> {
  const hit = globalForCatalog.__uwCatalog;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    apply(hit.rows);
    return;
  }
  const rows = await readOverrides();
  globalForCatalog.__uwCatalog = { rows, at: Date.now() };
  apply(rows);
}

/** Called after the admin saves, so the next request sees the new values. */
export function invalidateCatalogCache(): void {
  globalForCatalog.__uwCatalog = undefined;
}

export async function catalogPayload(): Promise<CatalogViewModel> {
  await ensureCatalogLoaded();
  return E.catalogViewModel();
}

export async function saveOverrides(rows: RoleOverrideRow[]): Promise<number> {
  let n = 0;
  for (const row of rows) {
    if (!row.roleId || !E.hasRoleDef(row.roleId)) continue;
    await query(
      `INSERT INTO role_overrides (role_id, display_name_th, village_impact, max_copies, enabled, note_th, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (role_id) DO UPDATE SET
         display_name_th = EXCLUDED.display_name_th,
         village_impact  = EXCLUDED.village_impact,
         max_copies      = EXCLUDED.max_copies,
         enabled         = EXCLUDED.enabled,
         note_th         = EXCLUDED.note_th,
         updated_at      = now()`,
      [row.roleId, row.displayNameTh ?? null, row.villageImpact ?? null,
       row.maxCopies ?? null, row.enabled ?? null, row.noteTh ?? null]
    );
    n++;
  }
  invalidateCatalogCache();
  return n;
}

/** Wipes every correction — the admin screen's "คืนค่าเริ่มต้น" button. */
export async function resetOverrides(): Promise<void> {
  await query('DELETE FROM role_overrides');
  invalidateCatalogCache();
  restoreDefaults();
}
