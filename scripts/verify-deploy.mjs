/**
 * Read-only health check for a deployed instance.
 *
 * Unlike scripts/smoke-api.mjs this creates nothing and changes nothing, so it
 * is safe to point at production: every request below is a GET, and the only
 * game id it asks for is one that cannot exist.
 *
 *   node scripts/verify-deploy.mjs https://your-app.vercel.app
 */
const BASE = (process.argv[2] || process.env.SMOKE_BASE || '').replace(/\/$/, '');
if (!BASE) {
  console.error('ใช้: node scripts/verify-deploy.mjs https://ที่อยู่ของเว็บ');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const notes = [];

function ok(cond, what, detail) {
  if (cond) { passed++; console.log('✓ ' + what); }
  else { failed++; console.log('✗ ' + what + (detail ? ' — ' + detail : '')); }
}

async function get(path, init) {
  try {
    const res = await fetch(BASE + path, { redirect: 'manual', ...init });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { res, body, status: res.status };
  } catch (e) {
    return { res: null, body: null, status: 0, error: e.message };
  }
}

console.log('ตรวจ ' + BASE + '\n');

/* ---- the app is up ---- */
const home = await get('/');
ok(home.status === 200, 'หน้าแรกตอบ 200', home.error || ('ได้ ' + home.status));

/* ---- database ---- */
const health = await get('/api/health');
ok(health.body?.db === 'up',
   'ต่อฐานข้อมูลได้ (/api/health)',
   'ได้ ' + health.status + ' — ตรวจ DATABASE_URL ของ deployment');

/* The commonest way this app breaks in production is code that shipped ahead of
 * its migrations, so it gets a check of its own with the fix spelled out. */
ok(health.body?.schema === 'ok',
   'ฐานข้อมูลอัปเดตครบทุก migration',
   health.body?.hint || 'ได้ schema=' + (health.body?.schema ?? '—') + ' — รัน npm run db:migrate');

ok(health.status === 200 && health.body?.ok === true,
   'สถานะรวมของระบบเป็นปกติ', 'ได้ ' + health.status);
if (health.body?.appVersion) notes.push('เวอร์ชันที่ deploy อยู่: ' + health.body.appVersion);

/* ---- role catalog ---- */
const boot = await get('/api/bootstrap');
ok(boot.status === 200 && boot.body?.catalog?.roles?.length === 46,
   'โหลดบทบาทครบ 46 รายการ',
   'ได้ ' + (boot.body?.catalog?.roles?.length ?? '—'));
ok(boot.body && boot.body.openGames === undefined,
   'ไม่แจกรายการเกมที่ยังเล่นอยู่ให้คนทั่วไป');
if (boot.body?.catalog && boot.body.catalog.impactVerified === false) {
  notes.push('ค่า Village Impact ยังไม่ได้ยืนยัน — หน้าเลือกบทบาทจะขึ้นคำเตือนไว้');
}

/* ---- migrations actually applied ---- */
const missing = await get('/api/public/GAME-ZZZZZZ');
ok(missing.status === 404, 'เกมที่ไม่มีอยู่ตอบ 404 (อ่านฐานข้อมูลได้จริง)', 'ได้ ' + missing.status);

/* ---- authorisation ---- */
const game = await get('/api/game/GAME-ZZZZZZ');
ok(game.status === 401, 'จอผู้ดำเนินเกมต้องมี PIN ก่อน', 'ได้ ' + game.status);
const admin = await get('/api/admin/roles');
ok(admin.status === 401, 'หน้าผู้ดูแลต้องมีรหัสผ่านก่อน', 'ได้ ' + admin.status);
const stats = await get('/api/admin/stats');
ok(stats.status === 401, 'สถิติข้ามเกมต้องมีรหัสผ่านก่อน', 'ได้ ' + stats.status);

/* ---- login must not double as a game-id oracle ---- */
const login = await get('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ gameId: 'GAME-ZZZZZZ', pin: '0000-0000' })
});
ok(login.status === 401 && !/ไม่พบเกม/.test(login.body?.error || ''),
   'ล็อกอินผิดไม่บอกว่าเกมมีอยู่จริงหรือไม่', login.body?.error || ('ได้ ' + login.status));

/* ---- browser protections ---- */
const headers = home.res?.headers;
const csp = headers?.get('content-security-policy') || '';
ok(/frame-ancestors 'none'/.test(csp), 'CSP ห้ามฝังหน้าเว็บใน iframe');
ok(headers?.get('x-content-type-options') === 'nosniff', 'มี X-Content-Type-Options');
ok(!!headers?.get('referrer-policy'), 'มี Referrer-Policy');
ok(/^https:/.test(BASE) ? !!headers?.get('strict-transport-security') : true,
   'มี HSTS (เฉพาะ https)');

/* ---- realtime ---- */
try {
  const controller = new AbortController();
  const stream = await fetch(BASE + '/api/stream/GAME-ZZZZZZ', {
    headers: { accept: 'text/event-stream' }, signal: controller.signal
  });
  const chunk = await stream.body.getReader().read();
  const text = new TextDecoder().decode(chunk.value || new Uint8Array());
  controller.abort();
  ok(stream.status === 200 && /retry:|event:/.test(text), 'สตรีมอัปเดต (SSE) เปิดได้');
} catch (e) {
  ok(false, 'สตรีมอัปเดต (SSE) เปิดได้', e.message);
}

console.log('\n' + '='.repeat(52));
console.log('ผ่าน ' + passed + ' / ล้มเหลว ' + failed);
for (const note of notes) console.log('• ' + note);
console.log('='.repeat(52));
if (health.body?.schema === 'outdated') {
  console.log('\nวิธีแก้: ดึงค่า environment ของ production มาแล้วรัน migration');
  console.log('  vercel env pull .env.local');
  console.log('  npm run db:migrate');
}
if (!failed) {
  console.log('\nขั้นต่อไป: สร้างเกมทดสอบหนึ่งเกมบนเว็บจริง เดินให้จบหนึ่งคืน แล้วลบทิ้งที่ /admin');
}
process.exit(failed ? 1 : 0);
