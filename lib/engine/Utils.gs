/**
 * Utils.gs — pure helpers, no Google services, safe to unit test.
 */

function uwClone(o) {
  return o === null || o === undefined ? o : JSON.parse(JSON.stringify(o));
}

function uwNow() {
  return new Date().toISOString();
}

function uwRandomId(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < (len || 6); i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function uwGameId() { return 'GAME-' + uwRandomId(6); }
function uwPin() { return uwRandomId(4) + '-' + uwRandomId(4); }

/** Escape for safe rendering; the client also escapes, this is defence in depth. */
function uwEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uwContains(arr, v) {
  if (!arr) return false;
  for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true;
  return false;
}

function uwPush(arr, v) {
  if (!uwContains(arr, v)) arr.push(v);
  return arr;
}

function uwRemove(arr, v) {
  for (var i = arr.length - 1; i >= 0; i--) if (arr[i] === v) arr.splice(i, 1);
  return arr;
}

function uwUnique(arr) {
  var out = [];
  for (var i = 0; i < arr.length; i++) uwPush(out, arr[i]);
  return out;
}

/* ---------- player helpers ---------- */

function findPlayer(state, playerId) {
  for (var i = 0; i < state.players.length; i++) {
    if (state.players[i].playerId === playerId) return state.players[i];
  }
  return null;
}

function mustPlayer(state, playerId) {
  var p = findPlayer(state, playerId);
  if (!p) throw new Error('ไม่พบผู้เล่นรหัส ' + playerId);
  return p;
}

function alivePlayers(state) {
  var out = [];
  for (var i = 0; i < state.players.length; i++) if (state.players[i].alive) out.push(state.players[i]);
  return out;
}

function playersWithRole(state, roleId, aliveOnly) {
  var out = [];
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    if (p.currentRoleId === roleId && (!aliveOnly || p.alive)) out.push(p);
  }
  return out;
}

function anyAliveWithRole(state, roleId) {
  return playersWithRole(state, roleId, true).length > 0;
}

function anyPlayerHadRole(state, roleId) {
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    if (p.baseRoleId === roleId || p.currentRoleId === roleId) return true;
  }
  return false;
}

function hasStatus(p, s) { return uwContains(p.statuses, s); }
function addStatus(p, s) { uwPush(p.statuses, s); }
function removeStatus(p, s) { uwRemove(p.statuses, s); }

/** Seating order sorted ascending; used by P.I., Mad Bomber, Big Bad Wolf. */
function seatOrder(state) {
  var arr = state.players.slice();
  arr.sort(function (a, b) { return a.seat - b.seat; });
  return arr;
}

/**
 * Nearest living neighbours around a seat.
 * includeSelfDead = the target itself may already be dead (Mad Bomber case).
 */
function livingNeighbours(state, playerId) {
  var order = seatOrder(state);
  var idx = -1;
  for (var i = 0; i < order.length; i++) if (order[i].playerId === playerId) idx = i;
  if (idx < 0) return { left: null, right: null };
  var n = order.length;
  var left = null, right = null, k;
  for (k = 1; k < n; k++) {
    var c = order[(idx - k + n * 2) % n];
    if (c.playerId === playerId) break;
    if (c.alive) { left = c; break; }
  }
  for (k = 1; k < n; k++) {
    var c2 = order[(idx + k) % n];
    if (c2.playerId === playerId) break;
    if (c2.alive) { right = c2; break; }
  }
  return { left: left, right: right };
}

/** Immediate seat neighbours regardless of life status (P.I. uses living ones per spec). */
function neighboursForPI(state, playerId) {
  return livingNeighbours(state, playerId);
}

/* ---------- team helpers ---------- */

function isWolfTeam(p) { return p.currentTeam === TEAM.WEREWOLF; }

function isCultMember(p) {
  return p.currentRoleId === 'cult_leader' || hasStatus(p, ST.CULT_MEMBER);
}

/** What an investigative role reads on this player. */
function detectedTeam(state, p) {
  var def = getRole(p.currentRoleId);
  if (def.seerAppears) return def.seerAppears === 'WEREWOLF' ? TEAM.WEREWOLF : TEAM.VILLAGE;
  if (p.currentTeam === TEAM.VAMPIRE) {
    return state.ruleVariants.vampireDetectableBySeer ? TEAM.WEREWOLF : TEAM.VILLAGE;
  }
  if (p.currentTeam === TEAM.WEREWOLF) return TEAM.WEREWOLF;
  return TEAM.VILLAGE;
}

function isThreatToSeer(state, p) {
  return detectedTeam(state, p) === TEAM.WEREWOLF;
}

/** Optimistic concurrency guard, shared by Storage.runCommand (spec 10). */
function assertVersion(state, expected) {
  if (expected === undefined || expected === null || expected === '') return true;
  if (Number(expected) !== Number(state.version)) {
    throw new Error('ข้อมูลไม่ตรงกัน (เวอร์ชัน ' + expected + ' แต่ระบบอยู่ที่ ' +
      state.version + ') กรุณารีเฟรชหน้าจอ');
  }
  return true;
}
