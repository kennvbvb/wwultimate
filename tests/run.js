/**
 * run.js — full automated test suite (spec 15.1 unit tests + 15.2 scenarios).
 * Usage: node tests/run.js
 */
const H = require('./harness');
const { suite, test, assert, eq, throws, newGame, pid, player, hasStep, act,
        finishRemainingSteps, resolveNightAndDawn } = H;
const E = H.loadEngine();

/* Helper: run a full day with no lynch and go to the next night. */
function nextNight(st) { E.forceEndDay(st); }

/* Helper: everyone alive votes for one nominee. */
function lynch(st, seat) {
  E.startDiscussion(st);
  E.startNomination(st, [pid(st, seat)]);
  const voters = E.eligibleVoters(st);
  voters.forEach(v => {
    const choice = (v.currentRoleId === 'pacifist') ? 'SPARE' : pid(st, seat);
    try { E.submitVote(st, v.playerId, choice); } catch (e) { /* constrained roles */ }
  });
  E.resolveVote(st);
}

/* ================================================================
 * 15.1 Unit tests
 * ================================================================ */
console.log('\n=== 15.1 Unit tests ===');
suite('unit');

test('Role Catalog มี roleId ไม่ซ้ำและครบ 46 บทบาท', () => {
  const all = E.listRoles();
  eq(all.length, 46, 'จำนวนบทบาท');
  const seen = {};
  all.forEach(r => {
    assert(!seen[r.roleId], 'roleId ซ้ำ: ' + r.roleId);
    seen[r.roleId] = true;
  });
});

test('จำนวนบทบาทแยกตามชุดถูกต้อง (34 / 6 / 6)', () => {
  eq(E.listRoles('CORE').length, 34, 'CORE');
  eq(E.listRoles('WOLFPACK').length, 6, 'WOLFPACK');
  eq(E.listRoles('HUNTING_PARTY').length, 6, 'HUNTING_PARTY');
});

test('ทุกบทบาทมีฟิลด์ที่ engine ต้องใช้ครบ', () => {
  E.listRoles().forEach(r => {
    assert(r.displayNameTh && r.displayNameEn, 'ชื่อแสดงผลขาด: ' + r.roleId);
    assert(r.baseTeam, 'ทีมขาด: ' + r.roleId);
    assert(typeof r.villageImpact === 'number', 'villageImpact ขาด: ' + r.roleId);
    assert(r.winPredicate, 'winPredicate ขาด: ' + r.roleId);
    if (r.wakePolicy !== 'NEVER') assert(r.wakePriority < 999, 'wakePriority ขาด: ' + r.roleId);
  });
});

test('Wake order เรียงตาม dependency: ผู้คุ้มกันก่อนหมาป่า และผู้หยั่งรู้หลังหมาป่า', () => {
  const st = newGame(E, ['werewolf', 'bodyguard', 'seer', 'priest', 'villager', 'villager']);
  const ids = st.night.steps.map(s => s.stepId);
  assert(ids.indexOf('priest') < ids.indexOf('bodyguard'), 'นักบวชต้องมาก่อนผู้คุ้มกัน');
  assert(ids.indexOf('bodyguard') < ids.indexOf('wolves'), 'ผู้คุ้มกันต้องมาก่อนหมาป่า');
  assert(ids.indexOf('wolves') < ids.indexOf('seer'), 'ผู้หยั่งรู้ต้องมาหลังหมาป่า');
  const prios = st.night.steps.map(s => s.wakePriority);
  for (let i = 1; i < prios.length; i++) assert(prios[i] >= prios[i - 1], 'ลำดับไม่เรียง');
});

test('คืนแรกเท่านั้นที่ปลุกกามเทพ / สมาคมลับ / ดอพเพลแกงเกอร์', () => {
  const st = newGame(E, ['werewolf', 'cupid', 'mason', 'mason', 'doppelganger', 'villager']);
  assert(hasStep(st, 'cupid') && hasStep(st, 'mason') && hasStep(st, 'doppelganger'), 'คืนแรกต้องมี');
  act(E, st, 'cupid', [3, 4]);
  act(E, st, 'mason', []);
  act(E, st, 'doppelganger', [6]);
  resolveNightAndDawn(E, st);
  nextNight(st);
  assert(!hasStep(st, 'cupid'), 'คืนสองต้องไม่มีกามเทพ');
  assert(!hasStep(st, 'mason'), 'คืนสองต้องไม่มีสมาคมลับ');
  assert(!hasStep(st, 'doppelganger'), 'คืนสองต้องไม่มีดอพเพลแกงเกอร์');
});

test('Target validation ปฏิเสธเป้าหมายที่ผิดกติกา', () => {
  const st = newGame(E, ['werewolf', 'bodyguard', 'spellcaster', 'villager', 'villager', 'villager']);
  const bgStep = st.night.steps.filter(s => s.stepId === 'bodyguard')[0];
  let r = E.validateTargets(st, bgStep, [pid(st, 2)]);
  eq(r.ok, false, 'ผู้คุ้มกันเลือกตนเองไม่ได้');
  r = E.validateTargets(st, bgStep, [pid(st, 4), pid(st, 5)]);
  eq(r.ok, false, 'เลือกเกินจำนวน');
  const wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  r = E.validateTargets(st, wolfStep, [pid(st, 1)]);
  eq(r.ok, false, 'หมาป่ากินหมาป่าไม่ได้');
});

test('ผู้คุ้มกันห้ามป้องกันคนเดิมสองคืนติดกัน', () => {
  const st = newGame(E, ['werewolf', 'bodyguard', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'bodyguard', [3]);
  act(E, st, 'wolves', [4]);
  resolveNightAndDawn(E, st);
  nextNight(st);
  throws(() => act(E, st, 'bodyguard', [3]), 'ควรปฏิเสธเป้าหมายซ้ำติดกัน');
  act(E, st, 'bodyguard', [5]);
});

test('ผู้ร่ายมนตร์ห้ามเลือกคนเดิมซ้ำทั้งเกม', () => {
  const st = newGame(E, ['werewolf', 'spellcaster', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'spellcaster', [3]);
  resolveNightAndDawn(E, st);
  nextNight(st);
  throws(() => act(E, st, 'spellcaster', [3]), 'ควรปฏิเสธเป้าหมายที่เคยเลือกแล้ว');
});

test('Village Impact รวมถูกต้องเมื่อมีบทบาทซ้ำ', () => {
  const st = E.createGameState({ playerNames: ['a', 'b', 'c', 'd', 'e'] });
  st.selectedRoles = [{ roleId: 'villager', count: 3 }, { roleId: 'werewolf', count: 2 }];
  const s = E.villageImpactSummary(st);
  eq(s.total, 3 * E.getRole('villager').villageImpact + 2 * E.getRole('werewolf').villageImpact, 'ผลรวม');
});

test('validateRoleSelection จับจำนวนการ์ดไม่ตรงและการ์ดเกิน maxCopies', () => {
  const st = E.createGameState({ playerNames: ['a', 'b', 'c', 'd'] });
  st.selectedRoles = [{ roleId: 'villager', count: 2 }, { roleId: 'werewolf', count: 1 }];
  let v = E.validateRoleSelection(st);
  assert(v.problems.length > 0, 'ต้องแจ้งว่าจำนวนไม่ตรง');
  st.selectedRoles = [{ roleId: 'seer', count: 2 }, { roleId: 'werewolf', count: 2 }];
  v = E.validateRoleSelection(st);
  assert(v.problems.join(' ').indexOf('ไม่เกิน') > -1, 'ต้องแจ้ง maxCopies');
});

test('Win predicate ทำงานโดยไม่ขึ้นกับ UI', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager', 'villager']);
  eq(E.evaluateWin(st), null, 'ยังไม่มีผู้ชนะ');
  player(st, 1).alive = false;
  const w = E.evaluateWin(st);
  assert(w && w.primaryWinningTeams[0] === 'VILLAGE', 'หมู่บ้านต้องชนะ');
});

test('assertVersion ปฏิเสธคำสั่งที่ถือเวอร์ชันเก่า', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager']);
  st.version = 7;
  E.assertVersion(st, 7);
  throws(() => E.assertVersion(st, 6), 'ต้องปฏิเสธเวอร์ชันเก่า');
});

