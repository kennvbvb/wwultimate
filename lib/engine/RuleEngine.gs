/**
 * RuleEngine.gs
 * State machine, dynamic night order, night actions, day phase and voting.
 * Pure logic. The UI never mutates state directly (spec 5).
 */

/* ================================================================
 * Game creation & setup
 * ================================================================ */

function createGameState(payload) {
  payload = payload || {};
  var names = payload.playerNames || [];
  var state = {
    gameId: uwGameId(),
    version: 1,
    status: STATUS.SETUP,
    dayNumber: 0,
    nightNumber: 0,
    moderatorPin: uwPin(),
    title: payload.title || 'เกมหมาป่า',
    ruleVariants: defaultRuleVariants(),
    deckProfile: payload.deckProfile || { packs: ['CORE', 'WOLFPACK', 'HUNTING_PARTY'] },
    selectedRoles: [],
    players: [],
    night: null,
    day: null,
    flags: {
      wolvesSkipNextNight: false,
      wolfExtraKills: 0,
      doubleLynchNextDay: false,
      aWolfDiedByDay: false,
      cultLeaderDead: false
    },
    deathQueue: [],
    pendingPrompts: [],
    pendingVampireVictims: [],
    ghostPlayerId: null,
    timeline: [],
    winners: null,
    rolesLocked: false,
    createdAt: uwNow(),
    updatedAt: uwNow(),
    __events: []
  };
  for (var i = 0; i < names.length; i++) addPlayer(state, names[i]);
  emit(state, 'GAME_CREATED', { gameId: state.gameId, players: names.length });
  timeline(state, 'play', 'สร้างเกมใหม่ ' + state.gameId);
  return state;
}

function addPlayer(state, name) {
  if (state.rolesLocked) throw new Error('ล็อกการแจกบทบาทแล้ว ใช้คำสั่งเปิดแก้ไขก่อน');
  var seat = state.players.length + 1;
  var p = {
    playerId: 'P' + (seat < 10 ? '0' + seat : seat),
    seat: seat,
    name: String(name || ('ผู้เล่น ' + seat)).substring(0, 40),
    baseRoleId: null,
    currentRoleId: null,
    baseTeam: null,
    currentTeam: null,
    hiddenRoleId: null,
    alive: true,
    statuses: [],
    linkedPlayerIds: [],
    charges: {},
    targetsHistory: [],
    lastTargetId: null,
    revealed: false,
    deathInfo: null,
    delayedDeathNight: null
  };
  state.players.push(p);
  return p;
}

function setPlayers(state, names) {
  if (state.rolesLocked) throw new Error('ล็อกการแจกบทบาทแล้ว ใช้คำสั่งเปิดแก้ไขก่อน');
  state.players = [];
  for (var i = 0; i < names.length; i++) addPlayer(state, names[i]);
  return state;
}

function configureGame(state, payload) {
  if (state.status !== STATUS.SETUP && state.status !== STATUS.ROLE_ASSIGNMENT) {
    throw new Error('แก้ไขการตั้งค่าได้เฉพาะก่อนเริ่มเกม');
  }
  if (payload.ruleVariants) {
    for (var k in payload.ruleVariants) {
      if (payload.ruleVariants.hasOwnProperty(k) && state.ruleVariants.hasOwnProperty(k)) {
        state.ruleVariants[k] = payload.ruleVariants[k];
      }
    }
  }
  if (payload.deckProfile) state.deckProfile = payload.deckProfile;
  if (payload.selectedRoles) {
    var sel = [];
    for (var i = 0; i < payload.selectedRoles.length; i++) {
      var s = payload.selectedRoles[i];
      if (!hasRoleDef(s.roleId)) throw new Error('ไม่รู้จักบทบาท ' + s.roleId);
      if (s.count > 0) sel.push({ roleId: s.roleId, count: Number(s.count) });
    }
    state.selectedRoles = sel;
  }
  if (payload.title) state.title = String(payload.title).substring(0, 60);
  state.status = STATUS.ROLE_ASSIGNMENT;
  emit(state, 'GAME_CONFIGURED', { roles: state.selectedRoles.length });
  return state;
}

/** Remaining copies per role while the moderator records the physical deal. */
function deckRemaining(state) {
  var remain = {};
  for (var i = 0; i < state.selectedRoles.length; i++) {
    remain[state.selectedRoles[i].roleId] = state.selectedRoles[i].count;
  }
  for (var j = 0; j < state.players.length; j++) {
    var rid = state.players[j].baseRoleId;
    if (rid && remain[rid] !== undefined) remain[rid]--;
  }
  return remain;
}

/**
 * Record which physical card each player received (spec 2.1.1).
 * assignments: [{playerId, roleId, hiddenRoleId?}]
 */
function assignRoles(state, assignments) {
  if (state.rolesLocked) throw new Error('ล็อกการแจกบทบาทแล้ว ใช้คำสั่ง REOPEN_ROLE_ASSIGNMENT ก่อน');
  for (var i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    var p = mustPlayer(state, a.playerId);
    if (a.roleId === null || a.roleId === '') {
      p.baseRoleId = null; p.currentRoleId = null; p.baseTeam = null; p.currentTeam = null;
      continue;
    }
    var def = getRole(a.roleId);
    p.baseRoleId = def.roleId;
    p.currentRoleId = def.roleId;
    p.baseTeam = def.baseTeam;
    p.currentTeam = def.baseTeam;
    p.charges = def.charges ? uwClone(def.charges) : {};
    if (def.roleId === 'drunk') {
      if (!a.hiddenRoleId || !hasRoleDef(a.hiddenRoleId)) {
        throw new Error('คนเมาต้องระบุบทบาทที่แท้จริงที่ซ่อนไว้ (hiddenRoleId)');
      }
      p.hiddenRoleId = a.hiddenRoleId;
    }
  }

  var remain = deckRemaining(state);
  for (var rid in remain) {
    if (remain.hasOwnProperty(rid) && remain[rid] < 0) {
      throw new Error('บันทึกการ์ด ' + roleDisplay(rid) + ' เกินจำนวนที่มีจริง');
    }
  }
  emit(state, 'ROLES_RECORDED', { assigned: assignments.length });
  return state;
}

