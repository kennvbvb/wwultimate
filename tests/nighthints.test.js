/**
 * nighthints.test.js — the greyed-out targets on the night screen must agree
 * with what the engine would actually refuse.
 *
 * These two live in different files on purpose (see lib/nightHints.ts), so the
 * tests below pin them together: every hint must correspond to a real
 * validateTargets() rejection, and every single-target rejection must produce
 * a hint. If a rule is added to Validation.gs without a hint, this goes red.
 */
import { test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import { nightTargetHints } from '../lib/nightHints.ts';
import { act, assert, eq, hasStep, newGame, pid, resolveNightAndDawn } from './helpers.js';

const DECK = ['werewolf', 'werewolf', 'bodyguard', 'seer', 'hunter', 'villager', 'villager', 'villager'];

function stepById(st, stepId) {
  return st.night.steps.find((s) => s.stepId === stepId) || null;
}

test('ผู้คุ้มกันคุ้มกันคนเดิมสองคืนติดกันไม่ได้ และหน้าจอต้องปิดปุ่มไว้ล่วงหน้า', () => {
  const st = newGame(E, DECK);
  assert(hasStep(st, 'bodyguard'), 'สำรับนี้ต้องมีผู้คุ้มกัน');

  /* night 1: guard seat 6 */
  act(E, st, 'bodyguard', [6]);
  resolveNightAndDawn(E, st);
  E.startDiscussion(st);
  E.forceEndDay(st);

  const step = stepById(st, 'bodyguard');
  assert(step, 'คืนที่สองต้องมีขั้นตอนผู้คุ้มกันอีก');
  const hints = nightTargetHints(st, step);

  eq(hints[pid(st, 6)], 'คุ้มกันคนเดิมสองคืนติดกันไม่ได้', 'ปุ่มของคนที่เพิ่งคุ้มกันต้องถูกปิด');
  const guard = st.players.find((p) => p.currentRoleId === 'bodyguard');
  eq(hints[guard.playerId], 'ป้องกันตนเองไม่ได้', 'ผู้คุ้มกันเลือกตัวเองไม่ได้');

  /* the engine must agree — the hint is a preview of this rejection */
  const check = E.validateTargets(st, step, [pid(st, 6)]);
  eq(check.ok, false, 'engine ต้องปฏิเสธเป้าหมายเดิมด้วย');
});

test('ทุกชื่อที่ถูกปิดไว้ ต้องเป็นชื่อที่ engine ปฏิเสธจริง (ไม่ปิดเกินจำเป็น)', () => {
  const st = newGame(E, DECK);
  act(E, st, 'bodyguard', [6]);
  resolveNightAndDawn(E, st);
  E.startDiscussion(st);
  E.forceEndDay(st);

  let stepsChecked = 0;
  for (const step of st.night.steps) {
    /* Steps that demand two names at once (Cupid) reject any single-name
     * selection on count alone, which says nothing about a per-name rule. */
    if (step.maxTargets < 1 || step.minTargets > 1) continue;
    stepsChecked++;
    const hints = nightTargetHints(st, step);

    for (const p of st.players) {
      const rejected = !E.validateTargets(st, step, [p.playerId]).ok;
      const hinted = !!hints[p.playerId];
      if (hinted) {
        assert(rejected, 'ปิดปุ่ม ' + p.name + ' ที่ขั้น ' + step.stepId + ' ทั้งที่ engine ยอมรับ');
      } else {
        assert(!rejected, 'engine ปฏิเสธ ' + p.name + ' ที่ขั้น ' + step.stepId + ' แต่หน้าจอยังเปิดปุ่มไว้');
      }
    }
  }
  assert(stepsChecked > 0, 'ต้องได้ตรวจอย่างน้อยหนึ่งขั้นตอน');
});

test('ฝูงหมาป่าเลือกพวกเดียวกันเป็นเหยื่อไม่ได้ และคนตายถูกปิดปุ่มทุกขั้น', () => {
  const st = newGame(E, DECK);
  const wolves = st.players.filter((p) => p.currentRoleId === 'werewolf');
  const hints = nightTargetHints(st, stepById(st, 'wolves'));
  for (const w of wolves) {
    eq(hints[w.playerId], 'อยู่ฝ่ายหมาป่า', 'หมาป่าเลือกกันเองเป็นเหยื่อไม่ได้');
  }

  E.moderatorKill(st, pid(st, 8), 'ทดสอบ');
  const afterDeath = nightTargetHints(st, stepById(st, 'wolves'));
  eq(afterDeath[pid(st, 8)], 'เสียชีวิตแล้ว', 'คนตายต้องถูกปิดปุ่ม');
});

test('ไม่มีขั้นตอนอยู่ ก็ต้องไม่ปิดปุ่มอะไรเลย', () => {
  const st = newGame(E, DECK);
  eq(Object.keys(nightTargetHints(st, null)).length, 0, 'ไม่มีขั้นตอน = ไม่มีปุ่มถูกปิด');
});
