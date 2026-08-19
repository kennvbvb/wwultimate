/**
 * retention.test.js — housekeeping and the right to be forgotten.
 *
 * The app stores children's names; deleting a game has to actually delete it,
 * and statistics must not count games nobody finished.
 */
import { after, test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import * as S from '../lib/storage.ts';
import { closePool, query } from '../lib/db.ts';
import { deleteGame, retentionSummary, runCleanup } from '../lib/retention.ts';
import { assert, eq } from './helpers.js';

after(() => closePool());

const names = (n) => Array.from({ length: n }, (_, i) => 'ผู้เล่น' + (i + 1));

test('ลบเกมแล้วต้องไม่เหลือชื่อผู้เล่นหรือร่องรอยใด ๆ', async () => {
  const created = await S.createGame({ playerNames: names(5), title: 'เกมที่จะถูกลบ' });
  const gameId = created.view.gameId;

  await S.runCommand({ gameId, expectedVersion: created.view.version, action: 'setPlayers',
    idempotencyKey: 'del-1' }, 'ตั้งรายชื่อผู้เล่น', true, (st) => E.setPlayers(st, names(5)));

  assert((await query('SELECT 1 FROM events WHERE game_id = $1', [gameId])).rowCount > 0, 'มี event');
  assert((await query('SELECT 1 FROM snapshots WHERE game_id = $1', [gameId])).rowCount > 0, 'มี snapshot');
  assert((await query('SELECT 1 FROM idempotency WHERE game_id = $1', [gameId])).rowCount > 0, 'มี idempotency');

  eq(await deleteGame(gameId), true, 'ลบสำเร็จ');

  eq((await query('SELECT 1 FROM games WHERE game_id = $1', [gameId])).rowCount, 0, 'เกมหายไป');
  eq((await query('SELECT 1 FROM events WHERE game_id = $1', [gameId])).rowCount, 0, 'event หายตาม');
  eq((await query('SELECT 1 FROM snapshots WHERE game_id = $1', [gameId])).rowCount, 0, 'snapshot หายตาม');
  eq((await query('SELECT 1 FROM idempotency WHERE game_id = $1', [gameId])).rowCount, 0, 'idempotency หายตาม');
  eq(await deleteGame(gameId), false, 'ลบซ้ำต้องบอกว่าไม่พบ');
});

test('เกมที่ถูกทิ้งค้างนานต้องถูกปิดและไม่ถูกนับเป็นสถิติ', async () => {
  const created = await S.createGame({ playerNames: names(4), title: 'เกมที่ถูกทิ้ง' });
  const gameId = created.view.gameId;
  await query("UPDATE games SET updated_at = now() - interval '90 days' WHERE game_id = $1", [gameId]);

  const result = await runCleanup();
  assert(result.abandonedGames >= 1, 'ต้องปิดเกมที่ถูกทิ้งอย่างน้อยหนึ่งเกม');

  const row = await query('SELECT finished, outcome FROM games WHERE game_id = $1', [gameId]);
  eq(row.rows[0].finished, true, 'ถูกทำเครื่องหมายว่าจบแล้ว');
  eq(row.rows[0].outcome, 'abandoned', 'และระบุว่าเป็นเกมที่ถูกทิ้ง');

  const forStats = await S.finishedGames(500);
  assert(!forStats.some((g) => g.gameId === gameId), 'เกมที่ถูกทิ้งต้องไม่เข้าไปในสถิติ');
  await deleteGame(gameId);
});

test('เกมที่ผู้ดำเนินเกมสั่งจบเอง ต้องไม่ถูกนับเป็นสถิติเช่นกัน', async () => {
  const created = await S.createGame({ playerNames: names(4), title: 'เกมที่สั่งจบมือ' });
  const gameId = created.view.gameId;
  const ended = await S.runCommand({ gameId, expectedVersion: created.view.version, action: 'endGame' },
    'จบเกม', true, (st) => E.endGame(st, 'เลิกเรียนก่อน'));
  eq(ended.status, 'FINISHED', 'เกมจบแล้ว');

  const row = await query('SELECT outcome FROM games WHERE game_id = $1', [gameId]);
  eq(row.rows[0].outcome, 'manual_end', 'บันทึกว่าจบด้วยมือ');

  const forStats = await S.finishedGames(500);
  assert(!forStats.some((g) => g.gameId === gameId), 'ต้องไม่เข้าไปในสถิติ');
  await deleteGame(gameId);
});

test('งานล้างข้อมูลลบ idempotency และ rate limit ที่หมดอายุแล้ว', async () => {
  const created = await S.createGame({ playerNames: names(3), title: 'เกมสำหรับล้างข้อมูล' });
  await S.runCommand({ gameId: created.view.gameId, expectedVersion: created.view.version,
    action: 'setPlayers', idempotencyKey: 'old-key' }, 'ตั้งรายชื่อผู้เล่น', false,
    (st) => E.setPlayers(st, names(3)));

  await query("UPDATE idempotency SET created_at = now() - interval '30 days' WHERE game_id = $1",
    [created.view.gameId]);
  await query("INSERT INTO rate_limits (bucket, count, expires_at) VALUES ($1, 9, now() - interval '1 hour')",
    ['test:' + created.view.gameId]);

  const result = await runCleanup();
  assert(result.idempotency >= 1, 'ลบ idempotency ที่เก่าเกินกำหนด');
  assert(result.rateLimits >= 1, 'ลบ rate limit ที่หมดอายุ');
  eq((await query('SELECT 1 FROM idempotency WHERE key = $1',
    [created.view.gameId + ':old-key'])).rowCount, 0, 'คีย์เก่าต้องหายไปจริง');

  await deleteGame(created.view.gameId);
});

test('สรุปปริมาณข้อมูลบอกจำนวนที่ใช้ตัดสินใจได้', async () => {
  const summary = await retentionSummary();
  for (const key of ['games', 'finished', 'abandoned', 'events', 'snapshots', 'idempotency']) {
    assert(Number.isFinite(summary[key]), 'ต้องมีตัวเลข ' + key);
    assert(summary[key] >= 0, 'ตัวเลข ' + key + ' ต้องไม่ติดลบ');
  }
});
