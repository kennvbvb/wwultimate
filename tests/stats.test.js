/**
 * stats.test.js — the cross-game summary.
 *
 * The rule that matters most here is negative: statistics are built from
 * finished games only, because an unfinished one names the role of everybody
 * still alive.
 */
import { test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import { buildStats } from '../lib/stats.ts';
import { finishedGames } from '../lib/storage.ts';
import { assert, eq, newGame, pid } from './helpers.js';

/* No Hunter: his death opens a prompt the moderator must answer, and these
 * tests only need a game that reaches a clean ending. */
const DECK = ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'];

/** Plays a short game to a real ending, then shapes it like a database row. */
function finishedRow(gameId, title, winnerTeam) {
  const st = newGame(E, DECK);
  st.gameId = gameId;
  st.dayNumber = 2;

  if (winnerTeam === 'WEREWOLF') {
    /* wolves win once they are not outnumbered any more */
    for (const seat of [2, 3, 4, 5]) E.moderatorKill(st, pid(st, seat), 'ทดสอบ');
  } else {
    const wolf = st.players.find((p) => p.currentRoleId === 'werewolf');
    E.moderatorKill(st, wolf.playerId, 'ทดสอบ');
  }
  assert(st.winners, 'เกมทดสอบต้องจบและมีผู้ชนะ');
  return { gameId, title, finishedAt: '2026-01-0' + (gameId.length % 9) + 'T10:00:00.000Z', state: st };
}

test('สรุปสถิติรวมนับเกม ผู้เล่น และฝ่ายที่ชนะได้ถูกต้อง', () => {
  const rows = [
    finishedRow('GAME-AAA', 'คาบเช้า', 'VILLAGE'),
    finishedRow('GAME-BBB', 'คาบบ่าย', 'WEREWOLF'),
    finishedRow('GAME-CCC', 'คาบเย็น', 'VILLAGE')
  ];
  const stats = buildStats(rows);

  eq(stats.games, 3, 'นับเกมครบ');
  eq(stats.totalPlayerSeats, 18, 'ที่นั่งรวม 6 คน × 3 เกม');
  eq(stats.averagePlayers, 6, 'ผู้เล่นเฉลี่ยต่อเกม');

  const village = stats.teamWins.find((t) => t.team === 'VILLAGE');
  const wolves = stats.teamWins.find((t) => t.team === 'WEREWOLF');
  eq(village.wins, 2, 'หมู่บ้านชนะ 2 เกม');
  eq(wolves.wins, 1, 'หมาป่าชนะ 1 เกม');
  eq(village.share + wolves.share, 100, 'สัดส่วนรวมได้ 100%');
});

test('สถิติรายผู้เล่นจับคู่ตามชื่อ และนับการรอด/ชนะแยกกัน', () => {
  const stats = buildStats([
    finishedRow('GAME-AAA', 'คาบเช้า', 'VILLAGE'),
    finishedRow('GAME-BBB', 'คาบบ่าย', 'VILLAGE')
  ]);

  eq(stats.players.length, 6, 'ชื่อซ้ำข้ามเกมต้องถูกยุบเป็นคนเดียว');
  for (const p of stats.players) {
    eq(p.games, 2, p.name + ' เล่นสองเกม');
    assert(p.survived <= p.games, 'จำนวนครั้งที่รอดต้องไม่เกินจำนวนเกม');
    assert(p.wins <= p.games, 'จำนวนครั้งที่ชนะต้องไม่เกินจำนวนเกม');
  }
  const totalWolfGames = stats.players.reduce((sum, p) => sum + p.wolfGames, 0);
  eq(totalWolfGames, 2, 'มีหมาป่าหนึ่งคนต่อเกม รวมสองครั้ง');
});

test('สถิติรายบทบาทนับจากการ์ดที่ได้รับตอนแจก', () => {
  const stats = buildStats([finishedRow('GAME-AAA', 'คาบเช้า', 'VILLAGE')]);
  const villager = stats.roles.find((r) => r.roleId === 'villager');
  const wolf = stats.roles.find((r) => r.roleId === 'werewolf');

  eq(villager.used, 4, 'สำรับนี้มีชาวบ้าน 4 ใบ');
  eq(wolf.used, 1, 'และหมาป่า 1 ใบ');
  eq(wolf.survived, 0, 'เกมนี้หมาป่าตาย');
  eq(wolf.wins, 0, 'หมาป่าจึงไม่ได้อยู่ฝ่ายชนะ');
  eq(villager.wins, 4, 'ชาวบ้านทุกคนอยู่ฝ่ายที่ชนะ');
});

test('ไม่มีเกมที่จบแล้ว ก็ต้องคืนค่าศูนย์โดยไม่พัง', () => {
  const stats = buildStats([]);
  eq(stats.games, 0, 'ศูนย์เกม');
  eq(stats.averagePlayers, 0, 'ไม่หารด้วยศูนย์');
  eq(stats.players.length, 0, 'ไม่มีผู้เล่น');
  eq(stats.recent.length, 0, 'ไม่มีรายการเกม');
});

test('ดึงข้อมูลสถิติจากฐานข้อมูล ต้องไม่แตะเกมที่ยังเล่นค้างอยู่', async () => {
  const rows = await finishedGames(500);
  for (const row of rows) {
    assert(row.state.status === 'FINISHED',
      'เกม ' + row.gameId + ' ยังไม่จบแต่ถูกดึงมาทำสถิติ');
  }
});