function assignmentStatus(state) {
  var remain = deckRemaining(state);
  var missing = 0, over = 0, unassigned = 0;
  for (var rid in remain) {
    if (!remain.hasOwnProperty(rid)) continue;
    if (remain[rid] > 0) missing += remain[rid];
    if (remain[rid] < 0) over += -remain[rid];
  }
  for (var i = 0; i < state.players.length; i++) if (!state.players[i].baseRoleId) unassigned++;
  return {
    remaining: remain, missing: missing, over: over, unassigned: unassigned,
    ready: missing === 0 && over === 0 && unassigned === 0
  };
}

function reopenRoleAssignment(state, reason) {
  state.rolesLocked = false;
  emit(state, 'ROLE_ASSIGNMENT_REOPENED', { reason: reason || '', afterStart: state.nightNumber > 0 });
  timeline(state, 'alert', 'เปิดแก้ไขการแจกบทบาทอีกครั้ง' +
    (state.nightNumber > 0 ? ' — คำเตือน: เกมเริ่มไปแล้ว' : ''));
  return state;
}

function startGame(state) {
  var st = assignmentStatus(state);
  if (!st.ready) throw new Error('ยังแจกบทบาทไม่ครบ (ขาด ' + st.missing + ' เกิน ' + st.over +
    ' ยังไม่กำหนด ' + st.unassigned + ' คน)');
  var check = validateRoleSelection(state);
  if (check.problems.length) throw new Error(check.problems.join(' / '));
  state.rolesLocked = true;
  emit(state, 'ROLES_CONFIRMED', {});
  timeline(state, 'lock', 'ยืนยันการแจกบทบาทแล้ว');
  startNight(state);
  return state;
}

/* ================================================================
 * Night
 * ================================================================ */

function startNight(state) {
  state.nightNumber++;
  state.status = state.nightNumber === 1 ? STATUS.FIRST_NIGHT : STATUS.NIGHT;
  state.night = {
    number: state.nightNumber,
    steps: [],
    stepIndex: 0,
    actions: {},
    results: [],
    protectedIds: [],
    deaths: [],
    resolved: false
  };
  state.night.steps = buildNightSteps(state);
  /* flags are consumed by buildNightSteps, clear them now */
  state.flags.wolvesSkipNextNight = false;
  state.flags.wolfExtraKills = 0;
  emit(state, 'NIGHT_STARTED', { nightNumber: state.nightNumber, steps: state.night.steps.length });
  timeline(state, 'moon', 'เริ่มคืนที่ ' + state.nightNumber);
  return state;
}

function actorHasCharge_(state, p) {
  var def = getRole(p.currentRoleId);
  if (!def.charges) return true;
  for (var k in p.charges) {
    if (p.charges.hasOwnProperty(k) && p.charges[k] > 0) return true;
  }
  return false;
}

function conditionalActive_(state, roleId, isFirst) {
  switch (roleId) {
    case 'apprentice_seer':
      return !anyAliveWithRole(state, 'seer') && anyPlayerHadRole(state, 'seer');
    case 'drunk':
      return state.nightNumber >= (state.ruleVariants.drunkRevealNight || 3);
    case 'alpha_wolf':
      return !!state.flags.aWolfDiedByDay;
    default:
      return true;
  }
}

/** Which wolves actually open their eyes tonight (Fang Face rule). */
function wolfWakeActors_(state, wolves, isFirst) {
  var ids = [];
  var lastWolf = wolves.length === 1;
  for (var i = 0; i < wolves.length; i++) {
    var w = wolves[i];
    if (w.currentRoleId === 'fang_face' && !isFirst && !lastWolf) continue;
    ids.push(w.playerId);
  }
  return ids;
}

