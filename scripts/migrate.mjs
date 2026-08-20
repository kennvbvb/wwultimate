/**
 * Applies every file in migrations/ once, in filename order.
 * Safe to run repeatedly — applied files are recorded in schema_migrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/* Run by hand from a terminal, usually right after `vercel env pull`, so the
 * connection string is expected in a file rather than the environment. A real
 * environment variable still wins — that is how the test runner passes its own. */
if (!process.env.DATABASE_URL) {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    try { process.loadEnvFile(full); } catch { /* an unreadable file is not fatal */ }
    if (process.env.DATABASE_URL) { console.log('อ่านค่าจาก ' + file); break; }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ไม่พบ DATABASE_URL');
  console.error('เลือกอย่างใดอย่างหนึ่ง:');
  console.error('  1) ดึงค่าจาก Vercel:  vercel env pull .env.local   แล้วรันคำสั่งนี้อีกครั้ง');
  console.error('  2) ใส่ค่าตรง ๆ:        DATABASE_URL="postgres://..." npm run db:migrate');
  process.exit(1);
}

/* Says which database is about to change, without printing the password. */
console.log('ฐานข้อมูลปลายทาง: ' + url.replace(/\/\/[^@]*@/, '//***@'));

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true }
});
try {
  await client.connect();
} catch (e) {
  /* The stack trace of a refused TCP connect helps nobody; the two things worth
   * checking are whether the string is right and whether the database is awake. */
  console.error('ต่อฐานข้อมูลไม่ได้: ' + e.message);
  console.error('ตรวจว่า DATABASE_URL ถูกต้อง และฐานข้อมูลเปิดอยู่');
  process.exit(1);
}
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