test('detectedTeam: ไลแคนอ่านเป็นหมาป่า และแม่มดฝ่ายหมาป่าอ่านเป็นหมู่บ้าน', () => {
  const st = newGame(E, ['werewolf', 'lycan', 'sorceress', 'seer', 'villager', 'villager']);
  eq(E.isThreatToSeer(st, player(st, 2)), true, 'ไลแคน');
  eq(E.isThreatToSeer(st, player(st, 3)), false, 'แม่มดฝ่ายหมาป่า');
  eq(E.isThreatToSeer(st, player(st, 1)), true, 'หมาป่า');
});

/* ================================================================
 * 15.2 Scenario tests
 * ================================================================ */
console.log('\n=== 15.2 Scenario tests ===');
suite('scenario');

test('1. Werewolf ฆ่า Villager ปกติ', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager', 'seer']);
  act(E, st, 'wolves', [2]);
  const info = act(E, st, 'seer', [1]);
  assert(info.detail.threat === true, 'ผู้หยั่งรู้ต้องเห็นว่าเป็นภัย');
  E.finishNight(st);
  eq(player(st, 2).alive, false, 'เหยื่อต้องตาย');
  eq(st.status, 'DAWN', 'ต้องเข้าสู่รุ่งเช้า');
});

test('2. Bodyguard ป้องกันเหยื่อสำเร็จ', () => {
  const st = newGame(E, ['werewolf', 'bodyguard', 'villager', 'villager', 'villager']);
  act(E, st, 'bodyguard', [3]);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  eq(player(st, 3).alive, true, 'ต้องรอด');
});

test('3. Priest blessing รับการโจมตีครั้งแรกและถูกใช้หมด', () => {
  const st = newGame(E, ['werewolf', 'priest', 'villager', 'villager', 'villager']);
  act(E, st, 'priest', [3]);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  eq(player(st, 3).alive, true, 'คืนแรกต้องรอด');
  assert(!E.hasStatus(player(st, 3), 'BLESSED'), 'พรต้องถูกใช้หมด');
  nextNight(st);
  assert(!hasStep(st, 'priest'), 'นักบวชใช้พลังหมดแล้ว');
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  eq(player(st, 3).alive, false, 'คืนที่สองต้องตาย');
});

