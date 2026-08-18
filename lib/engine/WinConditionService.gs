/**
 * WinConditionService.gs
 * Win predicates are data-driven and completely independent of the UI (spec 8, 16).
 * Result shape: { primaryWinningTeams: [], individualWinners: [], reasonTh: '' } or null.
 */

function countsForWin_(state) {
  var alive = alivePlayers(state);
  var c = {
    alive: alive, total: alive.length,
    wolves: [], vampires: [], cult: [], others: [], loneWolves: []
  };
  for (var i = 0; i < alive.length; i++) {
    var p = alive[i];
    if (p.currentTeam === TEAM.WEREWOLF) {
      c.wolves.push(p);
      if (p.currentRoleId === 'lone_wolf') c.loneWolves.push(p);
    } else if (p.currentTeam === TEAM.VAMPIRE) {
      c.vampires.push(p);
    } else {
      c.others.push(p);
    }
    if (isCultMember(p)) c.cult.push(p);
  }
  return c;
}

/** Tanner players whose win condition is already satisfied. */
function tannerWinners_(state) {
  var out = [];
  var rv = state.ruleVariants;
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    if (p.baseRoleId !== 'tanner' && p.currentRoleId !== 'tanner') continue;
    if (p.alive) continue;
    var byLynch = !!(p.deathInfo && p.deathInfo.cause === CAUSE.LYNCH);
    if (rv.tannerMode === 'LYNCH_ONLY' && !byLynch) continue;
    out.push(p);
  }
  return out;
}

/** Individual winners that are decided by facts, not by who is standing. */
function individualWinners_(state) {
  var out = [];
  var rv = state.ruleVariants;

  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];

    /* Tanner: wins personally by dying (spec 8). */
    if (p.baseRoleId === 'tanner' || p.currentRoleId === 'tanner') {
      if (!p.alive) {
        var byLynch = !!(p.deathInfo && p.deathInfo.cause === CAUSE.LYNCH);
        if (rv.tannerMode === 'LYNCH_ONLY' ? byLynch : true) {
          out.push({ playerId: p.playerId, name: p.name, roleId: 'tanner',
                     reasonTh: byLynch ? 'คนบ้าถูกโหวตแขวนคอตามที่ต้องการ'
                                       : 'คนบ้าเสียชีวิตตามที่ต้องการ' });
        }
      }
    }

    /* Hoodlum: alive at game end and both marks dead. */
    if (p.alive && p.currentRoleId === 'hoodlum' && p.linkedPlayerIds.length === 2) {
      var a = findPlayer(state, p.linkedPlayerIds[0]);
      var b = findPlayer(state, p.linkedPlayerIds[1]);
      if (a && b && !a.alive && !b.alive) {
        out.push({ playerId: p.playerId, name: p.name, roleId: 'hoodlum',
                   reasonTh: 'เป้าหมายทั้งสองของอันธพาลเสียชีวิตครบ' });
      }
    }
  }
  return out;
}

/**
 * Main evaluation. Call ONLY after the death queue is empty (spec 7.1 step 8).
 */
