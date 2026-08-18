/**
 * Storage.gs
 * Google Sheets persistence: game state, append-only event log, snapshots for Undo,
 * optimistic version checking and idempotency (spec 9.4, 10, 14).
 */

var CHUNK_SIZE = 45000;   // stay well under the 50k characters-per-cell limit
var CHUNK_COLS = 6;       // supports roughly 270k characters of state

/* ------------------------------------------------------------------
 * Handle cache (perf phase 1, item 2)
 * openById() is a network round trip and every helper below used to call it
 * again. A single command touched it four times. These live for the lifetime
 * of one execution only, which is exactly the scope we want.
 * ------------------------------------------------------------------ */
var _ssHandle = null;
var _sheetHandles = {};

function getSpreadsheet() {
  if (_ssHandle) return _ssHandle;
  var id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!id) throw new Error('ยังไม่ได้ตั้งค่า SPREADSHEET_ID ใน Script Properties');
  _ssHandle = SpreadsheetApp.openById(id);
  return _ssHandle;
}

/** Drop cached handles — only needed after creating/binding a new spreadsheet. */
function resetStorageHandles_() {
  _ssHandle = null;
  _sheetHandles = {};
}

function _sheet(name, headers) {
  if (_sheetHandles[name]) return _sheetHandles[name];
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#1e1b4b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  _sheetHandles[name] = sh;
  return sh;
}

function _gamesSheet() {
  var h = ['gameId', 'version', 'status', 'dayNumber', 'nightNumber', 'title', 'moderatorPin',
           'createdAt', 'updatedAt', 'finished'];
  for (var i = 1; i <= CHUNK_COLS; i++) h.push('state' + i);
  return _sheet(SHEETS.GAMES, h);
}
function _playersSheet() {
  return _sheet(SHEETS.PLAYERS, ['gameId', 'seat', 'playerId', 'name', 'baseRoleId',
    'currentRoleId', 'team', 'alive', 'statuses', 'causeOfDeath']);
}
function _eventsSheet() {
  return _sheet(SHEETS.EVENTS, ['gameId', 'seq', 'at', 'type', 'dayNumber', 'nightNumber', 'payload']);
}
function _snapshotsSheet() {
  var h = ['gameId', 'version', 'commandId', 'at', 'label'];
  for (var i = 1; i <= CHUNK_COLS; i++) h.push('state' + i);
  return _sheet(SHEETS.SNAPSHOTS, h);
}
function _catalogSheet() {
  return _sheet(SHEETS.ROLE_CATALOG, ['roleId', 'pack', 'displayNameTh', 'displayNameEn', 'baseTeam',
    'villageImpact', 'maxCopies', 'wakePolicy', 'complexity', 'enabled', 'noteTh']);
}
function _settingsSheet() {
  return _sheet(SHEETS.SETTINGS, ['key', 'value', 'note']);
}

/* ---------------- chunking ---------------- */

function _chunk(json) {
  var out = [];
  for (var i = 0; i < CHUNK_COLS; i++) {
    out.push(json.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
  if (json.length > CHUNK_SIZE * CHUNK_COLS) {
    throw new Error('สถานะเกมใหญ่เกินไป กรุณาเริ่มเกมใหม่หรือลด timeline');
  }
  return out;
}

function _unchunk(row, startIdx) {
  var s = '';
  for (var i = 0; i < CHUNK_COLS; i++) s += (row[startIdx + i] || '');
  return s;
}

/* ---------------- game rows ---------------- */

/* ------------------------------------------------------------------
 * Row-index cache (perf phase 1, item 4)
 * A command used to scan the whole gameId column two or three times. The row a
 * game lives in only changes if rows above it are deleted, which nothing does,
 * so remember it. Every lookup is verified against the sheet before use, so a
 * stale entry falls back to a scan instead of corrupting anything.
 * ------------------------------------------------------------------ */
var _rowMemo = {};

function _rememberGameRow_(gameId, row) {
  _rowMemo[gameId] = row;
  try {
    CacheService.getScriptCache().put('ROW:' + gameId, String(row), 21600);
  } catch (e) { /* cache is an optimisation, never a requirement */ }
}

function _findGameRow(sh, gameId) {
  /* 1. same execution */
  var hit = _rowMemo[gameId];
  /* 2. an earlier execution */
  if (!hit) {
    try {
      var c = CacheService.getScriptCache().get('ROW:' + gameId);
      if (c) hit = parseInt(c, 10);
    } catch (e2) { /* ignore */ }
  }
  if (hit && hit >= 2 && hit <= sh.getLastRow()) {
    if (String(sh.getRange(hit, 1).getValue()) === gameId) {
      _rowMemo[gameId] = hit;
      return hit;
    }
  }

  /* 3. fall back to the full scan and remember the answer */
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === gameId) {
      _rememberGameRow_(gameId, i + 2);
      return i + 2;
    }
  }
  return -1;
}

