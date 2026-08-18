/**
 * harness.js — loads the pure rule-engine .gs files into a sandbox so they can be
 * unit tested with plain Node. Nothing here ships to Apps Script.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.existsSync(path.join(__dirname, '..', 'src'))
  ? path.join(__dirname, '..', 'src')
  : path.join(__dirname, '..');
const PURE_FILES = [
  'Config.gs',
  'RoleCatalog.gs',
  'Utils.gs',
  'Validation.gs',
  'WinConditionService.gs',
  'EffectResolver.gs',
  'RuleEngine.gs',
  'GameService.gs'
];

function loadEngine() {
  const code = PURE_FILES
    .map(f => '/* ==== ' + f + ' ==== */\n' + fs.readFileSync(path.join(SRC, f), 'utf8'))
    .join('\n');
  const sandbox = { console, Date, Math, JSON, String, Number, Array, Object, isNaN, parseInt, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'engine.bundle.gs' });
  return sandbox;
}

/* ---------------- assertions ---------------- */

let passed = 0, failed = 0;
const failures = [];
let currentSuite = '';

function suite(name) { currentSuite = name; }

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (e) {
    failed++;
    failures.push({ suite: currentSuite, name, message: e.message, stack: e.stack });
    console.log('  \u2717 ' + name + '\n      ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'expected') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
}
function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) throw new Error(msg || 'expected a thrown error');
}

function report() {
  console.log('\n' + '='.repeat(60));
  console.log('ผ่าน ' + passed + ' / ล้มเหลว ' + failed);
  if (failed) {
    console.log('\nรายการที่ล้มเหลว:');
    failures.forEach(f => console.log(' - [' + f.suite + '] ' + f.name + ': ' + f.message));
  }
  console.log('='.repeat(60));
  return failed === 0;
}

/* ---------------- game builders ---------------- */

/**
 * roles: array of roleId, one per seat.
 * opts: { variants, hidden: {seatIndex: roleId} }
 */
function newGame(E, roles, opts) {
  opts = opts || {};
  const names = roles.map((r, i) => 'ผู้เล่น' + (i + 1));
  const st = E.createGameState({ playerNames: names });
  Object.keys(opts.variants || {}).forEach(k => { st.ruleVariants[k] = opts.variants[k]; });

  const counts = {};
  roles.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  st.selectedRoles = Object.keys(counts).map(k => ({ roleId: k, count: counts[k] }));
  st.status = 'ROLE_ASSIGNMENT';

  const assignments = roles.map((r, i) => {
    const a = { playerId: st.players[i].playerId, roleId: r };
    if (r === 'drunk') a.hiddenRoleId = (opts.hidden && opts.hidden[i]) || 'werewolf';
    return a;
  });
  E.assignRoles(st, assignments);
  E.startGame(st);
  return st;
}

/** Seat number (1-based) -> playerId */
function pid(st, seat) { return st.players[seat - 1].playerId; }
function player(st, seat) { return st.players[seat - 1]; }

function hasStep(st, stepId) {
  return st.night.steps.some(s => s.stepId === stepId);
}

/** Submit an action if the step exists, otherwise ignore. */
function act(E, st, stepId, targetSeats, meta) {
  if (!hasStep(st, stepId)) throw new Error('ไม่มีขั้นตอน ' + stepId + ' ในคืนนี้');
  const targets = (targetSeats || []).map(s => pid(st, s));
  return E.submitRoleAction(st, stepId, targets, meta || {});
}

/** Auto-complete every remaining night step with a harmless choice. */
function finishRemainingSteps(E, st) {
  let guard = 0;
  while (true) {
    if (++guard > 60) throw new Error('วนลูปไม่จบใน finishRemainingSteps');
    const s = E.currentStep(st);
    if (!s) break;
    E.skipStep(st, s.stepId);
  }
}

function resolveNightAndDawn(E, st) {
  finishRemainingSteps(E, st);
  E.finishNight(st);
  return st;
}

/**
 * Load the engine PLUS the Apps Script-dependent layers against mock services,
 * so Storage.gs / Auth.gs / Api.gs behaviour can be tested too.
 */
const FULL_FILES = PURE_FILES.concat(['Auth.gs', 'Storage.gs', 'SheetInitializer.gs', 'Api.gs']);

function loadFull() {
  const { makeEnv } = require('./mock-sheets.js');
  const env = makeEnv('MOCK_SHEET_ID');
  const code = FULL_FILES
    .map(f => '/* ==== ' + f + ' ==== */\n' + fs.readFileSync(path.join(SRC, f), 'utf8'))
    .join('\n');
  const sandbox = Object.assign(
    { console, Date, Math, JSON, String, Number, Array, Object, isNaN, parseInt, parseFloat },
    env.globals
  );
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'full.bundle.gs' });
  sandbox.__env = env;
  return sandbox;
}

module.exports = {
  loadEngine, loadFull, suite, test, assert, eq, throws, report,
  newGame, pid, player, hasStep, act, finishRemainingSteps, resolveNightAndDawn
};
