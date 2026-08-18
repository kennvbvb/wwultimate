/**
 * helpers.js — game builders plus thin wrappers that keep the original test
 * bodies working on node:test. The GAS suite ran on a hand-rolled runner and a
 * vm sandbox; only the plumbing changed here, not a single assertion.
 */
import { test as nodeTest } from 'node:test';
import assertLib from 'node:assert';


/* The old runner grouped output by suite name. node:test does its own
 * reporting, so this only exists so the test files keep reading the same. */
export function suite(name) {
  if (name) console.log('\n--- ' + name + ' ---');
}

export function test(name, fn) {
  nodeTest(name, fn);
}

export function assert(cond, msg) {
  if (!cond) throw new assertLib.AssertionError({ message: msg || 'assertion failed' });
}

export function eq(a, b, msg) {
  if (a !== b) {
    throw new assertLib.AssertionError({
      message: (msg || 'expected') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b),
      actual: a, expected: b, operator: '==='
    });
  }
}

export function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) throw new assertLib.AssertionError({ message: msg || 'expected a thrown error' });
}

/* ---------------- game builders ---------------- */

/**
 * roles: array of roleId, one per seat.
 * opts: { variants, hidden: {seatIndex: roleId} }
 */
export function newGame(E, roles, opts) {
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
export function pid(st, seat) { return st.players[seat - 1].playerId; }
export function player(st, seat) { return st.players[seat - 1]; }

export function hasStep(st, stepId) {
  return st.night.steps.some(s => s.stepId === stepId);
}

/** Submit an action if the step exists, otherwise ignore. */
export function act(E, st, stepId, targetSeats, meta) {
  if (!hasStep(st, stepId)) throw new Error('ไม่มีขั้นตอน ' + stepId + ' ในคืนนี้');
  const targets = (targetSeats || []).map(s => pid(st, s));
  return E.submitRoleAction(st, stepId, targets, meta || {});
}

/** Auto-complete every remaining night step with a harmless choice. */
export function finishRemainingSteps(E, st) {
  let guard = 0;
  while (true) {
    if (++guard > 60) throw new Error('วนลูปไม่จบใน finishRemainingSteps');
    const s = E.currentStep(st);
    if (!s) break;
    E.skipStep(st, s.stepId);
  }
}

export function resolveNightAndDawn(E, st) {
  finishRemainingSteps(E, st);
  E.finishNight(st);
  return st;
}
