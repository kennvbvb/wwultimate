/**
 * EffectResolver.gs
 * Attack / protection / conversion resolution and the cascading death queue (spec 7.1).
 * Everything here is pure: it mutates the passed-in state object and appends events,
 * but never touches Google services.
 */

function emit(state, type, payload) {
  if (!state.__events) state.__events = [];
  state.__events.push({
    seq: state.__events.length + 1,
    type: type,
    at: uwNow(),
    dayNumber: state.dayNumber,
    nightNumber: state.nightNumber,
    payload: payload || {}
  });
}

function timeline(state, icon, text) {
  state.timeline.push({
    at: uwNow(),
    phase: state.status,
    dayNumber: state.dayNumber,
    nightNumber: state.nightNumber,
    icon: icon,
    text: text
  });
}

/* ================================================================
 * Kill attempts
 * ================================================================ */

/**
 * Try to kill a player. Handles immunity, protection, conversion and delayed death.
 * Returns { killed, blocked, reasonTh }.
 */
function attemptKill(state, targetId, cause, sourceId, sourceRoleId) {
  var t = findPlayer(state, targetId);
  if (!t) return { killed: false, blocked: true, reasonTh: 'ไม่พบผู้เล่น' };
  if (!t.alive) return { killed: false, blocked: true, reasonTh: t.name + ' เสียชีวิตอยู่แล้ว' };

  var isWolfAttack = (cause === CAUSE.WOLF_ATTACK);

  /* 1. Vampires cannot be killed by the wolf pack. */
  if (isWolfAttack && t.currentTeam === TEAM.VAMPIRE) {
    emit(state, 'ATTACK_BLOCKED', { targetId: targetId, cause: cause, by: 'VAMPIRE_IMMUNITY' });
    timeline(state, 'shield', t.name + ' เป็นแวมไพร์ หมาป่าทำอะไรไม่ได้');
    return { killed: false, blocked: true, reasonTh: 'แวมไพร์ไม่ถูกหมาป่าฆ่า' };
  }

  /* 2. Bodyguard protection — only stops the night attack it was aimed at. */
  if (state.night && uwContains(state.night.protectedIds || [], targetId) &&
      cause !== CAUSE.LYNCH && cause !== CAUSE.HUNTER_SHOT) {
    emit(state, 'ATTACK_BLOCKED', { targetId: targetId, cause: cause, by: 'BODYGUARD' });
    timeline(state, 'shield', t.name + ' ได้รับการคุ้มกันไว้ทัน');
    return { killed: false, blocked: true, reasonTh: 'ผู้คุ้มกันป้องกันไว้' };
  }

  /* 3. Cursed converts instead of dying, only against a wolf attack. */
  if (isWolfAttack && t.baseRoleId === 'cursed' && t.currentTeam !== TEAM.WEREWOLF) {
    t.currentRoleId = 'werewolf';
    t.currentTeam = TEAM.WEREWOLF;
    emit(state, 'PLAYER_CONVERTED', { playerId: targetId, to: 'werewolf', by: 'CURSED' });
    timeline(state, 'wolf', t.name + ' ผู้ถูกสาปกลายเป็นหมาป่า');
    return { killed: false, blocked: true, reasonTh: 'ผู้ถูกสาปเปลี่ยนฝ่ายแทนการตาย' };
  }

  /* 4. Tough Guy survives the night and dies at the next one. */
  if (isWolfAttack && t.currentRoleId === 'tough_guy' && !hasStatus(t, ST.DELAYED_DEATH)) {
    addStatus(t, ST.DELAYED_DEATH);
    t.delayedDeathNight = state.nightNumber + 1;
    emit(state, 'DELAYED_DEATH_SCHEDULED', { playerId: targetId, dueNight: t.delayedDeathNight });
    timeline(state, 'clock', t.name + ' คนแกร่งบาดเจ็บสาหัส จะเสียชีวิตในคืนถัดไป');
    return { killed: false, blocked: true, reasonTh: 'คนแกร่งยังไม่ตายทันที' };
  }

  /* 5. Priest blessing absorbs one kill attempt. */
  if (hasStatus(t, ST.BLESSED)) {
    removeStatus(t, ST.BLESSED);
    emit(state, 'ATTACK_BLOCKED', { targetId: targetId, cause: cause, by: 'BLESSING' });
    timeline(state, 'shield', t.name + ' รอดมาได้ด้วยพรของนักบวช');
    return { killed: false, blocked: true, reasonTh: 'พรของนักบวชคุ้มครองไว้' };
  }

  enqueueDeath(state, {
    playerId: targetId,
    cause: cause,
    sourcePlayerId: sourceId || null,
    sourceRoleId: sourceRoleId || null,
    phase: state.status,
    nightNumber: state.nightNumber,
    dayNumber: state.dayNumber,
    preventable: cause !== CAUSE.LYNCH
  });
  return { killed: true, blocked: false, reasonTh: '' };
}

