import { query } from './db.ts';

/**
 * Schema drift detection.
 *
 * Deploying new code before running the migrations leaves the app talking to a
 * database that is missing a column, and Postgres answers with something like
 * `column "outcome" of relation "games" does not exist` — accurate, and useless
 * to the person staring at the screen. These checks let the health endpoint say
 * what actually needs doing.
 */

export interface Requirement { table: string; column?: string; since: string }

/** What the current code needs. Add a row here whenever a migration adds one. */
export const REQUIRED: Requirement[] = [
  { table: 'games', since: '001_init.sql' },
  { table: 'events', since: '001_init.sql' },
  { table: 'snapshots', since: '001_init.sql' },
  { table: 'role_overrides', since: '001_init.sql' },
  { table: 'idempotency', since: '001_init.sql' },
  { table: 'rate_limits', since: '002_rate_limit.sql' },
  { table: 'games', column: 'outcome', since: '003_retention.sql' }
];

export interface SchemaCheck {
  ok: boolean;
  missing: string[];
  /** The earliest migration that would fix what is missing. */
  runMigration: string | null;
}

/**
 * Pure half of the check, so the interesting case — a database that is behind —
 * can be tested without vandalising a real one.
 * `haveColumns` entries are "table.column".
 */
export function evaluateSchema(
  haveTables: Iterable<string>,
  haveColumns: Iterable<string>,
  required: Requirement[] = REQUIRED
): SchemaCheck {
  const tables = new Set(haveTables);
  const columns = new Set(haveColumns);

  const missing: string[] = [];
  const pending: string[] = [];
  for (const need of required) {
    const label = need.column ? need.table + '.' + need.column : need.table;
    const present = need.column ? columns.has(label) : tables.has(need.table);
    if (!present) { missing.push(label); pending.push(need.since); }
  }

  return {
    ok: missing.length === 0,
    missing,
    runMigration: pending.length ? pending.sort()[0] : null
  };
}

export async function checkSchema(): Promise<SchemaCheck> {
  const tables = await query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  const columns = await query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");

  return evaluateSchema(
    tables.rows.map((r) => r.table_name),
    columns.rows.map((r) => r.table_name + '.' + r.column_name)
  );
}