function buildNightSteps(state) {
  var isFirst = state.nightNumber === 1;
  var steps = [];
  var alive = alivePlayers(state);

  /* ---- moderator-run soulmate pairing (cupidMode = MODERATOR_SELECTS) ---- */
  if (isFirst && state.ruleVariants.cupidMode === 'MODERATOR_SELECTS' &&
      !anyAliveWithRole(state, 'cupid') && alive.length >= 3) {
    steps.push({
      stepId: 'cupid',
      roleId: 'cupid',
      kind: 'ROLE',
      wakePriority: 4,
      titleTh: 'จับคู่แท้ (ผู้ดำเนินเกมเลือก)',
      scriptTh: 'ทุกคนหลับตา ผู้ดำเนินเกมเลือกคู่แท้สองคน แล้วปลุกทั้งคู่ให้เห็นหน้ากันอย่างเงียบ ๆ',
      noteTh: 'กติกานี้ไม่ต้องใช้การ์ดกามเทพ แต่คู่แท้ยังตรอมใจตายตามกันเหมือนเดิม',
      actorIds: [],
      targetRule: 'TWO_ALIVE',
      minTargets: 2,
      maxTargets: 2,
      optional: false,
      requireAdjacentSecond: false,
      status: 'PENDING',
      result: null
    });
  }

  /* ---- group step: the wolf pack ---- */
  var wolves = [];
  for (var i = 0; i < alive.length; i++) {
    var d = getRole(alive[i].currentRoleId);
    if (d.isWolfPack) wolves.push(alive[i]);
  }
  if (wolves.length > 0) {
    var fruitOnly = wolves.length === 1 && wolves[0].currentRoleId === 'fruit_brute';
    var bbw = 0;
    for (var b = 0; b < wolves.length; b++) if (wolves[b].currentRoleId === 'big_bad_wolf') bbw = 1;
    var extra = state.flags.wolfExtraKills || 0;
    var maxK = 1 + extra + bbw;
    var noteParts = [];
    if (state.flags.wolvesSkipNextNight) { maxK = 0; noteParts.push('คืนนี้ฝูงหมาป่ากินใครไม่ได้ (ผู้ติดโรค)'); }
    if (fruitOnly) { maxK = 0; noteParts.push('เหลือหมาป่ามังสวิรัติตัวเดียว จึงเลือกเหยื่อไม่ได้'); }
    if (extra > 0 && maxK > 0) noteParts.push('ลูกหมาป่าตายแล้ว ฆ่าได้เพิ่มอีกหนึ่งเป้าหมาย');
    if (bbw && maxK > 0) noteParts.push('จ่าฝูงหมาป่ายังมีชีวิต เหยื่อเพิ่มต้องนั่งติดกับเหยื่อคนแรก');
    for (var v = 0; v < wolves.length; v++) {
      if (wolves[v].currentRoleId === 'wolverine') noteParts.push('มีวูลเวอรีนในฝูง อย่าลืมส่งเสียงโลหะหากวูลเวอรีนนั่งใกล้เหยื่อที่สุด');
    }
    steps.push({
      stepId: 'wolves',
      roleId: '__wolves__',
      kind: 'GROUP',
      wakePriority: 30,
      titleTh: 'ฝูงหมาป่า',
      scriptTh: isFirst
        ? 'ฝูงหมาป่า ลืมตา ทำความรู้จักกัน แล้วตกลงเลือกเหยื่อหนึ่งคนอย่างเงียบ ๆ'
        : 'ฝูงหมาป่า ลืมตา ตกลงเลือกเหยื่อหนึ่งคนอย่างเงียบ ๆ',
      noteTh: noteParts.join(' • '),
      actorIds: wolfWakeActors_(state, wolves, isFirst),
      targetRule: 'WOLF_VICTIM',
      minTargets: 0,
      maxTargets: maxK,
      requireAdjacentSecond: (bbw === 1 && extra === 0),
      optional: true,
      status: 'PENDING',
      result: null
    });
  }

  /* ---- individual role steps ---- */
  var seen = {};
  for (var j = 0; j < alive.length; j++) {
    var p = alive[j];
    var def = getRole(p.currentRoleId);
    if (def.isWolfPack && def.effectHandler === 'wolfPack') continue;   // already in the pack step
    if (def.wakePolicy === 'NEVER') continue;
    if (seen[def.roleId]) continue;

    var ok = false;
    if (def.wakePolicy === 'FIRST_NIGHT_ONLY') ok = isFirst;
    else if (def.wakePolicy === 'EVERY_NIGHT') ok = true;
    else if (def.wakePolicy === 'ONCE_PER_GAME') ok = true;
    else if (def.wakePolicy === 'CONDITIONAL') ok = conditionalActive_(state, def.roleId, isFirst);
    if (!ok) continue;

    var actors = playersWithRole(state, def.roleId, true);
    var usable = [];
    for (var m = 0; m < actors.length; m++) if (actorHasCharge_(state, actors[m])) usable.push(actors[m]);
    if (!usable.length) continue;
    if (def.roleId === 'drunk') {
      var stillHidden = [];
      for (var dd = 0; dd < usable.length; dd++) if (!usable[dd].drunkRevealed) stillHidden.push(usable[dd]);
      if (!stillHidden.length) continue;
      usable = stillHidden;
    }

    seen[def.roleId] = true;
    var ids = [];
    for (var q = 0; q < usable.length; q++) ids.push(usable[q].playerId);

    var min = 1, max = 1, optional = false;
    switch (def.targetRule) {
      case 'NONE': min = 0; max = 0; optional = true; break;
      case 'TWO_ALIVE':
      case 'TWO_OTHER_ALIVE': min = 2; max = 2; break;
      case 'OPTIONAL_OTHER_ALIVE': min = 0; max = 1; optional = true; break;
      default: min = 1; max = 1;
    }
    if (def.roleId === 'witch') { min = 0; max = 0; optional = true; }  // uses meta, not targets

    /* ---- rule-variant overrides ---- */
    var targetRule = def.targetRule;

    /* Priest in DEAD_ROLE_CHECK mode inspects a dead player every night. */
    if (def.roleId === 'priest' && state.ruleVariants.priestMode === 'DEAD_ROLE_CHECK') {
      targetRule = 'DEAD_PLAYER';
      min = 1; max = 1; optional = false;
    }

    /* A step that can only target the dead is impossible while nobody has died. */
    if (targetRule === 'DEAD_PLAYER') {
      var deadCount = 0;
      for (var dc = 0; dc < state.players.length; dc++) if (!state.players[dc].alive) deadCount++;
      if (deadCount === 0) continue;
    }

    /* Apprentice Seer in DOUBLE_CHECK mode gets two reads on the night he
       inherits, to make up for the nights he sat idle. */
    if (def.roleId === 'apprentice_seer' &&
        state.ruleVariants.apprenticeSeerMode === 'DOUBLE_CHECK' &&
        !state.flags.apprenticeUsedDoubleCheck) {
      targetRule = 'TWO_OTHER_ALIVE';
      min = 2; max = 2; optional = false;
    }

    steps.push({
      stepId: def.roleId,
      roleId: def.roleId,
      kind: 'ROLE',
      wakePriority: def.wakePriority,
      titleTh: def.displayNameTh,
      scriptTh: def.scriptTh,
      noteTh: def.noteTh,
      actorIds: ids,
      targetRule: targetRule,
      minTargets: min,
      maxTargets: max,
      optional: optional,
      requireAdjacentSecond: false,
      status: 'PENDING',
      result: null
    });
  }

  steps.sort(function (a, b) { return a.wakePriority - b.wakePriority; });
  return steps;
}