function evaluateWin(state) {
  if (state.status === STATUS.SETUP || state.status === STATUS.ROLE_ASSIGNMENT) return null;
  var c = countsForWin_(state);
  var rv = state.ruleVariants;

  /* Everyone dead — nobody standing. Independents may still have won. */
  if (c.total === 0) {
    return {
      primaryWinningTeams: [],
      individualWinners: individualWinners_(state),
      reasonTh: 'ผู้เล่นเสียชีวิตทั้งหมด ไม่มีทีมใดชนะ'
    };
  }

  /* Tanner ends the game the moment he gets what he wants (rule variant). */
  if (rv.tannerEndsGame) {
    var tw = tannerWinners_(state);
    if (tw.length) {
      return {
        primaryWinningTeams: ['TANNER'],
        individualWinners: individualWinners_(state),
        reasonTh: rv.tannerMode === 'LYNCH_ONLY'
          ? 'คนบ้าถูกโหวตแขวนคอสำเร็จ เกมจบทันที'
          : 'คนบ้าเสียชีวิตสำเร็จ เกมจบทันที'
      };
    }
  }

  /* Cross-team Soulmates: the last two standing are a soulmate pair from different base teams. */
  if (c.total === 2) {
    var p1 = c.alive[0], p2 = c.alive[1];
    if (hasStatus(p1, ST.SOULMATE) && hasStatus(p2, ST.SOULMATE) &&
        uwContains(p1.linkedPlayerIds, p2.playerId)) {
      if (p1.currentTeam !== p2.currentTeam) {
        return {
          primaryWinningTeams: ['SOULMATES'],
          individualWinners: individualWinners_(state).concat([
            { playerId: p1.playerId, name: p1.name, roleId: p1.currentRoleId, reasonTh: 'คู่แท้ข้ามฝ่ายรอดเป็นสองคนสุดท้าย' },
            { playerId: p2.playerId, name: p2.name, roleId: p2.currentRoleId, reasonTh: 'คู่แท้ข้ามฝ่ายรอดเป็นสองคนสุดท้าย' }
          ]),
          reasonTh: 'คู่แท้ต่างฝ่ายเป็นผู้รอดชีวิตสองคนสุดท้าย'
        };
      }
    }
  }

  /* Cult: every survivor belongs to the cult and the leader is alive. */
  var leaderAlive = false;
  for (var i = 0; i < c.alive.length; i++) if (c.alive[i].currentRoleId === 'cult_leader') leaderAlive = true;
  if (leaderAlive && c.cult.length === c.total) {
    return {
      primaryWinningTeams: [TEAM.CULT],
      individualWinners: individualWinners_(state),
      reasonTh: 'ผู้รอดชีวิตทุกคนเป็นสมาชิกลัทธิ'
    };
  }

  /* Lone Wolf solo: last survivor, or the only wolf left at parity. */
  if (c.loneWolves.length === 1) {
    var lw = c.loneWolves[0];
    if (c.total === 1) {
      return {
        primaryWinningTeams: ['LONE_WOLF'],
        individualWinners: individualWinners_(state).concat([
          { playerId: lw.playerId, name: lw.name, roleId: 'lone_wolf', reasonTh: 'เป็นผู้รอดชีวิตคนสุดท้าย' }
        ]),
        reasonTh: 'หมาป่าเดียวดายเป็นผู้รอดชีวิตคนสุดท้าย'
      };
    }
    if (c.wolves.length === 1 && c.vampires.length === 0 &&
        c.wolves.length >= (c.total - c.wolves.length)) {
      return {
        primaryWinningTeams: ['LONE_WOLF'],
        individualWinners: individualWinners_(state).concat([
          { playerId: lw.playerId, name: lw.name, roleId: 'lone_wolf', reasonTh: 'ถึง parity โดยเป็นหมาป่าตัวเดียว' }
        ]),
        reasonTh: 'หมาป่าเดียวดายถึงจุดชี้ขาดเพียงลำพัง'
      };
    }
  }

  /* Vampire: no wolves left and vampires reach parity with the rest. */
  if (rv.vampireEnabled && c.vampires.length > 0) {
    if (c.wolves.length === 0 && c.vampires.length >= (c.total - c.vampires.length)) {
      return {
        primaryWinningTeams: [TEAM.VAMPIRE],
        individualWinners: individualWinners_(state),
        reasonTh: 'แวมไพร์กำจัดหมาป่าหมดและมีจำนวนเท่าหรือมากกว่าฝ่ายที่เหลือ'
      };
    }
  }

  /* Werewolf: parity with everyone who is not on the wolf team, and no vampire threat left. */
  if (c.wolves.length > 0 && c.vampires.length === 0) {
    var nonWolves = c.total - c.wolves.length;
    if (c.wolves.length >= nonWolves) {
      var pureCult = c.cult.length === c.total;
      if (!pureCult) {
        return {
          primaryWinningTeams: [TEAM.WEREWOLF],
          individualWinners: individualWinners_(state),
          reasonTh: 'ฝ่ายหมาป่ามีจำนวนเท่าหรือมากกว่าฝ่ายที่เหลือ'
        };
      }
    }
  }

  /* Village: no wolf and no vampire threat remains, and the cult has not taken over. */
  if (c.wolves.length === 0 && c.vampires.length === 0) {
    if (!(leaderAlive && c.cult.length === c.total)) {
      return {
        primaryWinningTeams: [TEAM.VILLAGE],
        individualWinners: individualWinners_(state),
        reasonTh: 'ภัยคุกคามทั้งหมดถูกกำจัดแล้ว'
      };
    }
  }

  return null;
}

/** Human readable label for a winning team key. */
function winTeamLabel(key) {
  if (key === 'SOULMATES') return 'คู่แท้';
  if (key === 'LONE_WOLF') return 'หมาป่าเดียวดาย';
  if (key === 'TANNER') return 'คนบ้า';
  return TEAM_TH[key] || key;
}
