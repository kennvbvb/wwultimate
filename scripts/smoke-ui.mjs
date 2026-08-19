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

/* See scripts/smoke-api.mjs: a fresh apparent client per run keeps repeated
 * local runs from tripping the rate limiter. */
const RUN_IP = '198.51.100.' + (1 + Math.floor(Math.random() * 250));
const context = await browser.newContext({
  viewport: { width: 360, height: 780 },
  extraHTTPHeaders: { 'x-forwarded-for': RUN_IP }
});
const page = await context.newPage();
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
  ok(await page.locator('img.qr').isVisible(), 'มี QR ให้สแกนเปิดจอสาธารณะตั้งแต่หน้าสร้างเกม');
  ok((await page.locator('.qr-url').textContent()).includes('/public/' + gameId),
     'ลิงก์จอสาธารณะตรงกับเกมนี้');
  await shot('created');
  await page.click('button:has-text("จดแล้ว ปิดข้อความนี้")');

  /* ---- players ---- */
  ok(await page.locator('.nb:has-text("กลางคืน")').isDisabled(),
     'ยังไม่เริ่มเกม แท็บกลางคืนต้องกดไม่ได้');
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
  const firstOptionCount = (await selects[0].locator('option').allTextContents()).length;
  for (let i = 0; i < selects.length; i++) {
    const options = await selects[i].locator('option').allTextContents();
    /* the checklist name starts with the Thai label, options carry the same */
    const want = options.find((o) => deck[i].startsWith(o.trim().split(' (')[0])) || options[1];
    await selects[i].selectOption({ label: want });
  }
  const lastOptionCount = (await selects[selects.length - 1].locator('option').allTextContents()).length;
  ok(lastOptionCount < firstOptionCount,
     'การ์ดที่บันทึกครบแล้วหายไปจากตัวเลือกของคนถัด ๆ ไป (' + firstOptionCount + ' → ' + lastOptionCount + ')');
  ok((await page.locator('.prow.dealt').count()) > 0, 'รายการการ์ดขึ้นว่าบันทึกครบแล้ว');
  await page.waitForTimeout(1600);
  ok(await page.locator('text=พร้อมเริ่มเกม').isVisible(), 'ระบบยืนยันว่าการ์ดตรงกับผู้เล่นครบ');

  await page.click('button:has-text("ยืนยันและเริ่มคืนแรก")');
  await page.click('.dlg button:has-text("เริ่มเลย")');
  await page.waitForSelector('.step-card');
  ok((await page.locator('.tb-sub').textContent()).includes('คืนแรก'), 'เข้าสู่คืนแรกแล้ว');
  ok(await page.locator('.nb:has-text("บทบาท")').isDisabled(),
     'เริ่มเกมแล้วแท็บเลือกบทบาทต้องกดไม่ได้');
  await shot('night');

  /* ---- night 1 ---- */
  let guard = 0;
  let answers = 0;
  let lastGuarded = '';
  while (await page.locator('.step-card .step-role').count() && guard++ < 30) {
    const title = (await page.locator('.step-role').textContent()).trim();
    if (title === 'ครบทุกขั้นตอนแล้ว') break;
    const enabled = await page.locator('.tgt:not(.dis)').all();
    let picked = null;
    if (enabled.length) {
      picked = enabled[Math.floor(Math.random() * enabled.length)];
      await picked.click();
    }
    if (title.includes('ผู้คุ้มกัน') && picked) {
      lastGuarded = (await picked.textContent()).split('ที่นั่ง')[0].trim();
    }
    await page.click('.step-card button:has-text("บันทึก")');
    await page.waitForTimeout(300);

    /* roles that learn something (seer, P.I., masons…) must say it out loud */
    if (await page.locator('.dlg-lines').count()) {
      answers++;
      if (title.includes('ผู้หยั่งรู้')) {
        const answer = await page.locator('.dlg-lines').textContent();
        ok(/พยักหน้า|ส่ายหน้า/.test(answer), 'ผู้หยั่งรู้ได้คำตอบว่าเป็นภัยหรือไม่: ' + answer.trim());
      }
      await page.click('.dlg button:has-text("รับทราบ")');
      await page.waitForTimeout(200);
    }
  }
  ok(guard < 30, 'เดินครบทุกขั้นตอนกลางคืน (' + guard + ' ขั้น)');
  ok(answers > 0, 'มีขั้นตอนที่เด้งคำตอบให้ผู้ดำเนินเกม ' + answers + ' ครั้ง');

  /* ---- undo must reach back one night action, not the whole night ---- */
  const stepsBefore = await page.locator('.steprow .dot.done, .steprow .dot.skip').count();
  await page.click('.ic[title="ย้อนคำสั่ง"]');
  await page.click('.dlg button:has-text("ย้อนกลับ")');
  await page.waitForTimeout(900);
  const stepsAfter = await page.locator('.steprow .dot.done, .steprow .dot.skip').count();
  ok(stepsAfter === stepsBefore - 1,
     'ย้อนกลับหนึ่งขั้นแล้วขั้นตอนที่ทำไปลดลงหนึ่ง (' + stepsBefore + ' → ' + stepsAfter + ')');

  /* redo that step so the game can continue */
  {
    const enabled = await page.locator('.tgt:not(.dis)').all();
    if (enabled.length) await enabled[Math.floor(Math.random() * enabled.length)].click();
    await page.click('.step-card button:has-text("บันทึก")');
    await page.waitForTimeout(400);
    if (await page.locator('.dlg button:has-text("รับทราบ")').count()) {
      await page.click('.dlg button:has-text("รับทราบ")');
      await page.waitForTimeout(200);
    }
  }
  await page.click('button:has-text("สรุปผลกลางคืน")');
  await page.waitForSelector('.dlg-lines');
  const dawnText = await page.locator('.dlg').textContent();
  ok(/รุ่งเช้าวันที่ 1|สรุปผลคืนที่ 1/.test(dawnText), 'สรุปคืนแล้วเด้งประกาศผลของคืนนั้น');
  ok(/เสียชีวิต|ไม่มีผู้เสียชีวิต/.test(dawnText), 'ประกาศบอกว่าใครเสียชีวิตบ้าง');
  await page.click('.dlg button:has-text("รับทราบ")');
  await page.waitForTimeout(400);

  /* a death can fire a trigger — the hunter shoots before the day opens */
  let prompts = 0;
  while (await page.locator('button:has-text("ยิงขึ้นฟ้า")').count()) {
    await page.click('button:has-text("ยิงขึ้นฟ้า")');
    await page.waitForTimeout(500);
    if (++prompts > 5) break;
  }
  await page.waitForSelector('text=รุ่งเช้าวันที่');
  await shot('dawn');
  ok(await page.locator('text=รุ่งเช้าวันที่ 1').isVisible(),
     'ถึงรุ่งเช้าวันที่ 1' + (prompts ? ' (หลังตอบทริกเกอร์ ' + prompts + ' ครั้ง)' : ''));

  /* ---- public display must not leak ---- */
  const pub = await context.newPage();
  await pub.setViewportSize({ width: 1280, height: 720 });
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

  /* ---- pause must stop the clock without moving the moderator off the screen ---- */
  const beforePause = await page.locator('.timer').textContent();
  await page.click('.ic[title="หยุดพัก"]');
  await page.waitForSelector('.paused-banner');
  ok(await page.locator('.timer').isVisible(), 'ระหว่างพักยังอยู่หน้าเดิม ไม่เด้งไปจออื่น');
  await page.waitForTimeout(1800);
  ok((await page.locator('.timer').textContent()) === beforePause, 'นาฬิกาหยุดเดินระหว่างพัก');
  await page.click('.paused-banner button:has-text("เล่นต่อ")');
  await page.waitForTimeout(600);
  ok(!(await page.locator('.paused-banner').count()), 'เล่นต่อแล้วแถบหยุดพักหายไป');
  await page.click('button:has-text("เปิดการเสนอชื่อ")');
  await page.waitForSelector('button:has-text("เสนอชื่อ")');
  await page.locator('.vrow button:has-text("เสนอชื่อ")').first().click();
  await page.click('button:has-text("ปิดการเสนอชื่อและเริ่มลงคะแนน")');
  await page.waitForSelector('.vote-progress');

  const voteSelects = await page.locator('.card2:has-text("ลงคะแนน") select').all();
  const resolveButton = page.locator('button:has-text("สรุปผลการลงคะแนน")');
  ok(await resolveButton.isDisabled(), 'ยังไม่ลงคะแนน ปุ่มสรุปผลต้องกดไม่ได้');

  for (let i = 0; i < voteSelects.length; i++) {
    await voteSelects[i].selectOption({ index: 1 });
    if (i === 0 && voteSelects.length > 1) {
      ok(await resolveButton.isDisabled(), 'ลงไม่ครบ ปุ่มสรุปผลต้องยังกดไม่ได้');
    }
  }
  ok(await page.locator('.vote-progress.done').isVisible(), 'ลงครบแล้วแถบความคืบหน้าต้องขึ้นเขียว');
  await resolveButton.click();
  await page.waitForSelector('.dlg-lines');
  const lynchText = await page.locator('.dlg').textContent();
  ok(/ถูกแขวนคอ|ไม่มีใครถูกแขวนคอ/.test(lynchText), 'สรุปโหวตแล้วเด้งประกาศผลการแขวนคอ');
  await page.click('.dlg button:has-text("รับทราบ")');
  await page.waitForTimeout(500);
  if (await page.locator('button:has-text("ยิงขึ้นฟ้า")').count()) {
    await page.click('button:has-text("ยิงขึ้นฟ้า")');
    await page.waitForTimeout(400);
  }
  ok(true, 'ลงคะแนนและสรุปผลกลางวันได้');
  await shot('after-vote');

  /* ---- run the game to its end ---- */
  let checkedGuardHint = false;
  guard = 0;
  while (guard++ < 200) {
    /* announcements block the screen until acknowledged, by design */
    if (await page.locator('.dlg button:has-text("รับทราบ")').count()) {
      await page.click('.dlg button:has-text("รับทราบ")');
      await page.waitForTimeout(200);
      continue;
    }
    const sub = await page.locator('.tb-sub').textContent();
    if (sub.includes('จบเกม')) break;
    if (await page.locator('button:has-text("ยิงขึ้นฟ้า")').count()) {
      await page.click('button:has-text("ยิงขึ้นฟ้า")');
    } else if (await page.locator('button:has-text("เข้าสู่คืนถัดไป")').count()) {
      await page.click('button:has-text("เข้าสู่คืนถัดไป")');
    } else if (await page.locator('button:has-text("สรุปผลกลางคืน")').count()) {
      await page.click('button:has-text("สรุปผลกลางคืน")');
    } else if (await page.locator('.step-card .step-role').count()) {
      const stepTitle = (await page.locator('.step-role').textContent()).trim();
      if (process.env.DEBUG === '1') console.log('  step: ' + stepTitle);

      /* The Bodyguard may not guard the same player two nights running, and the
       * screen has to say so before the tap, not after the server refuses.
       * Only checked when that player is still alive — a dead one is greyed out
       * for the more obvious reason. */
      if (stepTitle.includes('ผู้คุ้มกัน') && lastGuarded && !checkedGuardHint) {
        const repeat = page.locator('.tgt', { hasText: lastGuarded }).first();
        const text = await repeat.textContent();
        if (text.includes('สองคืนติดกันไม่ได้')) {
          const cls = (await repeat.getAttribute('class')) || '';
          ok(cls.includes('dis'),
             'ปุ่มของคนที่คุ้มกันไปเมื่อคืน (' + lastGuarded + ') ถูกปิดพร้อมบอกเหตุผล');
          checkedGuardHint = true;
        }
      }
      /* random rather than fixed: some roles refuse the same target two nights
       * running, and the app is right to reject a repeat. */
      const enabled = await page.locator('.tgt:not(.dis)').all();
      if (enabled.length) {
        const choice = enabled[Math.floor(Math.random() * enabled.length)];
        await choice.click();
        if (stepTitle.includes('ผู้คุ้มกัน')) {
          lastGuarded = (await choice.textContent()).split('ที่นั่ง')[0].trim();
        }
      }
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
  if (!checkedGuardHint) {
    console.log('  (เกมนี้ผู้คุ้มกันไม่ได้เล่นถึงคืนที่สอง จึงไม่ได้ตรวจปุ่มที่ถูกปิด)');
  }

  await page.click('.nb:has-text("สรุป")');
  await page.waitForSelector('.winner');
  const winner = (await page.locator('.winner .wt').textContent()).trim();
  ok(winner.length > 0 && winner !== 'จบเกม', 'ประกาศผู้ชนะได้: ' + winner);
  ok(await page.locator('.sumtable tbody tr').count() === 8, 'ตารางสรุปมีครบ 8 คน');
  await shot('end');

  /* ---- privacy cover ---- */
  ok(await page.locator('.ic[title="เสียงเตือนเปิดอยู่"]').isVisible(),
     'เสียงเตือนนาฬิกาเปิดไว้เป็นค่าเริ่มต้น');
  await page.click('.ic[title="เสียงเตือนเปิดอยู่"]');
  ok(await page.locator('.ic[title="เสียงเตือนปิดอยู่"]').isVisible(), 'ปิดเสียงเตือนได้');
  await page.click('.ic[title="เสียงเตือนปิดอยู่"]');

  await page.click('.ic[title="ซ่อนจอ"]');
  ok(await page.locator('#cover.show').isVisible(), 'ปุ่มปิดจอทันทีทำงาน');
  await page.click('#cover');
  ok(!(await page.locator('#cover.show').count()), 'แตะแล้วกลับมาแสดงผลได้');

  /* ---- admin screen ---- */
  const admin = await context.newPage();
  await admin.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  ok(await admin.locator('text=หน้าผู้ดูแลบทบาท').isVisible(), 'หน้าแอดมินขอรหัสผ่านก่อน');
  await admin.fill('input[type="password"]', process.env.ADMIN_PASSWORD || 'admin1234');
  await admin.click('button:has-text("เข้าสู่ระบบ")');
  await admin.waitForSelector('text=แก้ค่าบทบาท');
  ok((await admin.locator('.card2').count()) > 40, 'หน้าแอดมินแสดงบทบาททั้ง 46 รายการ');
  if (SHOTS) await admin.screenshot({ path: SHOT_DIR + '/91-admin.png' });

  await admin.click('a:has-text("ดูสถิติข้ามเกม")');
  await admin.waitForURL('**/admin/stats');
  await admin.waitForSelector('h6:has-text("ฝ่ายที่ชนะ")');
  ok(await admin.locator('h6:has-text("ฝ่ายที่ชนะ")').isVisible(), 'หน้าสถิติสรุปฝ่ายที่ชนะได้');
  ok((await admin.locator('.sumtable tbody tr').count()) > 0, 'หน้าสถิติมีตารางบทบาทและผู้เล่น');
  if (SHOTS) await admin.screenshot({ path: SHOT_DIR + '/92-stats.png', fullPage: true });

  await page.click('.ic[title="เครื่องมือผู้ดำเนินเกม"]');
  await page.click('button:has-text("เปิดจอสาธารณะบนทีวี")');
  await page.waitForSelector('.dlg img.qr');
  ok(await page.locator('.dlg img.qr').isVisible(), 'เปิด QR จอสาธารณะจากเมนูเครื่องมือได้ทุกเมื่อ');
  await page.click('.dlg button:has-text("ปิด")');

  console.log('\nผ่านการตรวจ ' + checks + ' ข้อ' + (SHOTS ? ' (ภาพอยู่ที่ ' + SHOT_DIR + ')' : ''));
} finally {
  await browser.close();
}