function currentStep(state) {
  if (!state.night) return null;
  var s = state.night.steps;
  return state.night.stepIndex < s.length ? s[state.night.stepIndex] : null;
}

function findStep(state, stepId) {
  var s = state.night.steps;
  for (var i = 0; i < s.length; i++) if (s[i].stepId === stepId) return s[i];
  return null;
}

/**
 * Record one night action. Returns { infoTh, detail } which the console shows
 * to the moderator so the answer can be whispered immediately.
 */
function submitRoleAction(state, stepId, targetIds, meta) {
  if (state.status !== STATUS.FIRST_NIGHT && state.status !== STATUS.NIGHT) {
    throw new Error('ตอนนี้ไม่ใช่ช่วงกลางคืน');
  }
  var step = findStep(state, stepId);
  if (!step) throw new Error('ไม่พบขั้นตอน ' + stepId);
  if (step.status === 'DONE') throw new Error('ขั้นตอนนี้บันทึกไปแล้ว');
  targetIds = targetIds || [];
  meta = meta || {};

  var v = validateTargets(state, step, targetIds);
  if (!v.ok) throw new Error(v.reason);

  var actor = step.actorIds.length === 1 ? findPlayer(state, step.actorIds[0]) : null;
  state.night.actions[step.stepId === 'wolves' ? '__wolves__' : step.roleId] = {
    actorId: actor ? actor.playerId : null,
    targets: targetIds.slice(),
    meta: meta
  };

  if (actor) {
    for (var t = 0; t < targetIds.length; t++) uwPush(actor.targetsHistory, targetIds[t]);
    actor.lastTargetId = targetIds.length ? targetIds[0] : null;
  }

  var info = applyImmediateEffect_(state, step, targetIds, meta, actor);
  step.status = 'DONE';
  step.result = info;
  state.night.results.push({ stepId: step.stepId, titleTh: step.titleTh, infoTh: info.infoTh });
  emit(state, 'TARGET_SELECTED', { stepId: step.stepId, targets: targetIds, meta: meta });
  advanceStep(state);
  return info;
}

function skipStep(state, stepId) {
  var step = findStep(state, stepId);
  if (!step) throw new Error('ไม่พบขั้นตอน ' + stepId);
  step.status = 'SKIPPED';
  step.result = { infoTh: 'ข้ามขั้นตอนนี้' };
  emit(state, 'STEP_SKIPPED', { stepId: stepId });
  advanceStep(state);
  return state;
}

function advanceStep(state) {
  var s = state.night.steps;
  while (state.night.stepIndex < s.length && s[state.night.stepIndex].status !== 'PENDING') {
    state.night.stepIndex++;
  }
  return state;
}