function enqueueDeath(state, entry) {
  state.deathQueue.push(entry);
  emit(state, 'DEATH_TRIGGER_QUEUED', entry);
}

/* ================================================================
 * Death queue processing (spec 7.1)
 * ================================================================ */

function processDeathQueue(state) {
  var guard = 0;
  var died = [];

  while (state.deathQueue.length > 0) {
    if (++guard > MAX_DEATH_QUEUE_ITERATIONS) {
      throw new Error('Death queue เกินขีดจำกัด อาจมีลูปไม่สิ้นสุดจากบทบาทที่เชื่อมกัน');
    }
    var entry = state.deathQueue.shift();
    var p = findPlayer(state, entry.playerId);
    if (!p || !p.alive) continue;

    p.alive = false;
    p.deathInfo = {
      cause: entry.cause,
      causeTh: CAUSE_TH[entry.cause] || entry.cause,
      sourcePlayerId: entry.sourcePlayerId || null,
      sourceRoleId: entry.sourceRoleId || null,
      phase: entry.phase,
      nightNumber: entry.nightNumber,
      dayNumber: entry.dayNumber,
      at: uwNow()
    };
    removeStatus(p, ST.DELAYED_DEATH);
    died.push(p.playerId);
    emit(state, 'PLAYER_DIED', { playerId: p.playerId, cause: entry.cause });
    timeline(state, 'skull', p.name + ' เสียชีวิต (' + (CAUSE_TH[entry.cause] || entry.cause) + ')');

    runDeathTriggers_(state, p, entry);
  }
  return died;
}