/**
 * @param {boolean} withPlayerTable  write the human-readable Players sheet too.
 *        Off by default: it is the single most expensive part of a command and
 *        nothing reads it, so it is refreshed only when the game finishes or the
 *        moderator asks for an export.
 */
function persistGame(state, withPlayerTable) {
  var sh = _gamesSheet();
  var json = JSON.stringify(stripTransient_(state));
  var chunks = _chunk(json);
  var row = [state.gameId, state.version, state.status, state.dayNumber, state.nightNumber,
             state.title, state.moderatorPin, state.createdAt, state.updatedAt,
             state.status === STATUS.FINISHED].concat(chunks);
  var r = _findGameRow(sh, state.gameId);
  if (r < 0) {
    sh.appendRow(row);
    _rememberGameRow_(state.gameId, sh.getLastRow());
  } else {
    sh.getRange(r, 1, 1, row.length).setValues([row]);
  }
  if (withPlayerTable || state.status === STATUS.FINISHED) writePlayersSnapshot_(state);
}

function loadGame(gameId) {
  var sh = _gamesSheet();
  var r = _findGameRow(sh, gameId);
  if (r < 0) throw new Error('ไม่พบเกมรหัส ' + gameId);
  var row = sh.getRange(r, 1, 1, 10 + CHUNK_COLS).getValues()[0];
  var json = _unchunk(row, 10);
  if (!json) throw new Error('ข้อมูลเกม ' + gameId + ' เสียหาย');
  var state = JSON.parse(json);
  state.__events = [];
  return state;
}

function listOpenGames() {
  var sh = _gamesSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 10).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][9] === true || vals[i][9] === 'TRUE') continue;
    out.push({
      gameId: vals[i][0], status: vals[i][2], statusTh: statusLabel(vals[i][2]),
      dayNumber: vals[i][3], nightNumber: vals[i][4], title: vals[i][5],
      updatedAt: String(vals[i][8])
    });
  }
  out.reverse();
  return out.slice(0, 20);
}

/**
 * The Players sheet is a human-readable convenience table — no code reads it back.
 * It used to be rewritten on EVERY command with one deleteRow() call per player,
 * which cost more than the rest of the command combined. It is now written only
 * when it is actually worth reading (game over, or an explicit export), and the
 * old block is removed with a single deleteRows() call instead of N.
 */
function writePlayersSnapshot_(state) {
  var sh = _playersSheet();
  var last = sh.getLastRow();

  /* find this game's contiguous block, if any */
  if (last >= 2) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    var start = -1, count = 0;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === state.gameId) {
        if (start < 0) start = i + 2;
        count++;
      } else if (start >= 0 && count > 0 && (i + 2) > start + count) {
        break;  /* block ended and rows are contiguous — stop scanning */
      }
    }
    if (start > 0 && count > 0) sh.deleteRows(start, count);
  }

  if (!state.players.length) return;
  var rows = [];
  for (var j = 0; j < state.players.length; j++) {
    var p = state.players[j];
    rows.push([state.gameId, p.seat, p.playerId, p.name, p.baseRoleId || '', p.currentRoleId || '',
      p.currentTeam || '', p.alive, p.statuses.join(','),
      p.deathInfo ? p.deathInfo.causeTh : '']);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---------------- events ---------------- */

function drainEvents(state) {
  var evs = state.__events || [];
  state.__events = [];
  if (!evs.length) return;
  var sh = _eventsSheet();
  var rows = [];
  for (var i = 0; i < evs.length; i++) {
    var e = evs[i];
    rows.push([state.gameId, e.seq, e.at, e.type, e.dayNumber, e.nightNumber,
      JSON.stringify(e.payload).substring(0, 4000)]);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
}

function readEvents(gameId, limit) {
  var sh = _eventsSheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 7).getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 0 && out.length < (limit || 200); i--) {
    if (String(vals[i][0]) !== gameId) continue;
    out.push({ seq: vals[i][1], at: String(vals[i][2]), type: vals[i][3],
               dayNumber: vals[i][4], nightNumber: vals[i][5], payload: vals[i][6] });
  }
  return out;
}