/** Immediate, non-combat effects and information answers. */
function applyImmediateEffect_(state, step, targetIds, meta, actor) {
  var t0 = targetIds.length ? findPlayer(state, targetIds[0]) : null;
  var t1 = targetIds.length > 1 ? findPlayer(state, targetIds[1]) : null;

  switch (step.roleId) {
    case 'seer':
    case 'apprentice_seer': {
      /* Apprentice in DOUBLE_CHECK mode reads two players on his first night. */
      if (step.roleId === 'apprentice_seer' && targetIds.length === 2) {
        state.flags.apprenticeUsedDoubleCheck = true;
        var th0 = isThreatToSeer(state, t0);
        var th1 = isThreatToSeer(state, t1);
        return {
          infoTh: t0.name + ' → ' + (th0 ? 'พยักหน้า' : 'ส่ายหน้า') + ' • ' +
                  t1.name + ' → ' + (th1 ? 'พยักหน้า' : 'ส่ายหน้า') +
                  ' (คืนรับช่วงตรวจได้สองคน คืนต่อไปตรวจได้คนเดียว)',
          detail: { targets: [{ targetId: t0.playerId, threat: th0 },
                              { targetId: t1.playerId, threat: th1 }] }
        };
      }
      if (step.roleId === 'apprentice_seer') state.flags.apprenticeUsedDoubleCheck = true;
      var threat = isThreatToSeer(state, t0);
      return {
        infoTh: t0.name + ' → ' + (threat ? 'พยักหน้า (เป็นภัยฝ่ายหมาป่า)' : 'ส่ายหน้า (ไม่เป็นภัย)'),
        detail: { targetId: t0.playerId, threat: threat }
      };
    }
    case 'aura_seer': {
      var def0 = getRole(t0.currentRoleId);
      return {
        infoTh: t0.name + ' → ' + (def0.auraSpecial ? 'พยักหน้า (มีบทบาทพิเศษ)' : 'ส่ายหน้า (ชาวบ้าน/หมาป่าธรรมดา)'),
        detail: { targetId: t0.playerId, special: def0.auraSpecial }
      };
    }
    case 'mystic_seer': {
      return {
        infoTh: t0.name + ' → บทบาทคือ "' + roleDisplay(t0.currentRoleId) + '"',
        detail: { targetId: t0.playerId, roleId: t0.currentRoleId }
      };
    }
    case 'paranormal_investigator': {
      var nb = neighboursForPI(state, t0.playerId);
      var group = [t0];
      if (nb.left) group.push(nb.left);
      if (nb.right && (!nb.left || nb.right.playerId !== nb.left.playerId)) group.push(nb.right);
      var anyThreat = false, names = [];
      for (var i = 0; i < group.length; i++) {
        names.push(group[i].name);
        if (isThreatToSeer(state, group[i])) anyThreat = true;
      }
      if (actor) actor.charges.use = 0;
      return {
        infoTh: 'ตรวจ ' + names.join(', ') + ' → ' + (anyThreat ? 'พยักหน้า (มีภัยอยู่ในกลุ่มนี้)' : 'ส่ายหน้า (ไม่มีภัย)'),
        detail: { group: names, anyThreat: anyThreat }
      };
    }
    case 'sorceress': {
      var isSeer = (t0.currentRoleId === 'seer') ||
        (t0.currentRoleId === 'apprentice_seer' && !anyAliveWithRole(state, 'seer'));
      return {
        infoTh: t0.name + ' → ' + (isSeer ? 'พยักหน้า (คนนี้คือผู้หยั่งรู้)' : 'ส่ายหน้า (ไม่ใช่ผู้หยั่งรู้)'),
        detail: { targetId: t0.playerId, isSeer: isSeer }
      };
    }
    case 'mentalist': {
      var same = t0.currentTeam === t1.currentTeam;
      return {
        infoTh: t0.name + ' และ ' + t1.name + ' → ' + (same ? 'พยักหน้า (ทีมเดียวกัน)' : 'ส่ายหน้า (คนละทีม)'),
        detail: { same: same }
      };
    }
    case 'mason': {
      var ms = playersWithRole(state, 'mason', true);
      var nm = [];
      for (var m = 0; m < ms.length; m++) nm.push(ms[m].name);
      return { infoTh: 'สมาคมลับที่ยังมีชีวิต: ' + (nm.join(', ') || 'ไม่มี'), detail: { masons: nm } };
    }
    case 'minion': {
      var ws = [];
      for (var w = 0; w < state.players.length; w++) {
        var pw = state.players[w];
        if (pw.alive && getRole(pw.currentRoleId).isWolfPack) ws.push(pw.name);
      }
      return { infoTh: 'หมาป่าที่สมุนต้องเห็น: ' + (ws.join(', ') || 'ไม่มี'), detail: { wolves: ws } };
    }
    case 'cupid': {
      addStatus(t0, ST.SOULMATE); addStatus(t1, ST.SOULMATE);
      uwPush(t0.linkedPlayerIds, t1.playerId);
      uwPush(t1.linkedPlayerIds, t0.playerId);
      emit(state, 'SOULMATE_LINKED', { a: t0.playerId, b: t1.playerId });
      timeline(state, 'heart', 'จับคู่แท้เรียบร้อย');
      var byMod = state.ruleVariants.cupidMode === 'MODERATOR_SELECTS';
      return {
        infoTh: 'คู่แท้คือ ' + t0.name + ' และ ' + t1.name +
                (byMod ? ' — ผู้ดำเนินเกมเป็นผู้จับคู่ ปลุกทั้งคู่ให้เห็นหน้ากันโดยไม่ต้องปลุกกามเทพ'
                       : ' — ปลุกทั้งคู่ให้เห็นหน้ากัน'),
        detail: {}
      };
    }
    case 'hoodlum': {
      uwPush(actor.linkedPlayerIds, t0.playerId);
      uwPush(actor.linkedPlayerIds, t1.playerId);
      addStatus(t0, ST.HOODLUM_MARK); addStatus(t1, ST.HOODLUM_MARK);
      return { infoTh: 'เป้าหมายของอันธพาล: ' + t0.name + ' และ ' + t1.name, detail: {} };
    }
    case 'dire_wolf': {
      uwPush(actor.linkedPlayerIds, t0.playerId);
      addStatus(t0, ST.COMPANION);
      return { infoTh: 'คู่หูของหมาป่าไดร์คือ ' + t0.name, detail: {} };
    }
    case 'virginia_woolf': {
      uwPush(actor.linkedPlayerIds, t0.playerId);
      addStatus(t0, ST.FEARED);
      return { infoTh: t0.name + ' หวาดกลัวเวอร์จิเนีย วูล์ฟ', detail: {} };
    }
    case 'doppelganger': {
      uwPush(actor.linkedPlayerIds, t0.playerId);
      addStatus(t0, ST.DOPPEL_TARGET);
      /* BLIND_INHERIT hides the copied role until the target actually dies. */
      if (state.ruleVariants.doppelgangerMode === 'BLIND_INHERIT') {
        return {
          infoTh: 'ต้นแบบคือ ' + t0.name + ' — ห้ามเปิดการ์ดให้ดู จะรู้บทบาทเมื่อต้นแบบเสียชีวิต',
          detail: {}
        };
      }
      return {
        infoTh: 'ต้นแบบคือ ' + t0.name + ' (บทบาท ' + roleDisplay(t0.currentRoleId) +
          ') — เปิดการ์ดให้ดูอย่างลับ จะรับบทเมื่อต้นแบบเสียชีวิต',
        detail: {}
      };
    }
    case 'drunk': {
      var hidden = actor.hiddenRoleId;
      actor.currentRoleId = hidden;
      actor.currentTeam = getRole(hidden).baseTeam;
      actor.charges = getRole(hidden).charges ? uwClone(getRole(hidden).charges) : {};
      actor.drunkRevealed = true;
      emit(state, 'PLAYER_CONVERTED', { playerId: actor.playerId, to: hidden, by: 'DRUNK' });
      timeline(state, 'beer', actor.name + ' สร่างเมาและรู้บทบาทที่แท้จริงแล้ว');
      return { infoTh: actor.name + ' คือ "' + roleDisplay(hidden) + '" — แสดงการ์ดจริงให้ดูอย่างลับ', detail: {} };
    }
    case 'bodyguard':
      return { infoTh: 'คุ้มกัน ' + t0.name + ' ในคืนนี้', detail: {} };
    case 'priest':
      if (actor) {
        /* DEAD_ROLE_CHECK lets the priest keep working every night instead of
           spending his single blessing. */
        if (state.ruleVariants.priestMode === 'DEAD_ROLE_CHECK') {
          return {
            infoTh: t0.name + ' → บทบาทคือ "' + roleDisplay(t0.currentRoleId) + '"',
            detail: { targetId: t0.playerId, roleId: t0.currentRoleId }
          };
        }
        actor.charges.use = 0;
      }
      return { infoTh: 'ประทานพรให้ ' + t0.name, detail: {} };
    case 'witch': {
      var parts = [];
      var usedAny = false;
      if (meta.heal && meta.healTargetId) {
        var hh = findPlayer(state, meta.healTargetId);
        parts.push('ใช้ยาชุบชีวิตกับ ' + (hh ? hh.name : meta.healTargetId));
        usedAny = true;
      }
      if (meta.killTargetId) {
        var kk = findPlayer(state, meta.killTargetId);
        parts.push('ใช้ยาพิษกับ ' + (kk ? kk.name : meta.killTargetId));
        usedAny = true;
      }
      /* ONE_POWER_TOTAL: the first potion used burns the other one too. */
      if (usedAny && actor && state.ruleVariants.witchMode === 'ONE_POWER_TOTAL') {
        actor.charges.heal = 0;
        actor.charges.kill = 0;
        parts.push('(กติกาใช้พลังได้ครั้งเดียวทั้งเกม แม่มดหมดพลังแล้ว)');
      }
      return { infoTh: parts.length ? parts.join(' และ ') : 'แม่มดไม่ใช้ยาในคืนนี้', detail: {} };
    }
    case 'troublemaker':
      return { infoTh: meta.use ? 'พรุ่งนี้จะมีการแขวนคอสองครั้ง' : 'ตัวป่วนยังไม่ใช้พลัง', detail: {} };
    case 'alpha_wolf':
      return { infoTh: meta.convert ? 'จะเปลี่ยนเหยื่อคืนนี้ให้เป็นหมาป่าแทนการฆ่า' : 'อัลฟายังไม่ใช้พลัง', detail: {} };
    case 'huntress':
      return { infoTh: t0 ? 'นักล่าหญิงเล็ง ' + t0.name : 'นักล่าหญิงไม่สังหารในคืนนี้', detail: {} };
    case 'revealer':
      return { infoTh: t0 ? 'ผู้เปิดโปงเลือก ' + t0.name + ' (ผลจะเกิดตอนสรุปคืน)' : 'ผู้เปิดโปงข้ามคืนนี้', detail: {} };
    case 'spellcaster':
      return { infoTh: t0.name + ' จะพูดไม่ได้ในวันพรุ่งนี้', detail: {} };
    case 'old_hag':
      return { infoTh: t0.name + ' จะถูกส่งออกจากหมู่บ้านในวันพรุ่งนี้', detail: {} };
    case 'cult_leader':
      return { infoTh: 'ชักชวน ' + t0.name + ' เข้าลัทธิ — แตะไหล่ให้รู้ตัวว่าเข้าลัทธิแล้ว', detail: {} };
    case 'vampire':
      return { infoTh: t0.name + ' ถูกกัด จะตายเมื่อมีการเสนอชื่อในวันถัดไป', detail: {} };
    case 'ghost':
      return { infoTh: 'วิญญาณจะสิ้นใจเมื่อจบคืนนี้', detail: {} };
    default: {
      var names2 = [];
      for (var z = 0; z < targetIds.length; z++) {
        var pz = findPlayer(state, targetIds[z]);
        if (pz) names2.push(pz.name);
      }
      if (step.stepId === 'wolves') {
        return { infoTh: names2.length ? 'เหยื่อคืนนี้: ' + names2.join(', ') : 'ฝูงหมาป่าไม่ได้เลือกเหยื่อ', detail: {} };
      }
      return { infoTh: names2.length ? 'เลือก ' + names2.join(', ') : 'ไม่มีเป้าหมาย', detail: {} };
    }
  }
}