function runDeathTriggers_(state, dead, entry) {
  /* --- 1. immediate personal triggers --- */
  if (dead.currentRoleId === 'hunter') {
    state.pendingPrompts.push({
      promptId: 'PR-' + uwRandomId(5),
      type: 'HUNTER_SHOOT',
      playerId: dead.playerId,
      playerName: dead.name,
      titleTh: 'นายพราน ' + dead.name + ' ต้องยิงทันที',
      hintTh: 'ห้ามให้ผู้เล่นอภิปรายก่อนชี้เป้า เลือกผู้เล่นหนึ่งคน หรือกด "ยิงขึ้นฟ้า"'
    });
    timeline(state, 'target', 'นายพราน ' + dead.name + ' ต้องเลือกเป้าหมายทันที');
  }

  if (dead.currentRoleId === 'mad_bomber') {
    var nb = livingNeighbours(state, dead.playerId);
    if (nb.left) attemptKill(state, nb.left.playerId, CAUSE.MAD_BOMBER, dead.playerId, 'mad_bomber');
    if (nb.right && (!nb.left || nb.right.playerId !== nb.left.playerId)) {
      attemptKill(state, nb.right.playerId, CAUSE.MAD_BOMBER, dead.playerId, 'mad_bomber');
    }
    timeline(state, 'bomb', 'ระเบิดของ ' + dead.name + ' ทำงาน เพื่อนบ้านสองข้างได้รับผลกระทบ');
  }

  if (dead.currentRoleId === 'ghost') {
    timeline(state, 'ghost', dead.name + ' กลายเป็นวิญญาณ ส่งคำใบ้ได้วันละหนึ่งตัวอักษร');
    state.ghostPlayerId = dead.playerId;
  }

  if (dead.currentRoleId === 'tanner' || dead.baseRoleId === 'tanner') {
    emit(state, 'TANNER_SATISFIED', { playerId: dead.playerId, cause: entry.cause });
    timeline(state, 'trophy', dead.name + ' คนบ้าได้สิ่งที่ต้องการแล้ว');
  }

  /* --- 2. relationship triggers --- */
  for (var i = 0; i < state.players.length; i++) {
    var q = state.players[i];
    if (!q.alive) continue;

    /* Soulmates die together (Cupid). */
    if (hasStatus(q, ST.SOULMATE) && uwContains(q.linkedPlayerIds, dead.playerId) &&
        hasStatus(dead, ST.SOULMATE)) {
      attemptKillIgnoringProtection_(state, q.playerId, CAUSE.SOULMATE_GRIEF, dead.playerId, 'cupid');
    }

    /* Dire Wolf follows its Companion, never the other way round. */
    if (q.currentRoleId === 'dire_wolf' && uwContains(q.linkedPlayerIds, dead.playerId)) {
      attemptKillIgnoringProtection_(state, q.playerId, CAUSE.DIRE_WOLF_GRIEF, dead.playerId, 'dire_wolf');
    }

    /* Doppelgänger inherits when its model dies. */
    if (q.currentRoleId === 'doppelganger' && uwContains(q.linkedPlayerIds, dead.playerId)) {
      q.currentRoleId = dead.currentRoleId;
      q.currentTeam = dead.currentTeam;
      if (isCultMember(dead)) addStatus(q, ST.CULT_MEMBER);
      emit(state, 'PLAYER_CONVERTED', { playerId: q.playerId, to: q.currentRoleId, by: 'DOPPELGANGER' });
      timeline(state, 'mask', q.name + ' รับบทบาทของ ' + dead.name + ' แล้ว (แจ้งอย่างลับในคืนถัดไป)');
    }
  }

  /* Virginia Woolf: whoever feared her dies with her. */
  if (dead.currentRoleId === 'virginia_woolf' && dead.linkedPlayerIds.length) {
    for (var v = 0; v < dead.linkedPlayerIds.length; v++) {
      attemptKillIgnoringProtection_(state, dead.linkedPlayerIds[v], CAUSE.VIRGINIA_FEAR,
        dead.playerId, 'virginia_woolf');
    }
  }

  /* --- 3. team / global triggers --- */
  if (dead.currentRoleId === 'wolf_cub') {
    state.flags.wolfExtraKills = 1;
    emit(state, 'WOLF_CUB_AVENGED', {});
    timeline(state, 'wolf', 'ลูกหมาป่าตาย ฝูงหมาป่าจะฆ่าได้สองเป้าหมายในคืนถัดไป');
  }

  if (dead.currentRoleId === 'diseased' && entry.cause === CAUSE.WOLF_ATTACK) {
    state.flags.wolvesSkipNextNight = true;
    emit(state, 'WOLVES_DISEASED', {});
    timeline(state, 'virus', 'ฝูงหมาป่ากินผู้ติดโรค คืนถัดไปจะฆ่าใครไม่ได้');
  }

  if (dead.currentRoleId === 'seer' && anyAliveWithRole(state, 'apprentice_seer')) {
    emit(state, 'APPRENTICE_PROMOTED', {});
    timeline(state, 'eye', 'ผู้หยั่งรู้เสียชีวิต ผู้หยั่งรู้ฝึกหัดจะรับช่วงในคืนถัดไป');
  }

  if (dead.currentTeam === TEAM.WEREWOLF && entry.cause === CAUSE.LYNCH) {
    state.flags.aWolfDiedByDay = true;
  }

  /* Cult leader dies: the cult can no longer recruit, existing members stay. */
  if (dead.currentRoleId === 'cult_leader') {
    state.flags.cultLeaderDead = true;
    timeline(state, 'users', 'ผู้นำลัทธิเสียชีวิต ลัทธิจะไม่มีสมาชิกใหม่อีก');
  }
}

/** Grief style deaths bypass bodyguard/blessing — they are not attacks. */
function attemptKillIgnoringProtection_(state, targetId, cause, sourceId, sourceRoleId) {
  var t = findPlayer(state, targetId);
  if (!t || !t.alive) return;
  enqueueDeath(state, {
    playerId: targetId, cause: cause,
    sourcePlayerId: sourceId, sourceRoleId: sourceRoleId,
    phase: state.status, nightNumber: state.nightNumber, dayNumber: state.dayNumber,
    preventable: false
  });
}

/* ================================================================
 * Night resolution
 * ================================================================ */

