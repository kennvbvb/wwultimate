/**
 * storage.test.js — the persistence layer against a real Postgres.
 * Replaces the Sheets-era "ชั้นจัดเก็บข้อมูลและประสิทธิภาพ" tests: chunking,
 * row-index caching and deleteRow() counting are all gone with Sheets, while
 * everything they protected (idempotency, versions, undo) is checked here.
 */
import { test, after } from 'node:test';
import * as E from '../lib/engine.generated.js';
import * as S from '../lib/storage.ts';
import { closePool, query } from '../lib/db.ts';
import { assert, eq, throws } from './helpers.js';

after(() => closePool());

function names(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push('ผู้เล่น' + i);
  return out;
}

async function newStoredGame(n) {
  const created = await S.createGame({ playerNames: names(n || 8), title: 'เกมทดสอบ' });
  return { gameId: created.view.gameId, pin: created.moderatorPin, version: created.view.version };
}

async function rejects(fn, msg) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || 'คาดว่าจะต้องเกิดข้อผิดพลาด');
}

test('บันทึกแล้วอ่านกลับได้ครบถ้วน', async () => {
  const g = await newStoredGame(8);
  const view = await S.moderatorView(g.gameId);
  eq(view.gameId, g.gameId, 'อ่านเกมเดิมกลับมาได้');
  eq(view.players.length, 8, 'จำนวนผู้เล่นครบ');
  eq(view.title, 'เกมทดสอบ', 'ชื่อเกมถูกบันทึก');

  const open = await S.listOpenGames();
  assert(open.some((r) => r.gameId === g.gameId), 'เกมใหม่ต้องอยู่ในรายการเกมที่เปิดอยู่');
});

test('PIN ผิดเข้าไม่ได้ และ PIN ถูกเก็บเป็น hash เท่านั้น', async () => {
  const g = await newStoredGame(5);
  eq(await S.verifyPin(g.gameId, g.pin), true, 'PIN ถูกต้องต้องผ่าน');
  eq(await S.verifyPin(g.gameId, g.pin.toLowerCase()), true, 'PIN ไม่สนตัวพิมพ์เล็กใหญ่');
  eq(await S.verifyPin(g.gameId, '0000-0000'), false, 'PIN ผิดต้องไม่ผ่าน');
  eq(await S.verifyPin(g.gameId, ''), false, 'PIN ว่างต้องไม่ผ่าน');

  const row = await query('SELECT pin_hash, state FROM games WHERE game_id = $1', [g.gameId]);
  assert(row.rows[0].pin_hash.startsWith('$2'), 'ต้องเก็บเป็น bcrypt hash');
  assert(row.rows[0].pin_hash.indexOf(g.pin) < 0, 'ห้ามมี PIN ดิบอยู่ใน hash');
  eq(row.rows[0].state.moderatorPin, '', 'ห้ามเก็บ PIN ดิบไว้ใน state');
});

test('ตรวจเวอร์ชันซ้อนทับยังทำงาน กันคำสั่งค้างจากจอเก่า', async () => {
  const g = await newStoredGame(5);
  const cmd = { gameId: g.gameId, expectedVersion: g.version, action: 'setPlayers' };
  const after1 = await S.runCommand(cmd, 'ตั้งรายชื่อผู้เล่น', false, (st) => E.setPlayers(st, names(6)));
  eq(after1.version, g.version + 1, 'เวอร์ชันต้องเพิ่มทีละหนึ่ง');
  eq(after1.players.length, 6, 'คำสั่งมีผลจริง');

  await rejects(
    () => S.runCommand(cmd, 'ตั้งรายชื่อผู้เล่น', false, (st) => E.setPlayers(st, names(7))),
    'ส่งเวอร์ชันเก่าซ้ำต้องถูกปฏิเสธ');

  const now = await S.moderatorView(g.gameId);
  eq(now.players.length, 6, 'คำสั่งที่ถูกปฏิเสธต้องไม่เปลี่ยนข้อมูล');
});

test('idempotencyKey เดิมต้องไม่ทำงานซ้ำสองรอบ', async () => {
  const g = await newStoredGame(5);
  const cmd = { gameId: g.gameId, expectedVersion: g.version, idempotencyKey: 'KEY-1', action: 'setPlayers' };
  const r1 = await S.runCommand(cmd, 'ตั้งรายชื่อผู้เล่น', false, (st) => E.setPlayers(st, names(9)));
  const r2 = await S.runCommand(cmd, 'ตั้งรายชื่อผู้เล่น', false, (st) => E.setPlayers(st, names(9)));
  eq(r2.version, r1.version, 'ส่งซ้ำด้วยคีย์เดิมต้องได้ผลเดิม ไม่เพิ่มเวอร์ชัน');

  const view = await S.moderatorView(g.gameId);
  eq(view.version, r1.version, 'ฐานข้อมูลต้องไม่ถูกแก้ซ้ำ');
});

