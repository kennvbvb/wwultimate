/**
 * GameService.gs
 * Builds the view models sent to the client. Moderator and Public views are strictly
 * separated so no secret role ever reaches a screen the players can see (spec 13).
 */

function statusLabel(status) {
  var m = {
    SETUP: 'ตั้งค่าเกม',
    ROLE_ASSIGNMENT: 'บันทึกการแจกบทบาท',
    FIRST_NIGHT: 'คืนแรก',
    NIGHT: 'กลางคืน',
    RESOLVE_NIGHT: 'สรุปผลกลางคืน',
    DAWN: 'รุ่งเช้า',
    DISCUSSION: 'ช่วงอภิปราย',
    NOMINATION: 'เสนอชื่อ',
    VOTING: 'ลงคะแนน',
    RESOLVE_DAY: 'สรุปผลกลางวัน',
    DEATH_TRIGGER: 'ผลกระทบจากการเสียชีวิต',
    WIN_CHECK: 'ตรวจเงื่อนไขชนะ',
    FINISHED: 'จบเกม',
    PAUSED: 'หยุดพัก'
  };
  return m[status] || status;
}

function statusBadges_(p) {
  var out = [];
  var map = {};
  map[ST.SOULMATE] = 'คู่แท้';
  map[ST.CULT_MEMBER] = 'สมาชิกลัทธิ';
  map[ST.BLESSED] = 'ได้รับพร';
  map[ST.MUTED] = 'พูดไม่ได้';
  map[ST.EXILED] = 'ถูกส่งออก';
  map[ST.DELAYED_DEATH] = 'บาดเจ็บสาหัส';
  map[ST.COMPANION] = 'คู่หูหมาป่าไดร์';
  map[ST.FEARED] = 'หวาดกลัว';
  map[ST.VAMPIRE_BITTEN] = 'ถูกกัด';
  map[ST.PRINCE_SAVED] = 'เจ้าชายเปิดตัวแล้ว';
  map[ST.IDIOT_REVEALED] = 'คนโง่เปิดตัวแล้ว';
  map[ST.CANNOT_VOTE] = 'โหวตไม่ได้';
  map[ST.HOODLUM_MARK] = 'เป้าหมายอันธพาล';
  map[ST.DOPPEL_TARGET] = 'ต้นแบบ';
  for (var i = 0; i < p.statuses.length; i++) {
    if (map[p.statuses[i]]) out.push(map[p.statuses[i]]);
  }
  return out;
}

/** Statuses that players at the table already know about — safe for the public screen. */
function publicBadges_(p) {
  var out = [];
  if (hasStatus(p, ST.MUTED)) out.push('พูดไม่ได้');
  if (hasStatus(p, ST.EXILED)) out.push('ถูกส่งออก');
  if (hasStatus(p, ST.CANNOT_VOTE)) out.push('โหวตไม่ได้');
  if (hasStatus(p, ST.PRINCE_SAVED)) out.push('เจ้าชาย');
  if (hasStatus(p, ST.IDIOT_REVEALED)) out.push('คนโง่ประจำหมู่บ้าน');
  return out;
}

function moderatorViewModel(state) {
  var players = [];
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    players.push({
      playerId: p.playerId, seat: p.seat, name: p.name, alive: p.alive,
      baseRoleId: p.baseRoleId, baseRoleTh: p.baseRoleId ? roleDisplay(p.baseRoleId) : '',
      currentRoleId: p.currentRoleId, currentRoleTh: p.currentRoleId ? roleDisplay(p.currentRoleId) : '',
      hiddenRoleTh: p.hiddenRoleId ? roleDisplay(p.hiddenRoleId) : '',
      team: p.currentTeam, teamTh: TEAM_TH[p.currentTeam] || '',
      changedTeam: p.baseTeam !== p.currentTeam,
      statuses: statusBadges_(p),
      charges: p.charges,
      linkedPlayerIds: p.linkedPlayerIds,
      deathInfo: p.deathInfo
    });
  }

  var step = currentStep(state);
  var vm = {
    mode: 'MODERATOR',
    gameId: state.gameId,
    version: state.version,
    title: state.title,
    status: state.status,
    statusTh: statusLabel(state.status),
    dayNumber: state.dayNumber,
    nightNumber: state.nightNumber,
    aliveCount: alivePlayers(state).length,
    totalCount: state.players.length,
    rolesLocked: state.rolesLocked,
    ruleVariants: state.ruleVariants,
    selectedRoles: state.selectedRoles,
    players: players,
    assignment: state.rolesLocked ? null : assignmentStatus(state),
    impact: state.selectedRoles.length ? villageImpactSummary(state) : null,
    night: state.night ? {
      number: state.night.number,
      stepIndex: state.night.stepIndex,
      totalSteps: state.night.steps.length,
      steps: state.night.steps,
      results: state.night.results,
      deaths: state.night.deaths,
      resolved: state.night.resolved
    } : null,
    currentStep: step,
    day: state.day ? {
      number: state.day.number,
      nominees: state.day.nominees,
      votes: state.day.votes,
      lynchCount: state.day.lynchCount,
      maxLynches: state.day.maxLynches,
      discussionEndsAt: state.day.discussionEndsAt,
      nominationEndsAt: state.day.nominationEndsAt || 0,
      eligibleVoters: (function () {
        var e = eligibleVoters(state), out = [];
        for (var k = 0; k < e.length; k++) {
          out.push({ playerId: e[k].playerId, name: e[k].name, weight: voteWeight(state, e[k]) });
        }
        return out;
      })()
    } : null,
    pendingPrompts: state.pendingPrompts,
    timeline: state.timeline.slice(-60),
    winners: state.winners,
    flags: state.flags
  };
  return vm;
}

