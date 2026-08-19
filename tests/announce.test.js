/**
 * announce.test.js — the popups the moderator reads out loud.
 *
 * They are built from the view model and the engine's own Thai sentences, so
 * these tests mostly pin what gets said, and that the role-reveal rule is
 * honoured when naming the dead.
 */
import { test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import {
  lynchAnnouncement, nightDeathAnnouncement, stepResultAnnouncement
} from '../lib/client/announce.ts';
import { act, assert, eq, newGame, pid } from './helpers.js';

const DECK = ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'];

function view(state) { return E.moderatorViewModel(state); }

/* The browser holds a parsed JSON copy of the previous view; taking a real copy
 * here keeps the test honest, because the engine's view model shares arrays
 * with the live state. */
function snapshot(state) { return JSON.parse(JSON.stringify(view(state))); }

function runNight(state, actions) {
  if (actions) actions(state);
  let guard = 0;
  while (E.currentStep(state) && guard++ < 40) E.skipStep(state, E.currentStep(state).stepId);
  E.finishNight(state);
  while (state.pendingPrompts.length) {
    E.resolveDeathPrompt(state, state.pendingPrompts[0].promptId, null);
  }
  return state;
}

test('สรุปคืนแล้วต้องบอกชื่อผู้เสียชีวิตพร้อมสาเหตุ', () => {
  const st = newGame(E, DECK);
  runNight(st, (s) => act(E, s, 'wolves', [4]));

  const said = nightDeathAnnouncement(view(st));
  eq(said.lines.length, 1, 'มีผู้เสียชีวิตหนึ่งคน');
  assert(said.lines[0].indexOf('ผู้เล่น4') === 0, 'บอกชื่อผู้เสียชีวิต');
  assert(said.lines[0].indexOf('ที่นั่ง 4') > 0, 'บอกที่นั่งด้วย');
  assert(said.lines[0].indexOf('ถูกหมาป่าโจมตี') > 0, 'บอกสาเหตุการตาย');
  assert(said.title.indexOf('รุ่งเช้าวันที่ 1') === 0, 'พาดหัวบอกว่าเป็นรุ่งเช้าวันไหน');
});

test('ถ้ายังมีทริกเกอร์การตายค้างอยู่ ต้องไม่ประกาศเลขวันที่ยังไม่เริ่ม', () => {
  const withHunter = ['werewolf', 'hunter', 'seer', 'villager', 'villager', 'villager'];
  const st = newGame(E, withHunter);
  const hunterSeat = st.players.findIndex((p) => p.currentRoleId === 'hunter') + 1;
  act(E, st, 'wolves', [hunterSeat]);
  let guard = 0;
  while (E.currentStep(st) && guard++ < 40) E.skipStep(st, E.currentStep(st).stepId);
  E.finishNight(st);

  const vm = view(st);
  assert(vm.pendingPrompts.length > 0, 'นายพรานตายแล้วต้องมีทริกเกอร์ค้างอยู่');
  const said = nightDeathAnnouncement(vm);
  assert(said.title.indexOf('คืนที่ 1') > 0, 'พาดหัวต้องอ้างคืน ไม่ใช่วันที่ยังไม่เริ่ม');
  assert(said.title.indexOf('วันที่ 0') < 0, 'ห้ามมีวันที่ 0 ในคำประกาศ');
  assert(said.lines.some((l) => l.indexOf('ยังมีผลกระทบ') === 0), 'บอกด้วยว่ายังมีเรื่องต้องจัดการต่อ');
});

test('คืนที่ไม่มีใครตาย ต้องบอกให้ชัดว่าไม่มีผู้เสียชีวิต', () => {
  const st = newGame(E, DECK);
  runNight(st);
  const said = nightDeathAnnouncement(view(st));
  eq(said.lines[0], 'คืนที่ผ่านมาไม่มีผู้เสียชีวิต', 'ต้องพูดตรง ๆ ว่าไม่มีคนตาย');
});

test('การเปิดเผยบทบาทในคำประกาศ ต้องเคารพกติกาที่ตั้งไว้', () => {
  const full = newGame(E, DECK, { variants: { roleRevealMode: 'FULL' } });
  runNight(full, (s) => act(E, s, 'wolves', [2]));
  assert(nightDeathAnnouncement(view(full)).lines[0].indexOf('ผู้หยั่งรู้') > 0,
    'โหมด FULL ต้องบอกบทบาท');

  const none = newGame(E, DECK, { variants: { roleRevealMode: 'NONE' } });
  runNight(none, (s) => act(E, s, 'wolves', [2]));
  const line = nightDeathAnnouncement(view(none)).lines[0];
  assert(line.indexOf('ผู้หยั่งรู้') < 0, 'โหมด NONE ต้องไม่บอกบทบาท');

  const team = newGame(E, DECK, { variants: { roleRevealMode: 'TEAM_ONLY' } });
  runNight(team, (s) => act(E, s, 'wolves', [2]));
  assert(nightDeathAnnouncement(view(team)).lines[0].indexOf('ฝ่ายหมู่บ้าน') > 0,
    'โหมด TEAM_ONLY ต้องบอกเฉพาะฝ่าย');
});

test('ผู้หยั่งรู้ตรวจหมาป่า ต้องบอกให้พยักหน้า', () => {
  const st = newGame(E, DECK);
  const before = snapshot(st);
  const wolfSeat = st.players.findIndex((p) => p.currentRoleId === 'werewolf') + 1;
  act(E, st, 'seer', [wolfSeat]);

  const said = stepResultAnnouncement(before, view(st));
  assert(said, 'ต้องมีคำประกาศหลังตรวจ');
  assert(said.lines[0].indexOf('ผู้เล่น' + wolfSeat) === 0, 'บอกชื่อคนที่ถูกตรวจ');
  assert(said.lines[0].indexOf('พยักหน้า') > 0, 'ตรวจเจอหมาป่าต้องบอกให้พยักหน้า');
});

test('ผู้หยั่งรู้ตรวจชาวบ้าน ต้องบอกให้ส่ายหน้า', () => {
  const st = newGame(E, DECK);
  const before = snapshot(st);
  const villagerSeat = st.players.findIndex((p) => p.currentRoleId === 'villager') + 1;
  act(E, st, 'seer', [villagerSeat]);

  const said = stepResultAnnouncement(before, view(st));
  assert(said.lines[0].indexOf('ส่ายหน้า') > 0, 'ตรวจเจอชาวบ้านต้องบอกให้ส่ายหน้า');
});

test('ขั้นตอนที่ไม่มีคำตอบให้ประกาศ ต้องไม่เด้งกล่องขึ้นมา', () => {
  const st = newGame(E, DECK);
  const before = snapshot(st);
  eq(stepResultAnnouncement(before, view(st)), null, 'ไม่มีผลใหม่ = ไม่ประกาศ');
});

test('แขวนคอสำเร็จต้องบอกว่าใครถูกแขวน', () => {
  const st = newGame(E, DECK);
  runNight(st);
  E.startDiscussion(st);
  E.startNomination(st, [pid(st, 3)]);
  const before = snapshot(st);
  for (const voter of E.eligibleVoters(st)) E.submitVote(st, voter.playerId, pid(st, 3));
  E.resolveVote(st);

  const said = lynchAnnouncement(before, view(st));
  assert(said.title.indexOf('ถูกแขวนคอ') >= 0, 'พาดหัวบอกว่ามีคนถูกแขวน');
  assert(said.lines[0].indexOf('ผู้เล่น3') === 0, 'บอกชื่อคนที่ถูกแขวน');
  assert(said.lines[0].indexOf('ถูกหมู่บ้านแขวนคอ') > 0, 'บอกสาเหตุ');
});

test('ทุกคนไว้ชีวิต ต้องบอกว่าไม่มีใครถูกแขวน', () => {
  const st = newGame(E, DECK);
  runNight(st);
  E.startDiscussion(st);
  E.startNomination(st, [pid(st, 3)]);
  const before = snapshot(st);
  for (const voter of E.eligibleVoters(st)) E.submitVote(st, voter.playerId, 'SPARE');
  E.resolveVote(st);

  const said = lynchAnnouncement(before, view(st));
  eq(said.title, 'ไม่มีใครถูกแขวนคอ', 'พาดหัวต้องบอกว่าไม่มีใครถูกแขวน');
  assert(said.lines.some((l) => l.indexOf('ไม่แขวนคอใคร') > 0 || l.indexOf('ไม่ทำให้ใครถูกแขวนคอ') > 0),
    'และอธิบายเหตุผล');
});