test('snapshot และการย้อนคำสั่งกลับสถานะเดิมได้', async () => {
  const g = await newStoredGame(6);
  await S.runCommand({ gameId: g.gameId, expectedVersion: g.version, action: 'configureGame' },
    'ตั้งค่ากติกา', false, (st) => E.configureGame(st, {
      selectedRoles: [{ roleId: 'werewolf', count: 1 }, { roleId: 'villager', count: 5 }]
    }));

  const before = await S.moderatorView(g.gameId);
  eq(before.rolesLocked, false, 'ยังไม่ล็อกการแจกบทบาท');

  await S.runCommand({ gameId: g.gameId, expectedVersion: before.version, action: 'assignRoles' },
    'บันทึกการแจกบทบาท', false, (st) => E.assignRoles(st, st.players.map((p, i) => ({
      playerId: p.playerId, roleId: i === 0 ? 'werewolf' : 'villager'
    }))));

  const ready = await S.moderatorView(g.gameId);
  const started = await S.runCommand({ gameId: g.gameId, expectedVersion: ready.version, action: 'startGame' },
    'เริ่มเกม', true, (st) => E.startGame(st));
  eq(started.status, 'FIRST_NIGHT', 'เริ่มเกมแล้วเข้าคืนแรก');

  const undone = await S.undoLastCommand(g.gameId);
  eq(undone.status, 'ROLE_ASSIGNMENT', 'ย้อนกลับไปก่อนเริ่มเกม');
  assert(undone.version > started.version, 'การย้อนคำสั่งต้องเดินเวอร์ชันต่อ ไม่ถอยหลัง');
  assert(undone.timeline.some((t) => t.text.indexOf('ย้อนคำสั่ง') === 0), 'ต้องบันทึกใน timeline');

  await rejects(() => S.undoLastCommand(g.gameId), 'ไม่มี snapshot แล้วต้องย้อนต่อไม่ได้');
});

test('เก็บ snapshot ไว้ 25 จุดเท่านั้น', async () => {
  const g = await newStoredGame(4);
  let version = g.version;
  for (let i = 0; i < 30; i++) {
    const vm = await S.runCommand({ gameId: g.gameId, expectedVersion: version, action: 'noop' },
      'คำสั่งทดสอบ ' + i, true, (st) => { st.title = 'รอบที่ ' + i; });
    version = vm.version;
  }
  eq(await S.countSnapshots(g.gameId), 25, 'ต้องเหลือ 25 จุดพอดี');

  const oldest = await query(
    'SELECT label FROM snapshots WHERE game_id = $1 ORDER BY id ASC LIMIT 1', [g.gameId]);
  eq(oldest.rows[0].label, 'คำสั่งทดสอบ 5', 'ตัดจุดเก่าสุดออกก่อน');
});

test('สองเกมพร้อมกันต้องไม่ปนกัน', async () => {
  const a = await newStoredGame(4);
  const b = await newStoredGame(7);

  await S.runCommand({ gameId: a.gameId, expectedVersion: a.version, action: 'setPlayers' },
    'ตั้งรายชื่อผู้เล่น', false, (st) => E.setPlayers(st, names(4)));

  const viewA = await S.moderatorView(a.gameId);
  const viewB = await S.moderatorView(b.gameId);
  eq(viewA.players.length, 4, 'เกม A มีผู้เล่น 4 คน');
  eq(viewB.players.length, 7, 'เกม B ไม่ถูกกระทบ');
  eq(viewB.version, b.version, 'เวอร์ชันของเกม B ต้องไม่ขยับ');

  eq(await S.verifyPin(a.gameId, b.pin), false, 'PIN ของอีกเกมใช้ข้ามกันไม่ได้');

  const evA = await S.readEvents(a.gameId);
  const evB = await S.readEvents(b.gameId);
  const createdA = evA.find((e) => e.type === 'GAME_CREATED');
  const createdB = evB.find((e) => e.type === 'GAME_CREATED');
  eq(createdA.payload.players, 4, 'event ของเกม A บันทึกผู้เล่น 4 คน');
  eq(createdB.payload.players, 7, 'event ของเกม B บันทึกผู้เล่น 7 คน');
  eq(evA.some((e) => e.payload.gameId === b.gameId), false, 'log ของสองเกมต้องไม่ปนกัน');
});

test('คำสั่งสองคำสั่งพร้อมกันบนเกมเดียวกัน ต้องมีตัวหนึ่งแพ้', async () => {
  const g = await newStoredGame(5);
  const cmd = () => ({ gameId: g.gameId, expectedVersion: g.version, action: 'setPlayers' });

  const results = await Promise.allSettled([
    S.runCommand(cmd(), 'ตั้งรายชื่อผู้เล่น A', false, (st) => E.setPlayers(st, names(5))),
    S.runCommand(cmd(), 'ตั้งรายชื่อผู้เล่น B', false, (st) => E.setPlayers(st, names(11)))
  ]);

  const ok = results.filter((r) => r.status === 'fulfilled');
  const bad = results.filter((r) => r.status === 'rejected');
  eq(ok.length, 1, 'ต้องสำเร็จเพียงคำสั่งเดียว');
  eq(bad.length, 1, 'อีกคำสั่งต้องถูกปฏิเสธ');

  const view = await S.moderatorView(g.gameId);
  eq(view.version, g.version + 1, 'เวอร์ชันต้องขยับแค่หนึ่งขั้น');
});
