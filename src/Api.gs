/**
 * Api.gs
 * Every public function here is callable from the client via google.script.run.
 * All mutations go through runCommand() which handles the lock, version check,
 * idempotency key, snapshot, event log and persistence (spec 10).
 */

/**
 * The role catalog only changes when the moderator edits the RoleCatalog sheet,
 * so reading and rebuilding it on every page load is wasted time. Cache the built
 * payload for 6 hours; apiRefreshCatalog() clears it on demand.
 */
var CATALOG_CACHE_KEY = 'CATALOG:' + APP_VERSION;

function cachedCatalogPayload_() {
  var cache = CacheService.getScriptCache();
  try {
    var hit = cache.get(CATALOG_CACHE_KEY);
    if (hit) return JSON.parse(hit);
  } catch (e) { /* fall through and rebuild */ }

  ensureCatalogLoaded_();
  var payload = { catalog: catalogViewModel(), defaults: defaultRuleVariants() };
  try {
    cache.put(CATALOG_CACHE_KEY, JSON.stringify(payload), 21600);
  } catch (e2) { /* too large to cache — still fine, just slower */ }
  return payload;
}

function apiBootstrap() {
  var p = cachedCatalogPayload_();
  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    catalog: p.catalog,
    defaults: p.defaults,
    openGames: listOpenGames()
  };
}

/** Called after editing the RoleCatalog sheet so the change shows up immediately. */
function apiRefreshCatalog() {
  try { CacheService.getScriptCache().remove(CATALOG_CACHE_KEY); } catch (e) {}
  loadCatalogOverrides();   /* forces a real sheet read and refills both caches */
  var payload = { catalog: catalogViewModel(), defaults: defaultRuleVariants() };
  try {
    CacheService.getScriptCache().put(CATALOG_CACHE_KEY, JSON.stringify(payload), 21600);
  } catch (e2) {}
  return { catalog: payload.catalog, defaults: payload.defaults };
}

function apiCreateGame(payload) {
  payload = payload || {};
  var names = payload.playerNames || [];
  if (names.length < 3) throw new Error('ต้องมีผู้เล่นอย่างน้อย 3 คน');
  if (names.length > 40) throw new Error('รองรับผู้เล่นไม่เกิน 40 คน');
  return withGameLock(function () {
    ensureCatalogLoaded_();
    var state = createGameState(payload);
    drainEvents(state);
    persistGame(state);
    var vm = moderatorViewModel(state);
    vm.moderatorPin = state.moderatorPin;   // shown once, on the creation screen only
    return vm;
  });
}

function apiLoadGame(gameId, moderatorPin) {
  ensureCatalogLoaded_();
  var state = loadGame(gameId);
  if (!isModerator(state, moderatorPin)) throw new Error('PIN ผู้ดำเนินเกมไม่ถูกต้อง');
  return moderatorViewModel(state);
}

function apiPublicView(gameId) {
  ensureCatalogLoaded_();
  return publicViewModel(loadGame(gameId));
}

function apiSetPlayers(cmd) {
  return runCommand(cmd, 'ตั้งรายชื่อผู้เล่น', false, function (state) {
    setPlayers(state, cmd.playerNames || []);
  });
}

function apiConfigureGame(cmd) {
  return runCommand(cmd, 'ตั้งค่ากติกาและชุดบทบาท', false, function (state) {
    configureGame(state, cmd);
  });
}

function apiValidateSelection(cmd) {
  ensureCatalogLoaded_();
  var state = loadGame(cmd.gameId);
  requireModerator(state, cmd.moderatorPin);
  if (cmd.selectedRoles) {
    state.selectedRoles = [];
    for (var i = 0; i < cmd.selectedRoles.length; i++) {
      if (cmd.selectedRoles[i].count > 0) state.selectedRoles.push(cmd.selectedRoles[i]);
    }
  }
  var check = validateRoleSelection(state);
  check.impact = villageImpactSummary(state);
  return check;
}

function apiAssignRoles(cmd) {
  return runCommand(cmd, 'บันทึกการแจกบทบาท', false, function (state) {
    assignRoles(state, cmd.assignments || []);
  });
}

function apiSwapRoles(cmd) {
  return runCommand(cmd, 'สลับบทบาทระหว่างผู้เล่นสองคน', false, function (state) {
    var a = mustPlayer(state, cmd.playerA);
    var b = mustPlayer(state, cmd.playerB);
    var tmp = { r: a.baseRoleId, h: a.hiddenRoleId };
    a.baseRoleId = b.baseRoleId; a.currentRoleId = b.baseRoleId; a.hiddenRoleId = b.hiddenRoleId;
    b.baseRoleId = tmp.r; b.currentRoleId = tmp.r; b.hiddenRoleId = tmp.h;
    a.baseTeam = a.baseRoleId ? getRole(a.baseRoleId).baseTeam : null; a.currentTeam = a.baseTeam;
    b.baseTeam = b.baseRoleId ? getRole(b.baseRoleId).baseTeam : null; b.currentTeam = b.baseTeam;
    a.charges = a.baseRoleId && getRole(a.baseRoleId).charges ? uwClone(getRole(a.baseRoleId).charges) : {};
    b.charges = b.baseRoleId && getRole(b.baseRoleId).charges ? uwClone(getRole(b.baseRoleId).charges) : {};
  });
}

