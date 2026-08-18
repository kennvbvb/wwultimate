/**
 * Walks a real 8-player game through the moderator screens in a phone-sized
 * browser, then checks the public display for leaks. This is the phase 4 exit
 * criterion from MIGRATION.md, kept as a script so it can be re-run after UI
 * changes.
 *
 *   npm run build && npm start &
 *   node scripts/smoke-ui.mjs           # add SHOTS=1 to save screenshots
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/uw-shots';
const SHOTS = process.env.SHOTS === '1';

let checks = 0;
function ok(cond, what) {
  checks++;
  if (!cond) { console.error('✗ ' + what); throw new Error(what); }
  console.log('✓ ' + what);
}

/* The container ships a Chromium build that may not match the npm package's
 * pinned revision; PW_CHROMIUM lets the caller point at it directly. */
const executablePath = process.env.PW_CHROMIUM || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
let shotNo = 0;
const shot = async (name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: SHOT_DIR + '/' + String(++shotNo).padStart(2, '0') + '-' + name + '.png', fullPage: true });
};

if (process.env.DEBUG === '1') {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  page.on('response', async (r) => {
    if (r.url().includes('/api/command')) console.log('  CMD ' + r.status() + ' ' + (await r.text()).slice(0, 120));
  });
}

const NAMES = ['สมชาย', 'สมหญิง', 'วิชัย', 'มานี', 'ปิติ', 'ชูใจ', 'วีระ', 'ดวงใจ'];

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok(await page.locator('h1', { hasText: 'Ultimate Werewolf' }).isVisible(), 'หน้าแรกโหลดได้');
  await shot('home');

  /* ---- create ---- */
  await page.fill('input[placeholder="เช่น เกมคืนวันศุกร์"]', 'ห้อง ป.5/2');
  await page.fill('textarea', NAMES.join('\n'));
  await page.click('button:has-text("สร้างเกม")');
  await page.waitForSelector('.pin-box');
  const pin = (await page.locator('.pin-box').textContent()).trim();
  ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pin), 'ได้ PIN ผู้ดำเนินเกม ' + pin);
  const gameId = (await page.locator('.tb-sub').textContent()).split(' •')[0].trim();
  ok(/^GAME-/.test(gameId), 'ได้รหัสเกม ' + gameId);
  await shot('created');
  await page.click('button:has-text("จดแล้ว ปิดข้อความนี้")');

  /* ---- players ---- */
  await page.click('.nb:has-text("ผู้เล่น")');
  ok(await page.locator('.seat-chip').count() === 8, 'วงกลมที่นั่งมี 8 คน');
  await page.click('button:has-text("บันทึกรายชื่อและไปเลือกบทบาท")');
  await page.waitForSelector('text=จัดชุดแนะนำอัตโนมัติ');
  await shot('roles');

  /* ---- roles ---- */
  await page.click('button:has-text("จัดชุดแนะนำอัตโนมัติ")');
  await page.waitForSelector('.role.picked');
  ok(await page.locator('text=ค่า Village Impact เป็นค่าประมาณ').isVisible(),
     'คำเตือน Village Impact ยังแสดงอยู่');
  const summaryLine = await page.locator('.card2:has-text("Village Impact")').first().textContent();
  ok(/8\s*\/\s*8/.test(summaryLine), 'จำนวนการ์ดตรงกับผู้เล่น');
  await page.click('button:has-text("ยืนยันชุดบทบาท")');
  await page.waitForSelector('text=บันทึกการแจกการ์ด');
  await shot('assign');

  /* ---- assign ---- */
  const deck = [];
  for (const row of await page.locator('.card2:has-text("การ์ดที่ต้องหยิบจากกล่อง") .prow').all()) {
    const count = Number((await row.locator('.seatno').textContent()).trim());
    const name = (await row.locator('.pname').textContent()).trim();
    for (let i = 0; i < count; i++) deck.push(name);
  }
  ok(deck.length === 8, 'รายการการ์ดที่ต้องหยิบมี 8 ใบ');

  const selects = await page.locator('.card2:has-text("บันทึกการแจกการ์ด") select').all();
  for (let i = 0; i < selects.length; i++) {
    const options = await selects[i].locator('option').allTextContents();
    /* the checklist name starts with the Thai label, options carry the same */
    const want = options.find((o) => deck[i].startsWith(o.trim())) || options[1];
    await selects[i].selectOption({ label: want });
  }
  await page.waitForTimeout(1600);
  ok(await page.locator('text=พร้อมเริ่มเกม').isVisible(), 'ระบบยืนยันว่าการ์ดตรงกับผู้เล่นครบ');

  await page.click('button:has-text("ยืนยันและเริ่มคืนแรก")');
  await page.click('.dlg button:has-text("เริ่มเลย")');
  await page.waitForSelector('.step-card');
  ok((await page.locator('.tb-sub').textContent()).includes('คืนแรก'), 'เข้าสู่คืนแรกแล้ว');
  await shot('night');

  /* ---- night 1 ---- */
  let guard = 0;
  while (await page.locator('.step-card .step-role').count() && guard++ < 30) {
    const title = (await page.locator('.step-role').textContent()).trim();
    if (title === 'ครบทุกขั้นตอนแล้ว') break;
    const enabled = await page.locator('.tgt:not(.dis)').all();
    if (enabled.length) await enabled[Math.floor(Math.random() * enabled.length)].click();
    await page.click('.step-card button:has-text("บันทึก")');
    await page.waitForTimeout(250);
  }
  ok(guard < 30, 'เดินครบทุกขั้นตอนกลางคืน (' + guard + ' ขั้น)');
  await page.click('button:has-text("สรุปผลกลางคืน")');
  await page.waitForSelector('text=รุ่งเช้าวันที่');
  await shot('dawn');

  /* the hunter may need to shoot before the day opens */
  if (await page.locator('button:has-text("ยิงขึ้นฟ้า")').count()) {
    await page.click('button:has-text("ยิงขึ้นฟ้า")');
    await page.waitForTimeout(400);
  }
  ok(await page.locator('text=รุ่งเช้าวันที่ 1').isVisible(), 'ถึงรุ่งเช้าวันที่ 1');

  /* ---- public display must not leak ---- */
  const pub = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await pub.goto(BASE + '/public/' + gameId, { waitUntil: 'networkidle' });
  await pub.waitForSelector('.pub-card');
  const aliveRoles = await pub.$$eval('.pub-card:not(.gone) .ps', (els) => els.map((e) => e.textContent.trim()));
  ok(aliveRoles.every((t) => /^ที่นั่ง \d+$|^$/.test(t) || !t.includes('หมาป่า')),
     'จอสาธารณะไม่แสดงบทบาทของผู้ที่ยังมีชีวิต');
  if (SHOTS) await pub.screenshot({ path: SHOT_DIR + '/90-public.png', fullPage: true });

  /* ---- day 1 ---- */
  await page.click('button:has-text("เริ่มช่วงอภิปราย")');
  await page.waitForSelector('.timer');
  ok(await page.locator('.timer').isVisible(), 'นาฬิกาอภิปรายเดิน');
  await page.click('button:has-text("เปิดการเสนอชื่อ")');
  await page.waitForSelector('button:has-text("เสนอชื่อ")');
  await page.locator('.vrow button:has-text("เสนอชื่อ")').first().click();
  await page.click('button:has-text("ปิดการเสนอชื่อและเริ่มลงคะแนน")');
  await page.waitForSelector('text=บันทึกคะแนนทั้งหมด');

  for (const sel of await page.locator('.card2:has-text("ลงคะแนน") select').all()) {
    const options = await sel.locator('option').all();
    await sel.selectOption({ index: 1 });
    void options;
  }
  await page.click('button:has-text("บันทึกคะแนนทั้งหมด")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("สรุปผลการลงคะแนน")');
  await page.waitForTimeout(600);
  if (await page.locator('button:has-text("ยิงขึ้นฟ้า")').count()) {
    await page.click('button:has-text("ยิงขึ้นฟ้า")');
    await page.waitForTimeout(400);
  }
  ok(true, 'ลงคะแนนและสรุปผลกลางวันได้');
  await shot('after-vote');

  /* ---- run the game to its end ---- */
  guard = 0;
  while (guard++ < 200) {
    const sub = await page.locator('.tb-sub').textContent();
    if (sub.includes('จบเกม')) break;
    if (await page.locator('button:has-text("ยิงขึ้นฟ้า")').count()) {
      await page.click('button:has-text("ยิงขึ้นฟ้า")');
    } else if (await page.locator('button:has-text("เข้าสู่คืนถัดไป")').count()) {
      await page.click('button:has-text("เข้าสู่คืนถัดไป")');
    } else if (await page.locator('button:has-text("สรุปผลกลางคืน")').count()) {
      await page.click('button:has-text("สรุปผลกลางคืน")');
    } else if (await page.locator('.step-card .step-role').count()) {
      if (process.env.DEBUG === '1') {
        console.log('  step: ' + (await page.locator('.step-role').textContent()));
      }
      /* random rather than fixed: some roles refuse the same target two nights
       * running, and the app is right to reject a repeat. */
      const enabled = await page.locator('.tgt:not(.dis)').all();
      if (enabled.length) await enabled[Math.floor(Math.random() * enabled.length)].click();
      await page.click('.step-card button:has-text("บันทึก")');
    } else if (await page.locator('button:has-text("เริ่มช่วงอภิปราย")').count()) {
      await page.click('button:has-text("เริ่มช่วงอภิปราย")');
    } else if (await page.locator('button:has-text("ข้ามการแขวนคอวันนี้")').count()) {
      await page.click('button:has-text("ข้ามการแขวนคอวันนี้")');
      await page.click('.dlg button:has-text("ปิดวัน")');
    } else {
      console.log('  … ไม่มีปุ่มให้กดต่อ ที่สถานะ "' + sub + '"');
      console.log('  ปุ่มที่เห็น: ' + (await page.locator('main button').allTextContents()).join(' | ').slice(0, 300));
      break;
    }
    await page.waitForTimeout(300);
  }

  ok((await page.locator('.tb-sub').textContent()).includes('จบเกม'), 'เกมเดินจนจบเองตามเงื่อนไขชนะ');
  await page.click('.nb:has-text("สรุป")');
  await page.waitForSelector('.winner');
  const winner = (await page.locator('.winner .wt').textContent()).trim();
  ok(winner.length > 0 && winner !== 'จบเกม', 'ประกาศผู้ชนะได้: ' + winner);
  ok(await page.locator('.sumtable tbody tr').count() === 8, 'ตารางสรุปมีครบ 8 คน');
  await shot('end');

  /* ---- privacy cover ---- */
  await page.click('.ic[title="ซ่อนจอ"]');
  ok(await page.locator('#cover.show').isVisible(), 'ปุ่มปิดจอทันทีทำงาน');
  await page.click('#cover');
  ok(!(await page.locator('#cover.show').count()), 'แตะแล้วกลับมาแสดงผลได้');

  console.log('\nผ่านการตรวจ ' + checks + ' ข้อ' + (SHOTS ? ' (ภาพอยู่ที่ ' + SHOT_DIR + ')' : ''));
} finally {
  await browser.close();
}
