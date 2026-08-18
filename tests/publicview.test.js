/**
 * publicview.test.js — the one rule that ruins a whole game if it breaks:
 * the screen on the classroom wall must never name a living player's role.
 *
 * MIGRATION.md §6.2 asks for a test dedicated to this, because the public view
 * is now assembled by a React component and served by its own route, where the
 * Apps Script version had a single render function.
 */
import { test } from 'node:test';
import * as E from '../lib/engine.generated.js';
import { assert, eq, newGame, pid, resolveNightAndDawn } from './helpers.js';

const DECK = ['werewolf', 'werewolf', 'seer', 'hunter', 'bodyguard', 'villager', 'villager', 'villager'];

/** Every Thai role name in the catalog, so a leak cannot hide behind a synonym. */
const ROLE_NAMES = E.listRoles().map((r) => r.displayNameTh);

function livingRoleLeaks(state) {
  const view = E.publicViewModel(state);
  const leaks = [];
  for (const p of view.players) {
    if (!p.alive) continue;
    if (p.roleTh) leaks.push(p.name + ' → ' + p.roleTh);
    if (p.teamTh) leaks.push(p.name + ' → ' + p.teamTh);
    /* also catch a role name smuggled into a badge or cause field */
    const text = [p.causeTh].concat(p.badges).join(' ');
    for (const name of ROLE_NAMES) {
      if (name && text.indexOf(name) >= 0) leaks.push(p.name + ' → ' + name);
    }
  }
  return leaks;
}

test('จอสาธารณะไม่รั่วบทบาทของผู้ที่ยังมีชีวิต ตลอดทั้งเกม', () => {
  const st = newGame(E, DECK);
  const seen = [];

  const check = (label) => {
    const leaks = livingRoleLeaks(st);
    assert(leaks.length === 0, 'รั่วที่ช่วง ' + label + ': ' + leaks.join(', '));
    seen.push(st.status);
  };

  check('คืนแรก');
  resolveNightAndDawn(E, st);
  check('รุ่งเช้า');
  E.startDiscussion(st);
  check('อภิปราย');
  E.startNomination(st, [pid(st, 1)]);
  check('ลงคะแนน');
  for (const voter of E.eligibleVoters(st)) {
    try { E.submitVote(st, voter.playerId, pid(st, 1)); } catch { /* constrained roles */ }
  }
  E.resolveVote(st);
  check('สรุปผลกลางวัน');

  assert(seen.length === 5, 'ตรวจครบทุกช่วงที่ตั้งใจ');
});

test('จอสาธารณะเปิดบทบาทผู้ตายตามกติกาที่เลือก และไม่เปิดเมื่อสั่งไม่เปิด', () => {
  const full = newGame(E, DECK, { variants: { roleRevealMode: 'FULL' } });
  E.moderatorKill(full, pid(full, 3), 'ทดสอบ');
  const deadFull = E.publicViewModel(full).players.find((p) => !p.alive);
  assert(deadFull.roleTh.length > 0, 'โหมด FULL ต้องเปิดบทบาทผู้ตาย');

  const none = newGame(E, DECK, { variants: { roleRevealMode: 'NONE' } });
  E.moderatorKill(none, pid(none, 3), 'ทดสอบ');
  const deadNone = E.publicViewModel(none).players.find((p) => !p.alive);
  eq(deadNone.roleTh, '', 'โหมด NONE ต้องไม่เปิดบทบาทแม้ผู้เล่นตายแล้ว');
  eq(deadNone.teamTh, '', 'โหมด NONE ต้องไม่บอกฝ่ายด้วย');

  const team = newGame(E, DECK, { variants: { roleRevealMode: 'TEAM_ONLY' } });
  E.moderatorKill(team, pid(team, 3), 'ทดสอบ');
  const deadTeam = E.publicViewModel(team).players.find((p) => !p.alive);
  eq(deadTeam.roleTh, '', 'โหมด TEAM_ONLY ต้องไม่บอกบทบาท');
  assert(deadTeam.teamTh.length > 0, 'โหมด TEAM_ONLY ต้องบอกฝ่าย');
});

test('view model ของจอสาธารณะไม่มีสนามลับติดไปด้วย', () => {
  const st = newGame(E, DECK);
  const view = E.publicViewModel(st);
  const json = JSON.stringify(view);

  eq(view.mode, 'PUBLIC', 'ต้องเป็น view ของจอสาธารณะ');
  assert(json.indexOf('moderatorPin') < 0, 'ห้ามมี PIN ผู้ดำเนินเกม');
  assert(json.indexOf('baseRoleId') < 0, 'ห้ามมีรหัสบทบาทเดิม');
  assert(json.indexOf('currentRoleId') < 0, 'ห้ามมีรหัสบทบาทปัจจุบัน');
  assert(json.indexOf('hiddenRoleId') < 0, 'ห้ามมีบทบาทที่ซ่อนไว้ของคนเมา');
  assert(json.indexOf('ruleVariants') < 0, 'ไม่ต้องส่งตัวเลือกกติกาไปจอสาธารณะ');
  for (const p of view.players) {
    assert(!('charges' in p), 'ห้ามส่งจำนวนพลังคงเหลือ');
    assert(!('linkedPlayerIds' in p), 'ห้ามส่งความเชื่อมโยงคู่แท้');
  }
});