function apiReopenRoleAssignment(cmd) {
  return runCommand(cmd, 'REOPEN_ROLE_ASSIGNMENT', true, function (state) {
    reopenRoleAssignment(state, cmd.reason);
  });
}

function apiStartGame(cmd) {
  return runCommand(cmd, 'เริ่มเกม', true, function (state) {
    startGame(state);
  });
}

function apiSubmitRoleAction(cmd) {
  return runCommand(cmd, 'บันทึกการกระทำกลางคืน: ' + cmd.stepId, false, function (state) {
    var info = submitRoleAction(state, cmd.stepId, cmd.targetIds, cmd.meta);
    state.__lastInfo = info;
  });
}

function apiSkipStep(cmd) {
  return runCommand(cmd, 'ข้ามขั้นตอน ' + cmd.stepId, false, function (state) {
    skipStep(state, cmd.stepId);
  });
}

function apiResolveNight(cmd) {
  return runCommand(cmd, 'สรุปผลกลางคืน', true, function (state) {
    finishNight(state);
  });
}

function apiResolvePrompt(cmd) {
  return runCommand(cmd, 'ประมวลผลทริกเกอร์การตาย', true, function (state) {
    resolveDeathPrompt(state, cmd.promptId, cmd.targetId);
  });
}

function apiStartDiscussion(cmd) {
  return runCommand(cmd, 'เริ่มช่วงอภิปราย', false, function (state) {
    startDiscussion(state);
  });
}

function apiOpenNomination(cmd) {
  return runCommand(cmd, 'เปิดการเสนอชื่อ', false, function (state) {
    openNomination(state);
  });
}
function apiStartNomination(cmd) {
  return runCommand(cmd, 'ปิดการเสนอชื่อ', true, function (state) {
    startNomination(state, cmd.nomineeIds || []);
  });
}

function apiSubmitVote(cmd) {
  return runCommand(cmd, 'บันทึกคะแนน', false, function (state) {
    var votes = cmd.votes || {};
    for (var voterId in votes) {
      if (votes.hasOwnProperty(voterId)) submitVote(state, voterId, votes[voterId]);
    }
  });
}

function apiResolveVote(cmd) {
  return runCommand(cmd, 'สรุปผลการลงคะแนน', true, function (state) {
    resolveVote(state, cmd.moderatorChoice);
  });
}

function apiForceEndDay(cmd) {
  return runCommand(cmd, 'ปิดวันโดยไม่แขวนคอ', true, function (state) {
    forceEndDay(state);
  });
}

function apiModeratorKill(cmd) {
  return runCommand(cmd, 'ผู้ดำเนินเกมสั่งให้เสียชีวิต', true, function (state) {
    moderatorKill(state, cmd.playerId, cmd.reason);
  });
}

function apiPauseGame(cmd) {
  return runCommand(cmd, 'หยุดพักเกม', false, function (state) { pauseGame(state); });
}

function apiResumeGame(cmd) {
  return runCommand(cmd, 'เล่นต่อ', false, function (state) { resumeGame(state); });
}

function apiEndGame(cmd) {
  return runCommand(cmd, 'จบเกม', true, function (state) { endGame(state, cmd.reason); });
}

/** Undo restores the snapshot taken before the last high-impact command (spec 14). */
function apiUndoLastCommand(cmd) {
  return withGameLock(function () {
    var current = loadGame(cmd.gameId);
    requireModerator(current, cmd.moderatorPin);
    var snap = popSnapshot(cmd.gameId);
    var state = snap.state;
    state.version = current.version + 1;
    state.updatedAt = uwNow();
    emit(state, 'COMMAND_REVERTED', { label: snap.label });
    timeline(state, 'undo', 'ย้อนคำสั่ง: ' + (snap.label || 'ไม่ระบุ'));
    drainEvents(state);
    persistGame(state);
    return moderatorViewModel(state);
  });
}

function apiFinalSummary(cmd) {
  ensureCatalogLoaded_();
  var state = loadGame(cmd.gameId);
  requireModerator(state, cmd.moderatorPin);
  return finalSummary(state);
}

function apiEventLog(cmd) {
  var state = loadGame(cmd.gameId);
  requireModerator(state, cmd.moderatorPin);
  return readEvents(cmd.gameId, cmd.limit || 150);
}

/**
 * Refresh the human-readable Players sheet on demand. Normal commands skip this
 * table because rewriting it is expensive and no code reads it back.
 */
function apiExportPlayerTable(cmd) {
  var state = loadGame(cmd.gameId);
  requireModerator(state, cmd.moderatorPin);
  writePlayersSnapshot_(state);
  return { ok: true, rows: state.players.length };
}

/** Start a new game reusing the same seating order (spec 11.7). */
function apiRematch(cmd) {
  return withGameLock(function () {
    ensureCatalogLoaded_();
    var old = loadGame(cmd.gameId);
    requireModerator(old, cmd.moderatorPin);
    var names = [];
    for (var i = 0; i < old.players.length; i++) names.push(old.players[i].name);
    var state = createGameState({ playerNames: names, title: old.title, deckProfile: old.deckProfile });
    state.ruleVariants = uwClone(old.ruleVariants);
    state.selectedRoles = uwClone(old.selectedRoles);
    if (state.selectedRoles.length) state.status = STATUS.ROLE_ASSIGNMENT;
    drainEvents(state);
    persistGame(state);
    var vm = moderatorViewModel(state);
    vm.moderatorPin = state.moderatorPin;
    return vm;
  });
}
