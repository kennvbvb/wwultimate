/**
 * Applies every file in migrations/ once, in filename order.
 * Safe to run repeatedly — applied files are recorded in schema_migrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ต้องตั้ง DATABASE_URL ก่อนรัน migration');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true }
});
await client.connect();
await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())');

const dir = path.join(process.cwd(), 'migrations');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
let applied = 0;

for (const f of files) {
  const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f]);
  if (done.rowCount) continue;
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    await client.query('COMMIT');
    applied++;
    console.log('ใช้ migration แล้ว: ' + f);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('migration ล้มเหลวที่ ' + f + ': ' + e.message);
    process.exit(1);
  }
}

await client.end();
console.log(applied ? 'เสร็จสิ้น ' + applied + ' migration' : 'ฐานข้อมูลเป็นเวอร์ชันล่าสุดอยู่แล้ว');