/** All steps handled → resolve the night. */
function finishNight(state) {
  var pending = 0;
  for (var i = 0; i < state.night.steps.length; i++) {
    if (state.night.steps[i].status === 'PENDING') pending++;
  }
  if (pending > 0) throw new Error('ยังมีขั้นตอนกลางคืนค้างอยู่ ' + pending + ' ขั้น');
  resolveNight(state);
  return afterResolution(state, STATUS.DAWN);
}

/* ================================================================
 * Shared post-resolution routing
 * ================================================================ */

function afterResolution(state, nextStatus) {
  if (state.pendingPrompts.length > 0) {
    state.status = STATUS.DEATH_TRIGGER;
    state.__resumeStatus = nextStatus;
    return state;
  }
  var win = evaluateWin(state);
  if (win) {
    state.winners = win;
    state.status = STATUS.FINISHED;
    emit(state, 'WINNER_DECLARED', win);
    timeline(state, 'trophy', 'จบเกม — ' + win.reasonTh);
    return state;
  }
  var wasDawn = (state.status === STATUS.DAWN);
  state.status = nextStatus;
  if (nextStatus === STATUS.DAWN && !wasDawn) {
    state.dayNumber++;
    timeline(state, 'sun', 'รุ่งเช้าวันที่ ' + state.dayNumber);
    emit(state, 'DAWN_STARTED', { dayNumber: state.dayNumber });
  }
  return state;
}

function resolveDeathPrompt(state, promptId, targetId) {
  resolvePrompt(state, promptId, targetId);
  var resume = state.__resumeStatus || STATUS.DAWN;
  if (state.pendingPrompts.length > 0) return state;
  state.__resumeStatus = null;
  return afterResolution(state, resume);
}

/* ================================================================
 * Day
 * ================================================================ */

