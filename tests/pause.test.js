/**
 * pause.test.js — a break must stop the clocks the class is watching.
 */
import { test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import { pauseInfo, pauseWithClock, resumeWithClock } from '../lib/pause.ts';
import { assert, eq, newGame } from './helpers.js';

const DECK = ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'];

function atDiscussion() {
  const st = newGame(E, DECK);
  let guard = 0;
  while (E.currentStep(st) && guard++ < 40) E.skipStep(st, E.currentStep(st).stepId);
  E.finishNight(st);
  while (st.pendingPrompts.length) E.resolveDeathPrompt(st, st.pendingPrompts[0].promptId, null);
  E.startDiscussion(st);
  return st;
}

test('หยุดพักแล้วเส้นตายของนาฬิกาต้องถูกเลื่อนออกไปตามเวลาที่พัก', async () => {
  const st = atDiscussion();
  const before = st.day.discussionEndsAt;
  assert(before > Date.now(), 'นาฬิกาอภิปรายต้องเดินอยู่');

  pauseWithClock(st);
  eq(st.status, 'PAUSED', 'สถานะเป็นหยุดพัก');
  eq(st.day.discussionEndsAt, before, 'ระหว่างพัก เส้นตายยังไม่ถูกแตะ');

  await new Promise((r) => setTimeout(r, 40));
  resumeWithClock(st);

  eq(st.status, 'DISCUSSION', 'กลับสู่ช่วงเดิม');
  assert(st.day.discussionEndsAt >= before + 35,
    'เส้นตายต้องถูกเลื่อนออกไปอย่างน้อยเท่าเวลาที่พัก');
});

test('นาฬิกาที่หมดเวลาไปก่อนพักแล้ว ต้องไม่ถูกต่อเวลาให้', async () => {
  const st = atDiscussion();
  st.day.discussionEndsAt = Date.now() - 5000;   /* หมดเวลาไปแล้ว */
  const expired = st.day.discussionEndsAt;

  pauseWithClock(st);
  await new Promise((r) => setTimeout(r, 30));
  resumeWithClock(st);

  eq(st.day.discussionEndsAt, expired, 'เวลาที่หมดไปแล้วต้องไม่ถูกคืนมา');
});

test('ข้อมูลการพักบอกได้ว่าจะกลับไปช่วงไหน', () => {
  const st = atDiscussion();
  eq(pauseInfo(st), null, 'ยังไม่ได้พัก');

  pauseWithClock(st);
  const info = pauseInfo(st);
  eq(info.from, 'DISCUSSION', 'จำช่วงก่อนพักไว้ได้');
  assert(info.at > 0, 'บันทึกเวลาที่เริ่มพัก');

  resumeWithClock(st);
  eq(pauseInfo(st), null, 'เล่นต่อแล้วข้อมูลการพักต้องหายไป');
  eq(st.__pausedAt, null, 'ล้างเวลาที่พักทิ้ง');
});