function resolveNight(state) {
  var n = state.night;
  if (n.resolved) return;
  n.resolved = true;
  state.status = STATUS.RESOLVE_NIGHT;
  emit(state, 'NIGHT_RESOLVE_STARTED', { nightNumber: state.nightNumber });

  var a = n.actions;

  /* --- 1. protections --- */
  n.protectedIds = [];
  if (a['bodyguard'] && a['bodyguard'].targets.length) {
    n.protectedIds.push(a['bodyguard'].targets[0]);
    emit(state, 'PLAYER_PROTECTED', { playerId: a['bodyguard'].targets[0] });
  }
  if (a['priest'] && a['priest'].targets.length &&
      state.ruleVariants.priestMode !== 'DEAD_ROLE_CHECK') {
    var bp = findPlayer(state, a['priest'].targets[0]);
    if (bp) {
      addStatus(bp, ST.BLESSED);
      emit(state, 'PLAYER_BLESSED', { playerId: bp.playerId });
    }
  }

  /* --- 2. wolf pack victims (with Alpha Wolf conversion option) --- */
  var wolfTargets = (a['__wolves__'] && a['__wolves__'].targets) ? a['__wolves__'].targets.slice() : [];

  var alphaUse = a['alpha_wolf'] && a['alpha_wolf'].meta && a['alpha_wolf'].meta.convert === true;
  if (alphaUse && wolfTargets.length) {
    var convId = wolfTargets.shift();
    var conv = findPlayer(state, convId);
    var alpha = playersWithRole(state, 'alpha_wolf', true)[0];
    if (conv && conv.alive) {
      if (uwContains(n.protectedIds, convId) || hasStatus(conv, ST.BLESSED)) {
        if (hasStatus(conv, ST.BLESSED)) removeStatus(conv, ST.BLESSED);
        timeline(state, 'shield', conv.name + ' รอดจากพลังหมาป่าอัลฟา');
        emit(state, 'ATTACK_BLOCKED', { targetId: convId, by: 'PROTECTION', cause: 'ALPHA_CONVERT' });
      } else {
        conv.currentRoleId = 'werewolf';
        conv.currentTeam = TEAM.WEREWOLF;
        emit(state, 'PLAYER_CONVERTED', { playerId: convId, to: 'werewolf', by: 'ALPHA_WOLF' });
        timeline(state, 'wolf', conv.name + ' ถูกหมาป่าอัลฟาเปลี่ยนเป็นหมาป่า');
      }
      if (alpha) alpha.charges.use = 0;
    }
  }

  /* --- 3. Witch --- */
  var witchAct = a['witch'];
  if (witchAct && witchAct.meta && witchAct.meta.heal && witchAct.meta.healTargetId) {
    var hid = witchAct.meta.healTargetId;
    for (var w = wolfTargets.length - 1; w >= 0; w--) {
      if (wolfTargets[w] === hid) wolfTargets.splice(w, 1);
    }
    var wp = playersWithRole(state, 'witch', true)[0];
    if (wp) wp.charges.heal = 0;
    var hp = findPlayer(state, hid);
    timeline(state, 'potion', 'แม่มดใช้ยาชุบชีวิตกับ ' + (hp ? hp.name : hid));
    emit(state, 'ATTACK_BLOCKED', { targetId: hid, by: 'WITCH_HEAL', cause: CAUSE.WOLF_ATTACK });
  }

  /* --- 4. apply wolf kills --- */
  for (var i = 0; i < wolfTargets.length; i++) {
    attemptKill(state, wolfTargets[i], CAUSE.WOLF_ATTACK, null, 'werewolf');
  }

  /* --- 5. witch poison --- */
  if (witchAct && witchAct.meta && witchAct.meta.killTargetId) {
    var wp2 = playersWithRole(state, 'witch', true)[0];
    if (wp2) wp2.charges.kill = 0;
    attemptKill(state, witchAct.meta.killTargetId, CAUSE.WITCH_KILL,
      wp2 ? wp2.playerId : null, 'witch');
  }

  /* --- 6. Huntress --- */
  if (a['huntress'] && a['huntress'].targets.length) {
    var hu = playersWithRole(state, 'huntress', true)[0];
    if (hu) hu.charges.kill = 0;
    attemptKill(state, a['huntress'].targets[0], CAUSE.HUNTRESS_KILL,
      hu ? hu.playerId : null, 'huntress');
  }

  /* --- 7. Revealer --- */
  if (a['revealer'] && a['revealer'].targets.length) {
    var rv = playersWithRole(state, 'revealer', true)[0];
    var rt = findPlayer(state, a['revealer'].targets[0]);
    if (rt && rv) {
      if (rt.currentTeam === TEAM.WEREWOLF) {
        attemptKill(state, rt.playerId, CAUSE.REVEALER_KILL, rv.playerId, 'revealer');
        timeline(state, 'flashlight', 'ผู้เปิดโปงเปิดโปงหมาป่าได้สำเร็จ');
      } else {
        attemptKill(state, rv.playerId, CAUSE.REVEALER_BACKFIRE, rt.playerId, 'revealer');
        timeline(state, 'flashlight', 'ผู้เปิดโปงเลือกผิดคนและต้องรับผลกรรม');
      }
    }
  }

  /* --- 8. Vampire bite: victim dies at the next nomination (spec 3.1) --- */
  if (a['vampire'] && a['vampire'].targets.length) {
    var vt = findPlayer(state, a['vampire'].targets[0]);
    if (vt && vt.alive) {
      addStatus(vt, ST.VAMPIRE_BITTEN);
      uwPush(state.pendingVampireVictims, vt.playerId);
      emit(state, 'VAMPIRE_BITE', { playerId: vt.playerId });
    }
  }

  /* --- 9. control effects --- */
  if (a['spellcaster'] && a['spellcaster'].targets.length) {
    var sp = findPlayer(state, a['spellcaster'].targets[0]);
    if (sp) {
      addStatus(sp, ST.MUTED);
      emit(state, 'PLAYER_MUTED', { playerId: sp.playerId });
    }
  }
  if (a['old_hag'] && a['old_hag'].targets.length) {
    var oh = findPlayer(state, a['old_hag'].targets[0]);
    if (oh) {
      addStatus(oh, ST.EXILED);
      emit(state, 'PLAYER_EXILED', { playerId: oh.playerId });
    }
  }
  if (a['cult_leader'] && a['cult_leader'].targets.length) {
    var cm = findPlayer(state, a['cult_leader'].targets[0]);
    if (cm && !isCultMember(cm)) {
      addStatus(cm, ST.CULT_MEMBER);
      emit(state, 'CULT_MEMBER_ADDED', { playerId: cm.playerId });
    }
  }
  if (a['troublemaker'] && a['troublemaker'].meta && a['troublemaker'].meta.use) {
    state.flags.doubleLynchNextDay = true;
    var tm = playersWithRole(state, 'troublemaker', true)[0];
    if (tm) tm.charges.use = 0;
    emit(state, 'TROUBLEMAKER_USED', {});
    timeline(state, 'flame', 'ตัวป่วนจุดชนวน พรุ่งนี้จะมีการแขวนคอสองครั้ง');
  }

  /* --- 10. Ghost dies on the first night --- */
  if (state.nightNumber === 1) {
    var ghosts = playersWithRole(state, 'ghost', true);
    for (var g = 0; g < ghosts.length; g++) {
      enqueueDeath(state, {
        playerId: ghosts[g].playerId, cause: CAUSE.GHOST_SACRIFICE,
        sourcePlayerId: null, sourceRoleId: 'ghost', phase: state.status,
        nightNumber: state.nightNumber, dayNumber: state.dayNumber, preventable: false
      });
    }
  }

  /* --- 11. delayed deaths due tonight (Tough Guy) --- */
  for (var d = 0; d < state.players.length; d++) {
    var dp = state.players[d];
    if (dp.alive && hasStatus(dp, ST.DELAYED_DEATH) && dp.delayedDeathNight <= state.nightNumber) {
      enqueueDeath(state, {
        playerId: dp.playerId, cause: CAUSE.TOUGH_GUY_DELAYED,
        sourcePlayerId: null, sourceRoleId: 'tough_guy', phase: state.status,
        nightNumber: state.nightNumber, dayNumber: state.dayNumber, preventable: false
      });
    }
  }

  var died = processDeathQueue(state);
  n.deaths = died;
  emit(state, 'NIGHT_RESOLVED', { deaths: died });
}

/* ================================================================
 * Prompt resolution (Hunter)
 * ================================================================ */

function resolvePrompt(state, promptId, targetId) {
  var idx = -1;
  for (var i = 0; i < state.pendingPrompts.length; i++) {
    if (state.pendingPrompts[i].promptId === promptId) idx = i;
  }
  if (idx < 0) throw new Error('ไม่พบคำสั่งที่ค้างอยู่');
  var prompt = state.pendingPrompts.splice(idx, 1)[0];

  if (prompt.type === 'HUNTER_SHOOT') {
    if (targetId && targetId !== 'SKY') {
      var t = mustPlayer(state, targetId);
      if (!t.alive) throw new Error(t.name + ' เสียชีวิตแล้ว');
      timeline(state, 'target', 'นายพราน ' + prompt.playerName + ' ยิง ' + t.name);
      attemptKillIgnoringProtection_(state, targetId, CAUSE.HUNTER_SHOT, prompt.playerId, 'hunter');
    } else {
      timeline(state, 'target', 'นายพราน ' + prompt.playerName + ' ยิงขึ้นฟ้า');
    }
  }
  processDeathQueue(state);
}
