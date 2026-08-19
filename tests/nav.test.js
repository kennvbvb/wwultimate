/**
 * nav.test.js — which tabs the moderator can reach at each point in the game.
 */
import { test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import { availablePages, routeByStatus } from '../lib/client/nav.ts';
import { assert, eq, newGame, pid } from './helpers.js';

const DECK = ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'];
const view = (st) => E.moderatorViewModel(st);

test('ก่อนเริ่มเกม เข้าได้เฉพาะจอตั้งค่า', () => {
  const st = E.createGameState({ playerNames: ['ก', 'ข', 'ค'] });
  const pages = availablePages(view(st), 'players');
  assert(pages.has('players') && pages.has('roles'), 'ตั้งรายชื่อและเลือกบทบาทได้');
  assert(!pages.has('night') && !pages.has('day'), 'ยังไปจอกลางคืน/กลางวันไม่ได้');
  assert(!pages.has('assign'), 'ยังไม่ได้เลือกบทบาท จึงยังแจกการ์ดไม่ได้');
});

test('กลางคืน เข้าได้เฉพาะจอกลางคืน', () => {
  const st = newGame(E, DECK);
  const pages = availablePages(view(st), 'night');
  assert(pages.has('night'), 'จอกลางคืนเปิดอยู่');
  assert(!pages.has('roles'), 'ล็อกบทบาทแล้ว กลับไปหน้าเลือกบทบาทไม่ได้');
  assert(!pages.has('day'), 'ยังไม่ถึงกลางวัน');
});

test('กลางวัน เข้าได้เฉพาะจอกลางวัน', () => {
  const st = newGame(E, DECK);
  let guard = 0;
  while (E.currentStep(st) && guard++ < 40) E.skipStep(st, E.currentStep(st).stepId);
  E.finishNight(st);
  while (st.pendingPrompts.length) E.resolveDeathPrompt(st, st.pendingPrompts[0].promptId, null);
  E.startDiscussion(st);

  const pages = availablePages(view(st), 'day');
  assert(pages.has('day'), 'จอกลางวันเปิดอยู่');
  assert(!pages.has('night'), 'กลับไปจอกลางคืนไม่ได้');
});

test('จบเกมแล้วเหลือแต่จอสรุป', () => {
  const st = newGame(E, DECK);
  E.endGame(st, 'ทดสอบ');
  const pages = availablePages(view(st), 'end');
  eq(pages.size, 1, 'เหลือจอเดียว');
  assert(pages.has('end'), 'คือจอสรุป');
});

test('จอที่เปิดอยู่ต้องกดกลับมาได้เสมอ ไม่ทำให้ค้าง', () => {
  const st = newGame(E, DECK);
  const pages = availablePages(view(st), 'roles');
  assert(pages.has('roles'), 'จอที่เปิดค้างอยู่ต้องไม่ถูกปิด');
});

test('พักเกมแล้วยังเข้าจอเดิมได้', () => {
  const st = newGame(E, DECK);
  E.pauseGame(st);
  const vm = view(st);
  vm.paused = { from: 'FIRST_NIGHT', at: Date.now() };
  assert(availablePages(vm, 'night').has('night'), 'ระหว่างพักยังอยู่จอกลางคืนได้');
  eq(routeByStatus(vm), 'night', 'และการ routing ก็ยังชี้จอกลางคืน');
});

test('routing ตามสถานะยังตรงกับตารางเดิม', () => {
  const st = newGame(E, DECK);
  eq(routeByStatus(view(st)), 'night', 'คืนแรก → จอกลางคืน');
  E.endGame(st, 'ทดสอบ');
  eq(routeByStatus(view(st)), 'end', 'จบเกม → จอสรุป');
  void pid;
});
