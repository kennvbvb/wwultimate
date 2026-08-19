/**
 * ids.test.js — game ids and PINs must not come from Math.random().
 */
import { test } from 'node:test';
import * as S from '../lib/storage.ts';
import { closePool, query } from '../lib/db.ts';
import { secureCode, secureGameId, securePin } from '../lib/ids.ts';
import { assert, eq } from './helpers.js';
import { after } from 'node:test';

after(() => closePool());

test('รูปแบบรหัสเกมและ PIN ตรงตามที่ผู้ใช้คุ้นเคย และไม่มีตัวอักษรที่สับสน', () => {
  for (let i = 0; i < 50; i++) {
    assert(/^GAME-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(secureGameId()), 'รูปแบบรหัสเกม');
    assert(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(securePin()),
      'รูปแบบ PIN');
  }
  /* O/0 และ I/1 ถูกตัดออกเพราะครูต้องอ่าน PIN จากจอหนึ่งไปพิมพ์อีกจอ */
  const sample = secureCode(2000);
  assert(!/[OI01]/.test(sample), 'ต้องไม่มีตัวอักษรที่อ่านสับสน');
});

test('สุ่มแล้วต้องไม่ซ้ำและกระจายทั่วตัวอักษรที่มี', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(secureGameId());
  eq(seen.size, 500, 'สุ่ม 500 ครั้งต้องไม่ซ้ำเลย');

  const counts = {};
  for (const ch of secureCode(6400)) counts[ch] = (counts[ch] || 0) + 1;
  eq(Object.keys(counts).length, 32, 'ต้องใช้ตัวอักษรครบทั้ง 32 ตัว');
  for (const ch of Object.keys(counts)) {
    /* คาดหวังตัวละ 200 ครั้ง เผื่อความแปรปรวนกว้าง ๆ พอไม่ให้ flaky */
    assert(counts[ch] > 90 && counts[ch] < 340, 'ตัวอักษร ' + ch + ' กระจายผิดปกติ (' + counts[ch] + ')');
  }
});

test('เกมที่สร้างจริงต้องใช้รหัสและ PIN จากตัวสร้างที่ปลอดภัย', async () => {
  const created = await S.createGame({ playerNames: ['ก', 'ข', 'ค'], title: 'ทดสอบรหัส' });
  assert(/^GAME-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(created.view.gameId), 'รหัสเกมถูกแทนที่แล้ว');
  assert(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(created.moderatorPin), 'PIN ถูกแทนที่แล้ว');
  eq(await S.verifyPin(created.view.gameId, created.moderatorPin), true, 'PIN ที่คืนมาต้องใช้เข้าได้จริง');

  /* event log และ timeline ต้องอ้างรหัสใหม่ ไม่ใช่รหัสที่ engine สุ่มไว้ตอนแรก */
  const events = await S.readEvents(created.view.gameId, 20);
  const createdEvent = events.find((e) => e.type === 'GAME_CREATED');
  eq(createdEvent.payload.gameId, created.view.gameId, 'event ต้องอ้างรหัสใหม่');

  const state = await S.loadState(created.view.gameId);
  const line = state.timeline.find((t) => t.text.indexOf('สร้างเกมใหม่') >= 0);
  assert(line.text.indexOf(created.view.gameId) > 0, 'timeline ต้องอ้างรหัสใหม่');

  const row = await query('SELECT state FROM games WHERE game_id = $1', [created.view.gameId]);
  eq(row.rows[0].state.moderatorPin, '', 'PIN ดิบต้องไม่ถูกเก็บลงฐานข้อมูล');
});