function startDiscussion(state) {
  if (state.status !== STATUS.DAWN) throw new Error('ต้องอยู่ในช่วงรุ่งเช้าก่อน');
  state.status = STATUS.DISCUSSION;
  state.day = {
    number: state.dayNumber,
    nominees: [],
    votes: {},
    lynchCount: 0,
    maxLynches: state.flags.doubleLynchNextDay ? 2 : 1,
    resolved: false,
    discussionEndsAt: Date.now() + (state.ruleVariants.discussionSeconds * 1000),
    nominationEndsAt: 0
  };
  state.flags.doubleLynchNextDay = false;
  emit(state, 'DISCUSSION_STARTED', { dayNumber: state.dayNumber, maxLynches: state.day.maxLynches });
  return state;
}

/** Nominations reveal vampire victims (spec 15.2 #21). */
/** DISCUSSION → NOMINATION. Opens the nomination window with its own clock. */
function openNomination(state) {
  if (state.status !== STATUS.DISCUSSION) {
    throw new Error('ต้องอยู่ในช่วงอภิปรายก่อนเปิดการเสนอชื่อ');
  }
  state.status = STATUS.NOMINATION;
  state.day.nominationEndsAt = Date.now() + (state.ruleVariants.nominationSeconds * 1000);
  emit(state, 'NOMINATION_OPENED', { dayNumber: state.dayNumber });
  return state;
}

function startNomination(state, nomineeIds) {
  if (state.status !== STATUS.DISCUSSION && state.status !== STATUS.NOMINATION) {
    throw new Error('ต้องอยู่ในช่วงอภิปรายก่อนเสนอชื่อ');
  }
  if (state.pendingVampireVictims.length) {
    for (var i = 0; i < state.pendingVampireVictims.length; i++) {
      var vp = findPlayer(state, state.pendingVampireVictims[i]);
      if (vp && vp.alive) {
        removeStatus(vp, ST.VAMPIRE_BITTEN);
        attemptKillIgnoringProtection_(state, vp.playerId, CAUSE.VAMPIRE_BITE, null, 'vampire');
      }
    }
    state.pendingVampireVictims = [];
    processDeathQueue(state);
    if (state.pendingPrompts.length > 0) {
      state.status = STATUS.DEATH_TRIGGER;
      state.__resumeStatus = STATUS.NOMINATION;
      state.__pendingNominees = nomineeIds;
      return state;
    }
    var w = evaluateWin(state);
    if (w) {
      state.winners = w; state.status = STATUS.FINISHED;
      emit(state, 'WINNER_DECLARED', w);
      return state;
    }
  }

  var list = [];
  for (var j = 0; j < (nomineeIds || []).length; j++) {
    var p = findPlayer(state, nomineeIds[j]);
    if (p && p.alive && !hasStatus(p, ST.EXILED)) uwPush(list, p.playerId);
  }
  if (!list.length) throw new Error('ต้องเสนอชื่อผู้เล่นอย่างน้อยหนึ่งคนที่ยังมีชีวิตและไม่ถูกส่งออก');
  state.day.nominees = list;
  state.day.votes = {};
  state.status = STATUS.VOTING;
  emit(state, 'NOMINATION_CLOSED', { nominees: list });
  return state;
}

function eligibleVoters(state) {
  var out = [];
  var alive = alivePlayers(state);
  for (var i = 0; i < alive.length; i++) {
    var p = alive[i];
    if (hasStatus(p, ST.EXILED)) continue;
    if (hasStatus(p, ST.CANNOT_VOTE)) continue;
    out.push(p);
  }
  return out;
}

function voteWeight(state, p) {
  if (p.currentRoleId === 'mayor' && state.ruleVariants.mayorMode !== 'DISABLED') return 2;
  if (p.electedMayor && state.ruleVariants.mayorMode === 'ELECTED') return 2;
  return 1;
}

function submitVote(state, voterId, choice) {
  if (state.status !== STATUS.VOTING) throw new Error('ตอนนี้ไม่ใช่ช่วงลงคะแนน');
  if (choice !== 'SPARE' && !uwContains(state.day.nominees, choice)) {
    throw new Error('ต้องโหวตให้ผู้ถูกเสนอชื่อ หรือเลือก "ไว้ชีวิต"');
  }
  var v = validateVote(state, voterId, choice);
  if (!v.ok) throw new Error(v.reason);
  state.day.votes[voterId] = choice;
  emit(state, 'VOTE_RECORDED', { voterId: voterId, choice: choice });
  return state;
}

function tallyVotes(state) {
  var tally = {}, spare = 0, detail = [];
  for (var i = 0; i < state.day.nominees.length; i++) tally[state.day.nominees[i]] = 0;
  for (var voterId in state.day.votes) {
    if (!state.day.votes.hasOwnProperty(voterId)) continue;
    var p = findPlayer(state, voterId);
    if (!p || !p.alive) continue;
    var w = voteWeight(state, p);
    var c = state.day.votes[voterId];
    if (c === 'SPARE') spare += w; else tally[c] = (tally[c] || 0) + w;
    detail.push({ voterId: voterId, name: p.name, choice: c, weight: w });
  }
  var top = [], best = -1;
  for (var nid in tally) {
    if (!tally.hasOwnProperty(nid)) continue;
    if (tally[nid] > best) { best = tally[nid]; top = [nid]; }
    else if (tally[nid] === best) top.push(nid);
  }
  return { tally: tally, spare: spare, top: top, best: best, detail: detail };
}

/**
 * Resolve the vote. moderatorChoice is only used when tieVoteRule = MODERATOR_DECIDES.
 */
