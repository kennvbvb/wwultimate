import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

/**
 * One pool per warm instance. Vercel recycles instances freely, so the pool is
 * kept on globalThis: without that, every hot reload in dev (and every module
 * re-evaluation) would open a second pool and slowly exhaust Neon's connection
 * limit. Small max, because a serverless instance handles one request at a time.
 */
const globalForDb = globalThis as unknown as { __uwPool?: pg.Pool };

function isLocal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

export function getPool(): pg.Pool {
  if (globalForDb.__uwPool) return globalForDb.__uwPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('ยังไม่ได้ตั้งค่า DATABASE_URL');
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal(connectionString) ? undefined : { rejectUnauthorized: true }
  });
  /* An idle client dying (Neon auto-suspend) must not take the process with it. */
  pool.on('error', (err) => { console.error('pg pool error', err.message); });
  globalForDb.__uwPool = pool;
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string, params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as never[]);
}

/** Runs fn inside a transaction, rolling back on any thrown error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Closes the pool. Only tests need this; serverless instances just get recycled. */
export async function closePool(): Promise<void> {
  if (!globalForDb.__uwPool) return;
  const pool = globalForDb.__uwPool;
  globalForDb.__uwPool = undefined;
  await pool.end();
}