function publicViewModel(state) {
  var players = [];
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    var revealMode = state.ruleVariants.roleRevealMode;
    var showRole = state.status === STATUS.FINISHED ||
      (!p.alive && revealMode === 'FULL') || p.revealed;
    var showTeam = state.status === STATUS.FINISHED ||
      (!p.alive && revealMode === 'TEAM_ONLY');
    players.push({
      playerId: p.playerId, seat: p.seat, name: p.name, alive: p.alive,
      roleTh: showRole && p.currentRoleId ? roleDisplay(p.currentRoleId) : '',
      teamTh: (showRole || showTeam) && p.currentTeam ? TEAM_TH[p.currentTeam] : '',
      causeTh: p.deathInfo ? p.deathInfo.causeTh : '',
      badges: publicBadges_(p)
    });
  }
  return {
    mode: 'PUBLIC',
    gameId: state.gameId,
    title: state.title,
    status: state.status,
    statusTh: statusLabel(state.status),
    dayNumber: state.dayNumber,
    nightNumber: state.nightNumber,
    aliveCount: alivePlayers(state).length,
    totalCount: state.players.length,
    players: players,
    day: state.day ? { nominees: state.day.nominees, lynchCount: state.day.lynchCount,
                       maxLynches: state.day.maxLynches, discussionEndsAt: state.day.discussionEndsAt,
                       nominationEndsAt: state.day.nominationEndsAt || 0 } : null,
    winners: state.status === STATUS.FINISHED ? state.winners : null,
    timelinePublic: publicTimeline_(state)
  };
}

function publicTimeline_(state) {
  var out = [];
  for (var i = 0; i < state.timeline.length; i++) {
    var t = state.timeline[i];
    if (t.icon === 'skull' || t.icon === 'rope' || t.icon === 'sun' || t.icon === 'moon' ||
        t.icon === 'crown' || t.icon === 'jester' || t.icon === 'peace' || t.icon === 'trophy') {
      out.push(t);
    }
  }
  return out.slice(-40);
}

/** End-of-game summary (spec 11.7). */
function finalSummary(state) {
  var rows = [];
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    rows.push({
      seat: p.seat, name: p.name,
      baseRoleTh: p.baseRoleId ? roleDisplay(p.baseRoleId) : '',
      finalRoleTh: p.currentRoleId ? roleDisplay(p.currentRoleId) : '',
      teamTh: TEAM_TH[p.currentTeam] || '',
      alive: p.alive,
      causeTh: p.deathInfo ? p.deathInfo.causeTh : '—'
    });
  }
  var teams = [];
  if (state.winners) {
    for (var t = 0; t < state.winners.primaryWinningTeams.length; t++) {
      teams.push(winTeamLabel(state.winners.primaryWinningTeams[t]));
    }
  }
  return {
    gameId: state.gameId,
    teamsTh: teams,
    individuals: state.winners ? state.winners.individualWinners : [],
    reasonTh: state.winners ? state.winners.reasonTh : '',
    players: rows,
    timeline: state.timeline
  };
}

/** Catalog payload for the role picker screen. */
function catalogViewModel() {
  var out = [];
  var list = listRoles();
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    out.push({
      roleId: d.roleId, pack: d.pack,
      th: d.displayNameTh, en: d.displayNameEn,
      team: d.baseTeam, teamTh: TEAM_TH[d.baseTeam],
      villageImpact: d.villageImpact,
      wakePolicy: d.wakePolicy,
      complexity: d.complexity,
      maxCopies: d.maxCopies,
      noteTh: d.noteTh,
      enabled: d.enabled
    });
  }
  return { roles: out, impactVerified: VILLAGE_IMPACT_VERIFIED };
}