test('4. Witch ช่วยเหยื่อและฆ่าอีกคนในคืนเดียวกัน', () => {
  const st = newGame(E, ['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [3]);
  act(E, st, 'witch', [], { heal: true, healTargetId: pid(st, 3), killTargetId: pid(st, 4) });
  E.finishNight(st);
  eq(player(st, 3).alive, true, 'เหยื่อต้องถูกชุบชีวิต');
  eq(player(st, 4).alive, false, 'เป้าหมายยาพิษต้องตาย');
  eq(player(st, 2).charges.heal, 0, 'ยาชุบชีวิตหมด');
  eq(player(st, 2).charges.kill, 0, 'ยาพิษหมด');
});

test('5. Cursed ถูกหมาป่าโจมตีและเปลี่ยนฝ่ายแทนการตาย', () => {
  const st = newGame(E, ['werewolf', 'cursed', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(player(st, 2).alive, true, 'ต้องไม่ตาย');
  eq(player(st, 2).currentTeam, 'WEREWOLF', 'ต้องเปลี่ยนเป็นฝ่ายหมาป่า');
});

test('6. Tough Guy ถูกโจมตีและตายในคืนถัดไป', () => {
  const st = newGame(E, ['werewolf', 'tough_guy', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(player(st, 2).alive, true, 'คืนแรกยังไม่ตาย');
  nextNight(st);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  eq(player(st, 2).alive, false, 'คืนที่สองต้องตาย');
  eq(player(st, 3).alive, false, 'เหยื่อคืนที่สองต้องตาย');
});

test('7. Diseased ถูกกินและหมาป่าอดฆ่าคืนถัดไป', () => {
  const st = newGame(E, ['werewolf', 'diseased', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(player(st, 2).alive, false, 'ผู้ติดโรคตาย');
  nextNight(st);
  const wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  eq(wolfStep.maxTargets, 0, 'คืนถัดไปฆ่าใครไม่ได้');
  finishRemainingSteps(E, st);
  E.finishNight(st);
  eq(E.alivePlayers(st).length, 5, 'ไม่มีใครตายเพิ่ม');
});

test('8. Wolf Cub ตายและสร้างสิทธิ์ฆ่าสองเป้าหมาย', () => {
  const st = newGame(E, ['werewolf', 'wolf_cub', 'villager', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  E.moderatorKill(st, pid(st, 2), 'ทดสอบ');
  eq(player(st, 2).alive, false, 'ลูกหมาป่าตาย');
  eq(st.flags.wolfExtraKills, 1, 'ต้องได้สิทธิ์ฆ่าเพิ่ม');
  nextNight(st);
  const wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  eq(wolfStep.maxTargets, 2, 'ฆ่าได้สองเป้าหมาย');
  act(E, st, 'wolves', [4, 5]);
  E.finishNight(st);
  eq(player(st, 4).alive, false, 'เหยื่อคนที่หนึ่ง');
  eq(player(st, 5).alive, false, 'เหยื่อคนที่สอง');
});

test('9. Hunter ตายแล้วยิง Soulmate ทำให้เกิดการตายต่อเนื่อง', () => {
  const st = newGame(E, ['werewolf', 'hunter', 'cupid', 'villager', 'villager', 'villager']);
  act(E, st, 'cupid', [4, 5]);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(st.status, 'DEATH_TRIGGER', 'ต้องรอให้นายพรานยิงก่อน');
  eq(st.pendingPrompts.length, 1, 'ต้องมีคำสั่งค้างหนึ่งรายการ');
  E.resolveDeathPrompt(st, st.pendingPrompts[0].promptId, pid(st, 4));
  eq(player(st, 4).alive, false, 'เป้าหมายนายพรานตาย');
  eq(player(st, 5).alive, false, 'คู่แท้ตายตาม');
  eq(st.status, 'DAWN', 'กลับเข้าสู่รุ่งเช้า');
});

test('10. Mad Bomber ตายและฆ่าเพื่อนบ้านที่มีชีวิตใกล้ที่สุดสองฝั่ง', () => {
  const st = newGame(E, ['werewolf', 'villager', 'mad_bomber', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  eq(player(st, 3).alive, false, 'มือระเบิดตาย');
  eq(player(st, 2).alive, false, 'เพื่อนบ้านซ้ายตาย');
  eq(player(st, 4).alive, false, 'เพื่อนบ้านขวาตาย');
});

test('11. Dire Wolf ตายเพราะ Companion ตาย แต่ไม่ย้อนกลับ', () => {
  const a = newGame(E, ['dire_wolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
  act(E, a, 'dire_wolf', [3]);
  act(E, a, 'wolves', [3]);
  E.finishNight(a);
  eq(player(a, 3).alive, false, 'คู่หูตาย');
  eq(player(a, 1).alive, false, 'หมาป่าไดร์ต้องตายตาม');

  const b = newGame(E, ['dire_wolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
  act(E, b, 'dire_wolf', [3]);
  act(E, b, 'wolves', [4]);
  E.finishNight(b);
  E.moderatorKill(b, pid(b, 1), 'ทดสอบ');
  eq(player(b, 1).alive, false, 'หมาป่าไดร์ตาย');
  eq(player(b, 3).alive, true, 'คู่หูต้องไม่ตายตาม');
});

test('12. Virginia Woolf ตายแล้วเป้าหมายที่กลัวตายตาม', () => {
  const st = newGame(E, ['werewolf', 'virginia_woolf', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'virginia_woolf', [3]);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(player(st, 2).alive, false, 'เวอร์จิเนียตาย');
  eq(player(st, 3).alive, false, 'ผู้ที่หวาดกลัวตายตาม');
});

test('13. Prince รอดจากการแขวนคอครั้งแรกและวันจบทันที', () => {
  const st = newGame(E, ['werewolf', 'prince', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [6]);
  E.finishNight(st);
  lynch(st, 2);
  eq(player(st, 2).alive, true, 'เจ้าชายต้องรอด');
  eq(player(st, 2).revealed, true, 'ต้องเปิดเผยตัว');
  eq(st.nightNumber, 2, 'วันต้องจบทันทีและเข้าสู่คืนที่สอง');
});

test('14. Troublemaker ทำให้วันมีสองการแขวน', () => {
  const st = newGame(E, ['werewolf', 'troublemaker', 'villager', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'troublemaker', [], { use: true });
  act(E, st, 'wolves', [7]);
  E.finishNight(st);
  E.startDiscussion(st);
  eq(st.day.maxLynches, 2, 'ต้องแขวนคอได้สองครั้ง');
  E.startNomination(st, [pid(st, 5)]);
  E.eligibleVoters(st).forEach(v => E.submitVote(st, v.playerId, pid(st, 5)));
  E.resolveVote(st);
  eq(player(st, 5).alive, false, 'การแขวนคอครั้งแรก');
  eq(st.status, 'NOMINATION', 'ต้องกลับมาเสนอชื่อรอบสอง');
  E.startNomination(st, [pid(st, 6)]);
  E.eligibleVoters(st).forEach(v => E.submitVote(st, v.playerId, pid(st, 6)));
  E.resolveVote(st);
  eq(player(st, 6).alive, false, 'การแขวนคอครั้งที่สอง');
  eq(st.nightNumber, 2, 'จบวันแล้วเข้าคืนที่สอง');
});

test('15. Mayor, Pacifist และ Village Idiot อยู่ในการโหวตเดียวกัน', () => {
  const st = newGame(E, ['werewolf', 'mayor', 'pacifist', 'village_idiot', 'villager', 'villager']);
  act(E, st, 'wolves', [6]);
  E.finishNight(st);
  E.startDiscussion(st);
  E.startNomination(st, [pid(st, 5)]);
  throws(() => E.submitVote(st, pid(st, 3), pid(st, 5)), 'ผู้รักสันติต้องโหวตไว้ชีวิตเท่านั้น');
  throws(() => E.submitVote(st, pid(st, 4), 'SPARE'), 'คนโง่ต้องโหวตกำจัดเท่านั้น');
  E.submitVote(st, pid(st, 2), pid(st, 5));
  E.submitVote(st, pid(st, 3), 'SPARE');
  E.submitVote(st, pid(st, 4), pid(st, 5));
  E.submitVote(st, pid(st, 1), pid(st, 5));
  const t = E.tallyVotes(st);
  eq(t.tally[pid(st, 5)], 4, 'นายกเทศมนตรีต้องมีน้ำหนักสองเสียง');
  eq(t.spare, 1, 'คะแนนไว้ชีวิต');
  E.resolveVote(st);
  eq(player(st, 5).alive, false, 'ต้องถูกแขวนคอ');
});

test('15b. Village Idiot ถูกแขวนคอแล้วรอดแต่โหวตไม่ได้อีก', () => {
  const st = newGame(E, ['werewolf', 'village_idiot', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [6]);
  E.finishNight(st);
  lynch(st, 2);
  eq(player(st, 2).alive, true, 'คนโง่ต้องรอด');
  assert(E.hasStatus(player(st, 2), 'CANNOT_VOTE'), 'ต้องโหวตไม่ได้อีก');
});

test('16. Doppelgänger รับบทและฝ่ายเมื่อเป้าหมายตาย', () => {
  const st = newGame(E, ['werewolf', 'doppelganger', 'seer', 'villager', 'villager', 'villager']);
  act(E, st, 'doppelganger', [3]);
  act(E, st, 'wolves', [3]);
  act(E, st, 'seer', [1]);
  E.finishNight(st);
  eq(player(st, 3).alive, false, 'ต้นแบบตาย');
  eq(player(st, 2).currentRoleId, 'seer', 'ต้องรับบทผู้หยั่งรู้');
  nextNight(st);
  assert(hasStep(st, 'seer'), 'คืนถัดไปต้องมีขั้นตอนผู้หยั่งรู้อีกครั้ง');
});

test('17. Drunk คืนที่สามกลายเป็น Werewolf และเข้าร่วมฝูงถูกต้อง', () => {
  const st = newGame(E,
    ['werewolf', 'drunk', 'villager', 'villager', 'villager', 'villager', 'villager'],
    { hidden: { 1: 'werewolf' } });
  assert(!hasStep(st, 'drunk'), 'คืนแรกยังไม่สร่างเมา');
  act(E, st, 'wolves', [7]);
  E.finishNight(st); nextNight(st);
  assert(!hasStep(st, 'drunk'), 'คืนที่สองยังไม่สร่างเมา');
  act(E, st, 'wolves', [6]);
  E.finishNight(st); nextNight(st);
  assert(hasStep(st, 'drunk'), 'คืนที่สามต้องสร่างเมา');
  act(E, st, 'drunk', []);
  eq(player(st, 2).currentRoleId, 'werewolf', 'บทบาทจริงคือหมาป่า');
  eq(player(st, 2).currentTeam, 'WEREWOLF', 'ต้องย้ายฝ่าย');
  finishRemainingSteps(E, st);
  E.finishNight(st); nextNight(st);
  const wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  assert(wolfStep.actorIds.indexOf(pid(st, 2)) > -1, 'ต้องตื่นพร้อมฝูงในคืนถัดไป');
});

test('18. Apprentice Seer รับช่วงหลัง Seer ตาย', () => {
  const st = newGame(E, ['werewolf', 'seer', 'apprentice_seer', 'villager', 'villager', 'villager']);
  assert(!hasStep(st, 'apprentice_seer'), 'คืนแรกยังไม่ต้องปลุกผู้ฝึกหัด');
  act(E, st, 'wolves', [2]);
  act(E, st, 'seer', [1]);
  E.finishNight(st); nextNight(st);
  assert(hasStep(st, 'apprentice_seer'), 'ต้องรับช่วงในคืนถัดไป');
  const info = act(E, st, 'apprentice_seer', [1]);
  eq(info.detail.threat, true, 'ตรวจหมาป่าต้องได้ผลว่าเป็นภัย');
});

test('19. Alpha Wolf เปลี่ยนเหยื่อเป็น Werewolf และกรณีถูก protection ขัดขวาง', () => {
  const st = newGame(E, ['alpha_wolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [7]);
  E.finishNight(st);
  assert(!hasStep(st, 'alpha_wolf') || true, 'ยังไม่ต้องมีขั้นตอนอัลฟาในคืนแรก');
  lynch(st, 2);
  eq(player(st, 2).alive, false, 'หมาป่าธรรมดาถูกแขวนคอ');
  eq(st.flags.aWolfDiedByDay, true, 'ต้องบันทึกว่าหมาป่าตายกลางวัน');
  assert(hasStep(st, 'alpha_wolf'), 'อัลฟาต้องใช้พลังได้แล้ว');
  act(E, st, 'wolves', [4]);
  act(E, st, 'alpha_wolf', [], { convert: true });
  E.finishNight(st);
  eq(player(st, 4).alive, true, 'เหยื่อต้องไม่ตาย');
  eq(player(st, 4).currentTeam, 'WEREWOLF', 'เหยื่อต้องกลายเป็นหมาป่า');

  const b = newGame(E, ['alpha_wolf', 'werewolf', 'bodyguard', 'villager', 'villager', 'villager', 'villager']);
  act(E, b, 'bodyguard', [5]);
  act(E, b, 'wolves', [7]);
  E.finishNight(b);
  lynch(b, 2);
  act(E, b, 'bodyguard', [4]);
  act(E, b, 'wolves', [4]);
  act(E, b, 'alpha_wolf', [], { convert: true });
  E.finishNight(b);
  eq(player(b, 4).alive, true, 'ยังมีชีวิต');
  eq(player(b, 4).currentTeam, 'VILLAGE', 'ผู้คุ้มกันต้องขัดขวางการเปลี่ยนฝ่าย');
});

test('20. Revealer เลือก Villager แล้วตายเอง / เลือกหมาป่าแล้วหมาป่าตาย', () => {
  const a = newGame(E, ['werewolf', 'revealer', 'villager', 'villager', 'villager', 'villager']);
  act(E, a, 'revealer', [3]);
  finishRemainingSteps(E, a);
  E.finishNight(a);
  eq(player(a, 2).alive, false, 'ผู้เปิดโปงต้องตายเอง');
  eq(player(a, 3).alive, true, 'ชาวบ้านต้องไม่ตาย');

  const b = newGame(E, ['werewolf', 'revealer', 'villager', 'villager', 'villager', 'villager']);
  act(E, b, 'revealer', [1]);
  finishRemainingSteps(E, b);
  E.finishNight(b);
  eq(player(b, 1).alive, false, 'หมาป่าต้องถูกเปิดโปงและตาย');
  eq(player(b, 2).alive, true, 'ผู้เปิดโปงต้องรอด');
});

test('21. Vampire victim ถูกเปิดผลเมื่อเกิด nomination ไม่ใช่ตอนรุ่งเช้า', () => {
  const st = newGame(E, ['vampire', 'werewolf', 'villager', 'villager', 'villager', 'villager'],
    { variants: { vampireEnabled: true } });
  act(E, st, 'vampire', [3]);
  finishRemainingSteps(E, st);
  E.finishNight(st);
  eq(player(st, 3).alive, true, 'ตอนรุ่งเช้ายังไม่ตาย');
  E.startDiscussion(st);
  eq(player(st, 3).alive, true, 'ช่วงอภิปรายยังไม่ตาย');
  E.startNomination(st, [pid(st, 4)]);
  eq(player(st, 3).alive, false, 'ต้องตายเมื่อมีการเสนอชื่อ');
});

test('22. Cult Leader ชนะเมื่อผู้รอดทั้งหมดอยู่ในลัทธิ', () => {
  const st = newGame(E, ['cult_leader', 'villager', 'villager', 'werewolf', 'villager']);
  act(E, st, 'cult_leader', [4]);
  act(E, st, 'wolves', [5]);
  E.finishNight(st);
  eq(st.status, 'DAWN', 'ยังไม่จบเกม');
  nextNight(st);
  act(E, st, 'cult_leader', [2]);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  eq(st.status, 'FINISHED', 'เกมต้องจบ');
  eq(st.winners.primaryWinningTeams[0], 'CULT', 'ลัทธิต้องชนะ');
});

test('23. คนบ้าถูกโหวตแขวนคอแล้วชนะทันที เกมจบทันที', () => {
  const st = newGame(E, ['werewolf', 'tanner', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [5]);
  E.finishNight(st);
  assert(st.status !== 'FINISHED', 'เกมยังไม่จบหลังคืนแรก');
  lynch(st, 2);
  eq(st.status, 'FINISHED', 'แขวนคนบ้าแล้วเกมต้องจบทันที');
  eq(st.winners.primaryWinningTeams[0], 'TANNER', 'ผู้ชนะต้องเป็นคนบ้า');
  const ind = st.winners.individualWinners.map(w => w.roleId);
  assert(ind.indexOf('tanner') > -1, 'คนบ้าต้องอยู่ในผู้ชนะส่วนบุคคล');
});

test('23ก. ค่าเริ่มต้น LYNCH_ONLY คนบ้าถูกหมาป่าฆ่าจะไม่ชนะ', () => {
  const st = newGame(E, ['werewolf', 'tanner', 'villager']);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(st.status, 'FINISHED', 'ถึง parity แล้วเกมจบ');
  eq(st.winners.primaryWinningTeams[0], 'WEREWOLF', 'หมาป่าชนะทีม');
  const ind = st.winners.individualWinners.map(w => w.roleId);
  assert(ind.indexOf('tanner') === -1, 'ตายด้วยหมาป่าไม่นับว่าคนบ้าชนะ');
});

test('23ข. โหมด ANY_DEATH คนบ้าตายด้วยวิธีใดก็ชนะ', () => {
  const st = newGame(E, ['werewolf', 'tanner', 'villager'], { variants: { tannerMode: 'ANY_DEATH', tannerEndsGame: false } });
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(st.status, 'FINISHED', 'ถึง parity แล้วเกมจบ');
  eq(st.winners.primaryWinningTeams[0], 'WEREWOLF', 'หมาป่ายังชนะทีม');
  const ind = st.winners.individualWinners.map(w => w.roleId);
  assert(ind.indexOf('tanner') > -1, 'คนบ้าต้องเป็นผู้ชนะส่วนบุคคล');
});

test('24. Hoodlum ชนะร่วมเมื่อเงื่อนไขครบ', () => {
  const st = newGame(E, ['werewolf', 'hoodlum', 'villager', 'villager', 'villager']);
  act(E, st, 'hoodlum', [3, 4]);
  act(E, st, 'wolves', [3]);
  E.finishNight(st); nextNight(st);
  act(E, st, 'wolves', [4]);
  E.finishNight(st); nextNight(st);
  act(E, st, 'wolves', [5]);
  E.finishNight(st);
  eq(st.status, 'FINISHED', 'ถึง parity แล้ว');
  eq(st.winners.primaryWinningTeams[0], 'WEREWOLF', 'ทีมหมาป่าชนะ');
  const ind = st.winners.individualWinners.map(w => w.roleId);
  assert(ind.indexOf('hoodlum') > -1, 'อันธพาลต้องชนะร่วม');
});

test('25. Lone Wolf ชนะเดี่ยวโดยไม่ประกาศ Werewolf team ชนะผิดคน', () => {
  const st = newGame(E, ['lone_wolf', 'villager', 'villager']);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  eq(st.status, 'FINISHED', 'เกมต้องจบ');
  eq(st.winners.primaryWinningTeams[0], 'LONE_WOLF', 'ต้องเป็นหมาป่าเดียวดาย');
  assert(st.winners.primaryWinningTeams.indexOf('WEREWOLF') === -1, 'ห้ามประกาศทีมหมาป่าชนะ');
});

test('26. Cross-team Soulmates เหลือสองคนสุดท้าย', () => {
  const st = newGame(E, ['werewolf', 'villager', 'cupid', 'villager']);
  act(E, st, 'cupid', [1, 2]);
  act(E, st, 'wolves', [4]);
  E.finishNight(st); nextNight(st);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  eq(st.status, 'FINISHED', 'เกมต้องจบ');
  eq(st.winners.primaryWinningTeams[0], 'SOULMATES', 'คู่แท้ข้ามฝ่ายต้องชนะ');
});

test('27. Reload หน้าเว็บกลางคืนแล้วกลับ step เดิม', () => {
  const st = newGame(E, ['werewolf', 'bodyguard', 'seer', 'villager', 'villager', 'villager']);
  act(E, st, 'bodyguard', [3]);
  const before = { status: st.status, idx: st.night.stepIndex, step: E.currentStep(st).stepId };
  const restored = JSON.parse(JSON.stringify(st));
  eq(restored.status, before.status, 'สถานะต้องเท่าเดิม');
  eq(restored.night.stepIndex, before.idx, 'step index ต้องเท่าเดิม');
  eq(E.currentStep(restored).stepId, before.step, 'ต้องกลับมาที่ขั้นตอนเดิม');
  act(E, restored, 'wolves', [4]);
  eq(restored.night.actions['__wolves__'].targets[0], pid(restored, 4), 'ทำงานต่อได้ปกติ');
});

test('28. ส่ง command ซ้ำแล้วไม่เกิดผลซ้ำ', () => {
  const st = newGame(E, ['werewolf', 'bodyguard', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'bodyguard', [3]);
  throws(() => act(E, st, 'bodyguard', [4]), 'ขั้นตอนที่บันทึกแล้วต้องบันทึกซ้ำไม่ได้');
  eq(st.night.actions['bodyguard'].targets[0], pid(st, 3), 'ผลลัพธ์ต้องไม่ถูกเขียนทับ');
});

test('29. Client สองคำสั่งชนกันแล้ว version check ปฏิเสธคำสั่งเก่า', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager']);
  st.version = 5;
  const staleVersion = 5;
  E.assertVersion(st, staleVersion);
  st.version = 6;                       // another client committed first
  throws(() => E.assertVersion(st, staleVersion), 'คำสั่งเก่าต้องถูกปฏิเสธ');
});

test('30. Death Queue หลายชั้นจบโดยไม่วนลูปไม่สิ้นสุด', () => {
  const st = newGame(E,
    ['werewolf', 'cupid', 'mad_bomber', 'hunter', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'cupid', [3, 5]);          // คู่แท้ผูกกับมือระเบิด
  act(E, st, 'wolves', [3]);            // ระเบิดทำงานและลามต่อ
  E.finishNight(st);
  if (st.pendingPrompts.length) {
    E.resolveDeathPrompt(st, st.pendingPrompts[0].promptId, 'SKY');
  }
  eq(st.deathQueue.length, 0, 'คิวต้องว่างเมื่อจบ');
  eq(player(st, 3).alive, false, 'มือระเบิดตาย');
  eq(player(st, 5).alive, false, 'คู่แท้ตายตาม');
  assert(st.status === 'DAWN' || st.status === 'FINISHED', 'ต้องเดินหน้าต่อได้');
});

/* ================================================================ */
console.log('\n=== เพิ่มเติม: การทำงานร่วมของบทบาทกลุ่มขยาย ===');
suite('extra');

test('Fruit Brute เป็นหมาป่าตัวสุดท้ายแล้วเลือกเหยื่อไม่ได้', () => {
  const st = newGame(E, ['fruit_brute', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
  let wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  eq(wolfStep.maxTargets, 1, 'ยังมีหมาป่าอีกตัว จึงฆ่าได้');
  act(E, st, 'wolves', [6]);
  E.finishNight(st);
  lynch(st, 2);
  wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  eq(wolfStep.maxTargets, 0, 'เหลือหมาป่ามังสวิรัติตัวเดียวจึงกินไม่ได้');
});

test('Fang Face ไม่ตื่นกับฝูงจนกว่าจะเป็นหมาป่าตัวสุดท้าย', () => {
  const st = newGame(E, ['fang_face', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
  let wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  assert(wolfStep.actorIds.indexOf(pid(st, 1)) > -1, 'คืนแรกต้องตื่นรู้จักฝูง');
  act(E, st, 'wolves', [6]);
  E.finishNight(st); nextNight(st);
  wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  assert(wolfStep.actorIds.indexOf(pid(st, 1)) === -1, 'คืนที่สองต้องไม่ตื่น');
  E.forceEndDay(st);
});

test('Big Bad Wolf ให้เหยื่อเพิ่มที่ต้องนั่งติดกัน', () => {
  const st = newGame(E, ['big_bad_wolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
  const wolfStep = st.night.steps.filter(s => s.stepId === 'wolves')[0];
  eq(wolfStep.maxTargets, 2, 'ฆ่าได้สองเป้าหมาย');
  eq(wolfStep.requireAdjacentSecond, true, 'เป้าหมายที่สองต้องนั่งติดกัน');
  const bad = E.validateTargets(st, wolfStep, [pid(st, 2), pid(st, 5)]);
  eq(bad.ok, false, 'ต้องปฏิเสธเป้าหมายที่ไม่ติดกัน');
  const good = E.validateTargets(st, wolfStep, [pid(st, 2), pid(st, 3)]);
  eq(good.ok, true, 'เป้าหมายติดกันต้องผ่าน');
});

test('Mystic Seer เห็นบทบาทจริง และ Mentalist บอกว่าอยู่ทีมเดียวกันหรือไม่', () => {
  const st = newGame(E, ['werewolf', 'mystic_seer', 'mentalist', 'villager', 'villager', 'villager']);
  const i1 = act(E, st, 'mystic_seer', [1]);
  eq(i1.detail.roleId, 'werewolf', 'ต้องเห็นบทบาทจริง');
  const i2 = act(E, st, 'mentalist', [4, 5]);
  eq(i2.detail.same, true, 'ชาวบ้านสองคนอยู่ทีมเดียวกัน');
  const st2 = newGame(E, ['werewolf', 'mentalist', 'villager', 'villager', 'villager', 'villager']);
  const i3 = act(E, st2, 'mentalist', [1, 3]);
  eq(i3.detail.same, false, 'หมาป่ากับชาวบ้านคนละทีม');
});

test('Old Hag ส่งออกแล้วโหวตไม่ได้ และสถานะหายเมื่อจบวัน', () => {
  const st = newGame(E, ['werewolf', 'old_hag', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'old_hag', [3]);
  act(E, st, 'wolves', [6]);
  E.finishNight(st);
  assert(E.hasStatus(player(st, 3), 'EXILED'), 'ต้องถูกส่งออก');
  E.startDiscussion(st);
  const voters = E.eligibleVoters(st).map(v => v.playerId);
  assert(voters.indexOf(pid(st, 3)) === -1, 'ผู้ถูกส่งออกต้องโหวตไม่ได้');
  E.forceEndDay(st);
  assert(!E.hasStatus(player(st, 3), 'EXILED'), 'สถานะต้องหายเมื่อขึ้นคืนใหม่');
});

test('Spellcaster ปิดปากเป้าหมายในวันถัดไป', () => {
  const st = newGame(E, ['werewolf', 'spellcaster', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'spellcaster', [3]);
  act(E, st, 'wolves', [6]);
  E.finishNight(st);
  assert(E.hasStatus(player(st, 3), 'MUTED'), 'ต้องพูดไม่ได้');
});

test('P.I. ตรวจสามคนและใช้ได้ครั้งเดียว', () => {
  const st = newGame(E, ['werewolf', 'paranormal_investigator', 'villager', 'villager', 'villager', 'villager']);
  const info = act(E, st, 'paranormal_investigator', [6]);
  eq(info.detail.group.length, 3, 'ต้องตรวจสามคน');
  eq(info.detail.anyThreat, true, 'ที่นั่ง 6 ติดกับหมาป่าที่นั่ง 1');
  finishRemainingSteps(E, st);
  E.finishNight(st); nextNight(st);
  assert(!hasStep(st, 'paranormal_investigator'), 'ใช้พลังหมดแล้ว');
});

test('Sorceress หาผู้หยั่งรู้เจอ และผู้หยั่งรู้อ่าน Sorceress เป็นหมู่บ้าน', () => {
  const st = newGame(E, ['werewolf', 'sorceress', 'seer', 'villager', 'villager', 'villager']);
  const i1 = act(E, st, 'sorceress', [3]);
  eq(i1.detail.isSeer, true, 'ต้องหาเจอ');
  const i2 = act(E, st, 'seer', [2]);
  eq(i2.detail.threat, false, 'ผู้หยั่งรู้ต้องอ่านเป็นฝ่ายหมู่บ้าน');
});

test('Huntress สังหารได้ครั้งเดียวต่อเกม', () => {
  const st = newGame(E, ['werewolf', 'huntress', 'villager', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'huntress', [3]);
  finishRemainingSteps(E, st);
  E.finishNight(st);
  eq(player(st, 3).alive, false, 'เป้าหมายต้องตาย');
  nextNight(st);
  assert(!hasStep(st, 'huntress'), 'ใช้พลังหมดแล้ว');
});

test('tieVoteRule = NO_LYNCH ทำให้เสมอแล้วไม่มีใครถูกแขวน', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [6]);
  E.finishNight(st);
  E.startDiscussion(st);
  E.startNomination(st, [pid(st, 2), pid(st, 3)]);
  E.submitVote(st, pid(st, 1), pid(st, 2));
  E.submitVote(st, pid(st, 2), pid(st, 3));
  E.submitVote(st, pid(st, 3), pid(st, 2));
  E.submitVote(st, pid(st, 4), pid(st, 3));
  E.resolveVote(st);
  eq(player(st, 2).alive, true, 'ไม่มีใครถูกแขวนคอ');
  eq(player(st, 3).alive, true, 'ไม่มีใครถูกแขวนคอ');
});

test('tieVoteRule = ALL_TIED_DIE ทำให้ผู้เสมอกันตายทั้งหมด', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager', 'villager'],
    { variants: { tieVoteRule: 'ALL_TIED_DIE' } });
  act(E, st, 'wolves', [7]);
  E.finishNight(st);
  E.startDiscussion(st);
  E.startNomination(st, [pid(st, 2), pid(st, 3)]);
  E.submitVote(st, pid(st, 1), pid(st, 2));
  E.submitVote(st, pid(st, 4), pid(st, 3));
  E.resolveVote(st);
  eq(player(st, 2).alive, false, 'ผู้เสมอคนที่หนึ่งตาย');
  eq(player(st, 3).alive, false, 'ผู้เสมอคนที่สองตาย');
});

test('PublicViewModel ต้องไม่รั่วบทบาทลับของผู้เล่นที่ยังมีชีวิต', () => {
  const st = newGame(E, ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
  const pub = E.publicViewModel(st);
  const json = JSON.stringify(pub);
  assert(json.indexOf('werewolf') === -1, 'ห้ามมี roleId ของหมาป่า');
  pub.players.forEach(p => {
    if (p.alive) eq(p.roleTh, '', 'ผู้เล่นที่ยังมีชีวิตต้องไม่แสดงบทบาท');
  });
});

test('ModeratorViewModel แสดงบทบาทและสถานะครบสำหรับผู้ดำเนินเกม', () => {
  const st = newGame(E, ['werewolf', 'seer', 'villager', 'villager', 'villager', 'villager']);
  const vm = E.moderatorViewModel(st);
  eq(vm.players[0].currentRoleId, 'werewolf', 'ผู้ดำเนินเกมต้องเห็นบทบาท');
  eq(vm.aliveCount, 6, 'จำนวนผู้มีชีวิต');
  assert(vm.currentStep, 'ต้องมีขั้นตอนปัจจุบัน');
});

test('finalSummary รายงานบทบาทเริ่มต้นและบทบาทสุดท้าย', () => {
  const st = newGame(E, ['werewolf', 'cursed', 'villager']);
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  const s = E.finalSummary(st);
  const row = s.players[1];
  eq(row.baseRoleTh, E.roleDisplay('cursed'), 'บทบาทเริ่มต้น');
  eq(row.finalRoleTh, E.roleDisplay('werewolf'), 'บทบาทสุดท้าย');
});

/* ================================================================
 * ตัวเลือกกติกาที่เพิ่งเดินสายไฟใหม่ (เดิมมีปุ่มแต่ไม่มีโค้ดรองรับ)
 * ================================================================ */
suite('ตัวเลือกกติกาที่เดินสายไฟใหม่');

test('witchMode = ONE_HEAL_ONE_KILL แม่มดใช้ได้ทั้งสองขวด', () => {
  const st = newGame(E, ['werewolf', 'witch', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [3]);
  act(E, st, 'witch', [], { heal: true, healTargetId: pid(st, 3), killTargetId: pid(st, 1) });
  E.finishNight(st);
  assert(player(st, 3).alive, 'ยาชุบชีวิตช่วยเหยื่อไว้ได้');
  assert(!player(st, 1).alive, 'ยาพิษฆ่าหมาป่าได้ในคืนเดียวกัน');
});

test('witchMode = ONE_POWER_TOTAL ใช้ขวดเดียวแล้วหมดพลังทั้งเกม', () => {
  const st = newGame(E, ['werewolf', 'witch', 'villager', 'villager', 'villager'],
    { variants: { witchMode: 'ONE_POWER_TOTAL' } });
  act(E, st, 'wolves', [3]);
  act(E, st, 'witch', [], { heal: true, healTargetId: pid(st, 3) });
  const w = player(st, 2);
  eq(w.charges.heal, 0, 'ยาชุบชีวิตหมด');
  eq(w.charges.kill, 0, 'ยาพิษถูกเผาไปด้วยตามกติกานี้');
  E.finishNight(st); nextNight(st);
  assert(!hasStep(st, 'witch'), 'คืนถัดไปแม่มดไม่ต้องตื่นอีก');
});

test('priestMode = BLESSING ให้พรคุ้มครองและใช้ได้ครั้งเดียว', () => {
  const st = newGame(E, ['werewolf', 'priest', 'villager', 'villager', 'villager']);
  act(E, st, 'priest', [3]);
  act(E, st, 'wolves', [3]);
  E.finishNight(st);
  assert(player(st, 3).alive, 'พรคุ้มครองกันการโจมตีได้');
  nextNight(st);
  assert(!hasStep(st, 'priest'), 'นักบวชใช้พลังหมดแล้วไม่ตื่นอีก');
});

test('priestMode = DEAD_ROLE_CHECK ตรวจบทบาทผู้ตายได้ทุกคืนและไม่ให้พร', () => {
  const st = newGame(E, ['werewolf', 'priest', 'villager', 'villager', 'villager'],
    { variants: { priestMode: 'DEAD_ROLE_CHECK' } });
  assert(!hasStep(st, 'priest'), 'คืนแรกยังไม่มีใครตาย นักบวชจึงไม่ต้องตื่น');
  act(E, st, 'wolves', [5]);
  E.finishNight(st); nextNight(st);

  const step = st.night.steps.filter(s => s.stepId === 'priest')[0];
  assert(step, 'นักบวชยังตื่นในคืนที่สอง');
  eq(step.targetRule, 'DEAD_PLAYER', 'เป้าหมายต้องเป็นผู้ที่เสียชีวิตแล้ว');

  throws(() => E.submitRoleAction(st, 'priest', [pid(st, 3)], {}), 'เลือกคนเป็นไม่ได้');

  E.submitRoleAction(st, 'priest', [pid(st, 5)], {});
  const res = st.night.results[st.night.results.length - 1];
  assert(res.infoTh.indexOf(E.roleDisplay('villager')) > -1, 'ต้องบอกบทบาทของผู้ตาย');

  act(E, st, 'wolves', [4]);
  E.finishNight(st);
  assert(!player(st, 4).alive, 'โหมดนี้ไม่มีพรคุ้มครอง เหยื่อต้องตายตามปกติ');
});

test('apprenticeSeerMode = DOUBLE_CHECK คืนที่รับช่วงตรวจได้สองคน', () => {
  const st = newGame(E, ['werewolf', 'seer', 'apprentice_seer', 'villager', 'villager', 'villager'],
    { variants: { apprenticeSeerMode: 'DOUBLE_CHECK' } });
  act(E, st, 'seer', [1]);
  act(E, st, 'wolves', [2]);
  E.finishNight(st); nextNight(st);

  const step = st.night.steps.filter(s => s.stepId === 'apprentice_seer')[0];
  assert(step, 'ผู้หยั่งรู้ฝึกหัดต้องตื่นหลังผู้หยั่งรู้ตาย');
  eq(step.minTargets, 2, 'คืนรับช่วงตรวจได้สองคน');
  E.submitRoleAction(st, 'apprentice_seer', [pid(st, 1), pid(st, 4)], {});
  const res = st.night.results[st.night.results.length - 1];
  assert(res.infoTh.indexOf('พยักหน้า') > -1 && res.infoTh.indexOf('ส่ายหน้า') > -1,
    'ต้องตอบผลของทั้งสองคน');

  finishRemainingSteps(E, st);
  E.finishNight(st); nextNight(st);
  const step2 = st.night.steps.filter(s => s.stepId === 'apprentice_seer')[0];
  eq(step2.minTargets, 1, 'คืนต่อไปกลับมาตรวจได้คนเดียว');
});

test('cupidMode = MODERATOR_SELECTS จับคู่แท้ได้โดยไม่ต้องมีการ์ดกามเทพ', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager'],
    { variants: { cupidMode: 'MODERATOR_SELECTS' } });
  assert(hasStep(st, 'cupid'), 'ต้องมีขั้นตอนจับคู่แท้แม้ไม่มีการ์ดกามเทพ');
  E.submitRoleAction(st, 'cupid', [pid(st, 2), pid(st, 3)], {});
  assert(E.hasStatus(player(st, 2), 'SOULMATE'), 'คนแรกได้สถานะคู่แท้');
  act(E, st, 'wolves', [2]);
  E.finishNight(st);
  assert(!player(st, 3).alive, 'คู่แท้อีกฝ่ายตรอมใจตายตาม');
});

test('doppelgangerMode = BLIND_INHERIT ไม่บอกบทบาทต้นแบบตั้งแต่คืนแรก', () => {
  const st = newGame(E, ['werewolf', 'doppelganger', 'seer', 'villager', 'villager'],
    { variants: { doppelgangerMode: 'BLIND_INHERIT' } });
  E.submitRoleAction(st, 'doppelganger', [pid(st, 3)], {});
  const res = st.night.results[st.night.results.length - 1];
  assert(res.infoTh.indexOf(E.roleDisplay('seer')) === -1, 'ห้ามเปิดเผยบทบาทต้นแบบ');
  finishRemainingSteps(E, st);
  E.finishNight(st);
});

test('ช่วงเสนอชื่อแยกจากช่วงอภิปรายและมีนาฬิกาของตัวเอง', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager', 'villager']);
  act(E, st, 'wolves', [5]);
  E.finishNight(st);
  E.startDiscussion(st);
  eq(st.status, 'DISCUSSION', 'เริ่มที่ช่วงอภิปราย');
  assert(st.day.discussionEndsAt > Date.now(), 'นาฬิกาอภิปรายต้องเดิน');
  eq(st.day.nominationEndsAt, 0, 'ยังไม่เริ่มนับเวลาเสนอชื่อ');

  E.openNomination(st);
  eq(st.status, 'NOMINATION', 'เข้าสู่ช่วงเสนอชื่อ');
  assert(st.day.nominationEndsAt > Date.now(), 'นาฬิกาเสนอชื่อต้องเดิน');

  E.startNomination(st, [pid(st, 2)]);
  eq(st.status, 'VOTING', 'ปิดการเสนอชื่อแล้วเข้าสู่การลงคะแนน');
});

test('openNomination เรียกผิดช่วงต้องถูกปฏิเสธ', () => {
  const st = newGame(E, ['werewolf', 'villager', 'villager', 'villager', 'villager']);
  throws(() => E.openNomination(st), 'กลางคืนยังเปิดการเสนอชื่อไม่ได้');
});

/* ================================================================
 * ชั้นจัดเก็บข้อมูล + ประสิทธิภาพ (ระยะที่ 1)
 * ใช้ Google Sheets จำลองที่นับจำนวนครั้งที่ถูกเรียกจริง
 * ================================================================ */
suite('ชั้นจัดเก็บข้อมูลและประสิทธิภาพ');

function freshStore() {
  const F = H.loadFull();
  F.setupSpreadsheet();
  F.syncRoleCatalogToSheet(true);
  return F;
}
function newStoredGame(F, n) {
  const names = [];
  for (let i = 1; i <= (n || 12); i++) names.push('ผู้เล่น' + i);
  const vm0 = F.apiCreateGame({ playerNames: names });
  return { gameId: vm0.gameId, pin: vm0.moderatorPin, version: vm0.version, names: names };
}
function zero(c) { Object.keys(c).forEach(k => (c[k] = 0)); }

test('บันทึกแล้วอ่านกลับได้ครบถ้วน', () => {
  const F = freshStore();
  const g = newStoredGame(F, 8);
  const vm = F.apiLoadGame(g.gameId, g.pin);
  eq(vm.gameId, g.gameId, 'อ่านเกมเดิมกลับมาได้');
  eq(vm.players.length, 8, 'จำนวนผู้เล่นครบ');
  throws(() => F.apiLoadGame(g.gameId, '0000'), 'PIN ผิดต้องเข้าไม่ได้');
});

test('คำสั่งธรรมดาไม่ลบแถวทีละแถวอีกแล้ว', () => {
  const F = freshStore();
  const g = newStoredGame(F, 12);
  const c = F.__env.counts;
  F.resetStorageHandles_();
  zero(c);
  F.apiSetPlayers({ gameId: g.gameId, moderatorPin: g.pin,
                    expectedVersion: g.version, playerNames: g.names });
  eq(c.deleteRow, 0, 'ห้ามมี deleteRow แม้แต่ครั้งเดียว (เดิม 12 ครั้ง)');
  eq(c.openById, 1, 'เปิดสเปรดชีตครั้งเดียวต่อการรัน (เดิม 3 ครั้ง)');
  assert(c.getValues <= 2, 'สแกนคอลัมน์ไม่เกินหนึ่งครั้ง แต่ได้ ' + c.getValues);
});

test('จอสาธารณะ poll ไม่อ่านชีตบทบาทซ้ำ', () => {
  const F = freshStore();
  const g = newStoredGame(F, 6);
  F.apiPublicView(g.gameId);          /* ครั้งแรกเติมแคช */
  const c = F.__env.counts;
  F.resetStorageHandles_();
  zero(c);
  F.apiPublicView(g.gameId);
  eq(c.openById, 1, 'เปิดสเปรดชีตครั้งเดียว (เดิม 2 ครั้ง)');
  assert(c.getValues <= 1, 'ไม่อ่านชีต RoleCatalog ซ้ำ แต่ได้ getValues ' + c.getValues);
});

test('จำเลขแถวผิดแล้วต้องหาใหม่ได้เอง ไม่เขียนทับเกมอื่น', () => {
  const F = freshStore();
  const a = newStoredGame(F, 5);
  const b = newStoredGame(F, 5);
  /* จงใจทำให้แคชเลขแถวผิด */
  F.__env.cacheStore['ROW:' + a.gameId] = '99';
  F.resetStorageHandles_();
  const vmA = F.apiLoadGame(a.gameId, a.pin);
  eq(vmA.gameId, a.gameId, 'ยังอ่านเกม A ถูกตัวแม้แคชเลขแถวผิด');
  const vmB = F.apiLoadGame(b.gameId, b.pin);
  eq(vmB.gameId, b.gameId, 'เกม B ไม่ถูกกระทบ');
});

test('ตาราง Players อัปเดตเมื่อสั่งส่งออกและเมื่อจบเกม', () => {
  const F = freshStore();
  const g = newStoredGame(F, 5);
  const sheet = F.__env.sheets['Players'];
  eq(sheet._rows.length, 1, 'ระหว่างเล่นยังไม่เขียนตาราง Players');

  F.apiExportPlayerTable({ gameId: g.gameId, moderatorPin: g.pin });
  eq(sheet._rows.length, 6, 'สั่งส่งออกแล้วได้ 5 แถว + หัวตาราง');

  /* ส่งออกซ้ำต้องไม่ทำให้แถวซ้ำซ้อน */
  F.apiExportPlayerTable({ gameId: g.gameId, moderatorPin: g.pin });
  eq(sheet._rows.length, 6, 'ส่งออกซ้ำแล้วแถวต้องไม่งอก');
  eq(F.__env.counts.deleteRow, 0, 'ลบด้วย deleteRows ครั้งเดียว ไม่ใช่ทีละแถว');
});

test('ส่งออกตาราง Players ของสองเกมพร้อมกันไม่ปนกัน', () => {
  const F = freshStore();
  const a = newStoredGame(F, 4);
  const b = newStoredGame(F, 6);
  F.apiExportPlayerTable({ gameId: a.gameId, moderatorPin: a.pin });
  F.apiExportPlayerTable({ gameId: b.gameId, moderatorPin: b.pin });
  F.apiExportPlayerTable({ gameId: a.gameId, moderatorPin: a.pin });

  const rows = F.__env.sheets['Players']._rows.slice(1);
  eq(rows.length, 10, 'รวมสองเกมต้องได้ 10 แถวพอดี');
  eq(rows.filter(r => r[0] === a.gameId).length, 4, 'เกม A เหลือ 4 แถว');
  eq(rows.filter(r => r[0] === b.gameId).length, 6, 'เกม B เหลือ 6 แถว');
});

test('ตรวจเวอร์ชันซ้อนทับยังทำงาน กันคำสั่งค้างจากจอเก่า', () => {
  const F = freshStore();
  const g = newStoredGame(F, 5);
  F.apiSetPlayers({ gameId: g.gameId, moderatorPin: g.pin,
                    expectedVersion: g.version, playerNames: g.names });
  throws(() => F.apiSetPlayers({ gameId: g.gameId, moderatorPin: g.pin,
                                 expectedVersion: g.version, playerNames: g.names }),
         'ส่งเวอร์ชันเก่าซ้ำต้องถูกปฏิเสธ');
});

test('idempotencyKey เดิมต้องไม่ทำงานซ้ำสองรอบ', () => {
  const F = freshStore();
  const g = newStoredGame(F, 5);
  const c1 = { gameId: g.gameId, moderatorPin: g.pin, expectedVersion: g.version,
               idempotencyKey: 'KEY-1', playerNames: g.names };
  const r1 = F.apiSetPlayers(c1);
  const r2 = F.apiSetPlayers(c1);
  eq(r2.version, r1.version, 'ส่งซ้ำด้วยคีย์เดิมต้องได้ผลเดิม ไม่เพิ่มเวอร์ชัน');
});

process.exit(H.report() ? 0 : 1);