/* ---------------- snapshots / undo ---------------- */

function takeSnapshot(state, commandId, label) {
  var sh = _snapshotsSheet();
  var json = JSON.stringify(stripTransient_(state));
  var row = [state.gameId, state.version, commandId, uwNow(), label || ''].concat(_chunk(json));
  sh.appendRow(row);
  trimSnapshots_(sh, state.gameId, 25);
}

function trimSnapshots_(sh, gameId, keep) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  var rows = [];
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === gameId) rows.push(i + 2);
  for (var j = 0; j < rows.length - keep; j++) sh.deleteRow(rows[j] - j);
}

function popSnapshot(gameId) {
  var sh = _snapshotsSheet();
  var last = sh.getLastRow();
  if (last < 2) throw new Error('ไม่มี snapshot ให้ย้อนกลับ');
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  var target = -1;
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === gameId) { target = i + 2; break; }
  }
  if (target < 0) throw new Error('ไม่มี snapshot ของเกมนี้');
  var row = sh.getRange(target, 1, 1, 5 + CHUNK_COLS).getValues()[0];
  var label = row[4];
  var state = JSON.parse(_unchunk(row, 5));
  sh.deleteRow(target);
  state.__events = [];
  return { state: state, label: label };
}

function stripTransient_(state) {
  var c = uwClone(state);
  delete c.__events;
  return c;
}

/* ---------------- lock + idempotency wrapper ---------------- */

var IDEMPOTENCY_TTL = 21600; // 6 hours

function withGameLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ระบบกำลังประมวลผลคำสั่งอื่นอยู่ กรุณาลองอีกครั้ง');
  try { return fn(); } finally { lock.releaseLock(); }
}

function cachedResult_(gameId, key) {
  if (!key) return null;
  var v = CacheService.getScriptCache().get('IDEM:' + gameId + ':' + key);
  return v ? JSON.parse(v) : null;
}

function storeResult_(gameId, key, result) {
  if (!key) return;
  try {
    CacheService.getScriptCache().put('IDEM:' + gameId + ':' + key,
      JSON.stringify(result).substring(0, 99000), IDEMPOTENCY_TTL);
  } catch (e) { /* oversized payloads simply are not cached */ }
}

/**
 * The single mutation pipeline every command goes through (spec 10).
 * cmd: { gameId, expectedVersion, idempotencyKey, moderatorPin, ... }
 */
function runCommand(cmd, label, highImpact, mutator) {
  if (!cmd || !cmd.gameId) throw new Error('คำสั่งไม่มี gameId');
  return withGameLock(function () {
    var cached = cachedResult_(cmd.gameId, cmd.idempotencyKey);
    if (cached) return cached;

    var state = loadGame(cmd.gameId);
    requireModerator(state, cmd.moderatorPin);

    assertVersion(state, cmd.expectedVersion);

    if (highImpact) takeSnapshot(state, cmd.idempotencyKey || uwRandomId(6), label);

    mutator(state);

    state.version++;
    state.updatedAt = uwNow();
    drainEvents(state);
    persistGame(state);

    var vm = moderatorViewModel(state);
    storeResult_(cmd.gameId, cmd.idempotencyKey, vm);
    return vm;
  });
}