function resolveVote(state, moderatorChoice) {
  if (state.status !== STATUS.VOTING) throw new Error('ตอนนี้ไม่ใช่ช่วงลงคะแนน');
  var r = tallyVotes(state);
  state.status = STATUS.RESOLVE_DAY;

  var victims = [];
  if (r.best <= 0 || r.spare >= r.best) {
    timeline(state, 'peace', 'วันนี้หมู่บ้านไม่แขวนคอใคร');
    emit(state, 'LYNCH_RESOLVED', { result: 'NO_LYNCH', tally: r.tally, spare: r.spare });
  } else if (r.top.length > 1) {
    switch (state.ruleVariants.tieVoteRule) {
      case 'ALL_TIED_DIE': victims = r.top.slice(); break;
      case 'MODERATOR_DECIDES':
        if (!moderatorChoice) { state.status = STATUS.VOTING; throw new Error('คะแนนเสมอ ผู้ดำเนินเกมต้องเลือกผู้ถูกกำจัด'); }
        victims = [moderatorChoice];
        break;
      case 'REVOTE':
        state.day.votes = {};
        state.status = STATUS.VOTING;
        state.day.nominees = r.top.slice();
        timeline(state, 'repeat', 'คะแนนเสมอ ลงคะแนนใหม่เฉพาะผู้ที่เสมอกัน');
        emit(state, 'REVOTE_REQUIRED', { nominees: r.top });
        return state;
      default:
        timeline(state, 'peace', 'คะแนนเสมอ วันนี้ไม่แขวนคอใคร');
        emit(state, 'LYNCH_RESOLVED', { result: 'TIE_NO_LYNCH', tally: r.tally });
    }
  } else {
    victims = [r.top[0]];
  }

  var dayEndedEarly = false;
  for (var i = 0; i < victims.length; i++) {
    var target = mustPlayer(state, victims[i]);

    /* Prince survives the first lynch and the day ends immediately. */
    if (target.currentRoleId === 'prince' && !hasStatus(target, ST.PRINCE_SAVED)) {
      addStatus(target, ST.PRINCE_SAVED);
      target.revealed = true;
      timeline(state, 'crown', target.name + ' เปิดเผยตัวเป็นเจ้าชายและรอดจากการแขวนคอ');
      emit(state, 'LYNCH_RESOLVED', { result: 'PRINCE_SAVED', playerId: target.playerId });
      dayEndedEarly = true;
      continue;
    }

    /* Village Idiot may survive the lynch but loses the right to vote. */
    if (target.currentRoleId === 'village_idiot' &&
        state.ruleVariants.villageIdiotMode === 'SURVIVES_LYNCH' &&
        !hasStatus(target, ST.IDIOT_REVEALED)) {
      addStatus(target, ST.IDIOT_REVEALED);
      addStatus(target, ST.CANNOT_VOTE);
      target.revealed = true;
      timeline(state, 'jester', target.name + ' คือคนโง่ประจำหมู่บ้าน รอดชีวิตแต่โหวตไม่ได้อีกต่อไป');
      emit(state, 'LYNCH_RESOLVED', { result: 'IDIOT_REVEALED', playerId: target.playerId });
      dayEndedEarly = true;
      continue;
    }

    timeline(state, 'rope', target.name + ' ถูกหมู่บ้านแขวนคอ');
    emit(state, 'LYNCH_RESOLVED', { result: 'LYNCHED', playerId: target.playerId, tally: r.tally });
    attemptKill(state, target.playerId, CAUSE.LYNCH, null, null);
  }

  processDeathQueue(state);
  state.day.lynchCount++;

  var next = (!dayEndedEarly && state.day.lynchCount < state.day.maxLynches)
    ? STATUS.NOMINATION : STATUS.NIGHT;
  var st = afterResolution(state, next);
  if (st.status === STATUS.NIGHT) endDayAndStartNight(state);
  return state;
}

function endDayAndStartNight(state) {
  /* clear day-scoped statuses */
  for (var i = 0; i < state.players.length; i++) {
    removeStatus(state.players[i], ST.MUTED);
    removeStatus(state.players[i], ST.EXILED);
  }
  if (state.day) state.day.resolved = true;
  emit(state, 'DAY_ENDED', { dayNumber: state.dayNumber });
  startNight(state);
  return state;
}

/** Straight to night without a lynch (moderator override). */
function forceEndDay(state) {
  if (state.status === STATUS.FINISHED) throw new Error('เกมจบแล้ว');
  var win = evaluateWin(state);
  if (win) {
    state.winners = win; state.status = STATUS.FINISHED;
    emit(state, 'WINNER_DECLARED', win);
    return state;
  }
  return endDayAndStartNight(state);
}

function moderatorKill(state, playerId, reason) {
  var p = mustPlayer(state, playerId);
  if (!p.alive) throw new Error(p.name + ' เสียชีวิตแล้ว');
  timeline(state, 'alert', 'ผู้ดำเนินเกมกำหนดให้ ' + p.name + ' เสียชีวิต' + (reason ? ' — ' + reason : ''));
  attemptKillIgnoringProtection_(state, playerId, CAUSE.MODERATOR, null, null);
  processDeathQueue(state);
  return afterResolution(state, state.status);
}

function pauseGame(state) {
  if (state.status === STATUS.FINISHED) throw new Error('เกมจบแล้ว');
  state.__pausedFrom = state.status;
  state.status = STATUS.PAUSED;
  emit(state, 'GAME_PAUSED', {});
  return state;
}

function resumeGame(state) {
  if (state.status !== STATUS.PAUSED) throw new Error('เกมไม่ได้หยุดพักอยู่');
  state.status = state.__pausedFrom || STATUS.DISCUSSION;
  state.__pausedFrom = null;
  emit(state, 'GAME_RESUMED', {});
  return state;
}

function endGame(state, reason) {
  var win = evaluateWin(state) || {
    primaryWinningTeams: [],
    individualWinners: individualWinners_(state),
    reasonTh: reason || 'ผู้ดำเนินเกมยุติเกม'
  };
  state.winners = win;
  state.status = STATUS.FINISHED;
  emit(state, 'WINNER_DECLARED', win);
  timeline(state, 'trophy', 'จบเกม — ' + win.reasonTh);
  return state;
}
