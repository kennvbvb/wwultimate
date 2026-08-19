/**
 * voting.test.js — the guards that stop a day from closing on a half-entered vote.
 *
 * This is the failure the readiness review called Critical: the engine hangs
 * whoever leads among the votes it happens to have, so two entered votes out of
 * eight could decide the day.
 */
import { test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import { assertTieChoice, assertVoteReady, voteProgress } from '../lib/voting.ts';
import { assert, eq, newGame, pid, throws } from './helpers.js';

const DECK = ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'];

/** Brings a fresh game to the voting step with the given seats nominated. */
function atVoting(nomineeSeats, variants) {
  const st = newGame(E, DECK, variants ? { variants } : undefined);
  let guard = 0;
  while (E.currentStep(st) && guard++ < 40) E.skipStep(st, E.currentStep(st).stepId);
  E.finishNight(st);
  while (st.pendingPrompts.length) E.resolveDeathPrompt(st, st.pendingPrompts[0].promptId, null);
  E.startDiscussion(st);
  E.startNomination(st, nomineeSeats.map((seat) => pid(st, seat)));
  return st;
}

test('ยังลงคะแนนไม่ครบ ต้องปิดการโหวตไม่ได้ และบอกชื่อคนที่ยังไม่ลง', () => {
  const st = atVoting([2]);
  const voters = E.eligibleVoters(st);
  assert(voters.length >= 4, 'ต้องมีผู้มีสิทธิ์หลายคน');

  eq(voteProgress(st).received, 0, 'เริ่มต้นยังไม่มีใครลง');
  throws(() => assertVoteReady(st), 'ยังไม่มีคะแนนเลยต้องปิดไม่ได้');

  E.submitVote(st, voters[0].playerId, pid(st, 2));
  const partial = voteProgress(st);
  eq(partial.received, 1, 'ลงแล้วหนึ่งคน');
  eq(partial.complete, false, 'ยังไม่ครบ');
  eq(partial.missing.length, voters.length - 1, 'รายชื่อที่ยังไม่ลงต้องครบจำนวน');

  let message = '';
  try { assertVoteReady(st); } catch (e) { message = e.message; }
  assert(message.indexOf('ยังลงคะแนนไม่ครบ') === 0, 'ข้อความต้องบอกว่ายังไม่ครบ');
  assert(message.indexOf(partial.missing[0].name) > 0, 'และต้องบอกชื่อคนที่ยังไม่ลง');
});

test('ลงครบทุกคนแล้วจึงปิดการโหวตได้ และงดออกเสียงนับว่าลงแล้ว', () => {
  const st = atVoting([2]);
  const voters = E.eligibleVoters(st);
  voters.forEach((v, i) => {
    /* the last voter abstains — that still counts as having voted */
    E.submitVote(st, v.playerId, i === voters.length - 1 ? 'SPARE' : pid(st, 2));
  });

  const progress = voteProgress(st);
  eq(progress.complete, true, 'ครบทุกคนแล้ว');
  eq(progress.received, progress.total, 'จำนวนที่ลงเท่ากับผู้มีสิทธิ์');
  eq(progress.missing.length, 0, 'ไม่มีใครค้าง');
  assertVoteReady(st);   /* must not throw */

  E.resolveVote(st);
  eq(st.players.find((p) => p.playerId === pid(st, 2)).alive, false, 'ผู้ถูกโหวตต้องถูกแขวนคอ');
});

test('ผู้ที่โหวตไม่ได้ตามกติกา ต้องไม่ถูกนับว่าค้างคะแนน', () => {
  const st = atVoting([2]);
  const voters = E.eligibleVoters(st);
  const excluded = st.players.find((p) => p.alive && !voters.some((v) => v.playerId === p.playerId));
  eq(excluded, undefined, 'เกมนี้ยังไม่มีใครถูกตัดสิทธิ์');

  /* take the vote away from one player the way the Village Idiot rule does */
  const victim = voters[0];
  E.addStatus(st.players.find((p) => p.playerId === victim.playerId), 'CANNOT_VOTE');

  const progress = voteProgress(st);
  eq(progress.total, voters.length - 1, 'ผู้ถูกตัดสิทธิ์ต้องหายจากรายชื่อผู้มีสิทธิ์');
  assert(!progress.missing.some((m) => m.playerId === victim.playerId),
    'และต้องไม่ถูกนับว่ายังไม่ลงคะแนน');
});

test('คะแนนเสมอแบบ MODERATOR_DECIDES เลือกได้เฉพาะผู้ที่เสมอกันจริง', () => {
  const st = atVoting([2, 3], { tieVoteRule: 'MODERATOR_DECIDES' });
  const voters = E.eligibleVoters(st);
  /* split the vote evenly between seats 2 and 3 */
  voters.forEach((v, i) => E.submitVote(st, v.playerId, pid(st, i % 2 === 0 ? 2 : 3)));

  const progress = voteProgress(st);
  eq(progress.tie, true, 'ต้องเป็นคะแนนเสมอ');
  eq(progress.needsModeratorChoice, true, 'กติกานี้ให้ผู้ดำเนินเกมตัดสิน');
  eq(progress.tieCandidates.length, 2, 'ผู้ที่เสมอมีสองคน');

  throws(() => assertTieChoice(st, null), 'ไม่เลือกใครเลยต้องถูกปฏิเสธ');
  throws(() => assertTieChoice(st, pid(st, 5)), 'เลือกคนที่ไม่ได้เสมอต้องถูกปฏิเสธ');
  assertTieChoice(st, pid(st, 3));   /* must not throw */
});

test('เสียงไว้ชีวิตชนะ ไม่ถือว่าเป็นคะแนนเสมอที่ต้องตัดสิน', () => {
  const st = atVoting([2, 3], { tieVoteRule: 'MODERATOR_DECIDES' });
  const voters = E.eligibleVoters(st);
  voters.forEach((v) => E.submitVote(st, v.playerId, 'SPARE'));

  const progress = voteProgress(st);
  eq(progress.complete, true, 'ลงครบ');
  eq(progress.tie, false, 'ทุกคนงดออกเสียง ไม่ใช่การเสมอ');
  eq(progress.needsModeratorChoice, false, 'จึงไม่ต้องให้ผู้ดำเนินเกมตัดสิน');
  assertTieChoice(st, null);   /* must not throw */
});

test('นอกช่วงลงคะแนน voteProgress ต้องเป็น null', () => {
  const st = newGame(E, DECK);
  eq(voteProgress(st), null, 'กลางคืนไม่มีความคืบหน้าการโหวต');
});
