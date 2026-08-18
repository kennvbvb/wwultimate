import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import * as E from './engine.generated.js';
import { query, withTransaction } from './db.ts';
import { ensureCatalogLoaded } from './catalog.ts';
import { nightTargetHints } from './nightHints.ts';
import { buildStats, type FinishedGameRow, type Stats } from './stats.ts';
import type {
  Command, GameState, GameEvent, ModeratorViewModel, PublicViewModel, FinalSummary
} from './types.ts';

/**
 * Persistence for game state, the append-only event log, snapshots for undo,
 * optimistic version checks and idempotency — everything Storage.gs did.
 *
 * The one behavioural upgrade: SELECT ... FOR UPDATE locks a single game row,
 * where Apps Script only offered a script-wide lock. Two tables can now be run
 * at the same time without blocking each other (CLAUDE.md §9, phase 3 item).
 */

const SNAPSHOTS_KEPT = 25;
const BCRYPT_ROUNDS = 10;

/* ---------------- helpers ---------------- */

function stripForStorage(state: GameState): GameState {
  const copy = E.uwClone(state);
  delete copy.__events;
  /* The PIN is verified against games.pin_hash. Keeping the plaintext copy the
   * engine puts in the state would undo the point of hashing it. */
  copy.moderatorPin = '';
  return copy;
}

function reviveState(raw: GameState): GameState {
  const state = raw;
  state.__events = [];
  return state;
}

function idemKey(gameId: string, key: string): string { return gameId + ':' + key; }

/**
 * The moderator view plus the per-target hints the night screen greys names out
 * with. Built in one place so every path that returns a view — command, undo,
 * reload, rematch — carries them; a screen that got the view from a command
 * response would otherwise show live buttons the server is about to reject.
 */
function moderatorViewOf(state: GameState): ModeratorViewModel {
  const view = E.moderatorViewModel(state);
  view.targetHints = nightTargetHints(state, view.currentStep);
  return view;
}

/** Turns any engine/db failure into the Thai message the UI shows verbatim. */
export class GameError extends Error {}

/* ---------------- events ---------------- */

async function writeEvents(client: PoolClient, state: GameState): Promise<void> {
  const events = (state.__events || []) as GameEvent[];
  state.__events = [];
  if (!events.length) return;

  /* Engine seq numbers restart at 1 on every command (they only ever meant
   * "order within this command"), so they are rebased onto the game's log. */
  const res = await client.query<{ max: number | null }>(
    'SELECT MAX(seq) AS max FROM events WHERE game_id = $1', [state.gameId]);
  const base = Number(res.rows[0]?.max || 0);

  const values: unknown[] = [];
  const tuples = events.map((e, i) => {
    const at = i * 6;
    values.push(state.gameId, base + i + 1, e.type, e.dayNumber, e.nightNumber,
      JSON.stringify(e.payload ?? {}));
    return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6})`;
  });
  await client.query(
    'INSERT INTO events (game_id, seq, type, day_number, night_number, payload) VALUES ' +
    tuples.join(', '), values);
}

export async function readEvents(gameId: string, limit = 150): Promise<GameEvent[]> {
  const res = await query<{
    seq: number; at: Date; type: string; day_number: number; night_number: number; payload: unknown;
  }>('SELECT seq, at, type, day_number, night_number, payload FROM events ' +
     'WHERE game_id = $1 ORDER BY seq DESC LIMIT $2', [gameId, limit]);
  return res.rows.map((r) => ({
    seq: r.seq, at: r.at.toISOString(), type: r.type,
    dayNumber: r.day_number, nightNumber: r.night_number, payload: r.payload
  }));
}

/* ---------------- snapshots / undo ---------------- */

async function takeSnapshot(
  client: PoolClient, state: GameState, commandId: string, label: string
): Promise<void> {
  await client.query(
    'INSERT INTO snapshots (game_id, version, command_id, label, state) VALUES ($1, $2, $3, $4, $5)',
    [state.gameId, state.version, commandId, label, JSON.stringify(stripForStorage(state))]);
  /* One statement instead of the row-by-row deleteRow() loop Sheets needed. */
  await client.query(
    'DELETE FROM snapshots WHERE game_id = $1 AND id NOT IN ' +
    '(SELECT id FROM snapshots WHERE game_id = $1 ORDER BY id DESC LIMIT $2)',
    [state.gameId, SNAPSHOTS_KEPT]);
}

export async function countSnapshots(gameId: string): Promise<number> {
  const res = await query<{ n: string }>('SELECT COUNT(*)::text AS n FROM snapshots WHERE game_id = $1', [gameId]);
  return Number(res.rows[0].n);
}

/* ---------------- games ---------------- */

export interface CreatedGame { view: ModeratorViewModel; moderatorPin: string; }

export async function createGame(payload: {
  playerNames?: string[]; title?: string; deckProfile?: { packs: string[] };
}): Promise<CreatedGame> {
  const names = payload.playerNames || [];
  if (names.length < 3) throw new GameError('ต้องมีผู้เล่นอย่างน้อย 3 คน');
  if (names.length > 40) throw new GameError('รองรับผู้เล่นไม่เกิน 40 คน');
  await ensureCatalogLoaded();

  const state = E.createGameState(payload);
  const pin = state.moderatorPin;
  const pinHash = await bcrypt.hash(normalisePin(pin), BCRYPT_ROUNDS);

  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO games (game_id, version, status, title, pin_hash, state, finished) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, FALSE)',
      [state.gameId, state.version, state.status, state.title, pinHash,
       JSON.stringify(stripForStorage(state))]);
    await writeEvents(client, state);
  });

  const view = moderatorViewOf(state);
  return { view, moderatorPin: pin };
}

export async function gameExists(gameId: string): Promise<boolean> {
  const res = await query('SELECT 1 FROM games WHERE game_id = $1', [gameId]);
  return res.rowCount === 1;
}

/** PINs are matched case-insensitively, the way requireModerator() always did. */
export async function verifyPin(gameId: string, pin: string): Promise<boolean> {
  if (!pin) return false;
  const res = await query<{ pin_hash: string }>('SELECT pin_hash FROM games WHERE game_id = $1', [gameId]);
  if (!res.rowCount) return false;
  try {
    return await bcrypt.compare(normalisePin(pin), res.rows[0].pin_hash);
  } catch {
    return false;
  }
}

function normalisePin(pin: string): string {
  return String(pin).trim().toUpperCase();
}

export async function loadState(gameId: string): Promise<GameState> {
  const res = await query<{ state: GameState }>('SELECT state FROM games WHERE game_id = $1', [gameId]);
  if (!res.rowCount) throw new GameError('ไม่พบเกมรหัส ' + gameId);
  return reviveState(res.rows[0].state);
}

export async function moderatorView(gameId: string): Promise<ModeratorViewModel> {
  await ensureCatalogLoaded();
  return moderatorViewOf(await loadState(gameId));
}

export async function publicView(gameId: string): Promise<PublicViewModel> {
  await ensureCatalogLoaded();
  const state = await loadState(gameId);
  const view = E.publicViewModel(state);
  /* The public screen polls for changes; the version tells it when to redraw. */
  view.version = state.version;
  return view;
}

export async function summaryView(gameId: string): Promise<FinalSummary> {
  await ensureCatalogLoaded();
  return E.finalSummary(await loadState(gameId));
}

export interface OpenGameRow {
  gameId: string; status: string; statusTh: string;
  dayNumber: number; nightNumber: number; title: string; updatedAt: string;
}

export async function listOpenGames(limit = 20): Promise<OpenGameRow[]> {
  const res = await query<{
    game_id: string; status: string; title: string; updated_at: Date; state: GameState;
  }>('SELECT game_id, status, title, updated_at, ' +
     "jsonb_build_object('dayNumber', state->'dayNumber', 'nightNumber', state->'nightNumber') AS state " +
     'FROM games WHERE finished = FALSE ORDER BY updated_at DESC LIMIT $1', [limit]);
  return res.rows.map((r) => ({
    gameId: r.game_id,
    status: r.status,
    statusTh: E.statusLabel(r.status),
    dayNumber: Number(r.state.dayNumber || 0),
    nightNumber: Number(r.state.nightNumber || 0),
    title: r.title,
    updatedAt: r.updated_at.toISOString()
  }));
}

/* ---------------- the one mutation pipeline ---------------- */

/**
 * Every mutation goes through here (spec 10). Callers must have already proved
 * the moderator owns this game — the /api/command route does that once, for all
 * handlers, exactly as runCommand() in Storage.gs did.
 */
export async function runCommand(
  cmd: Command,
  label: string,
  highImpact: boolean,
  mutator: (state: GameState) => void
): Promise<ModeratorViewModel> {
  if (!cmd || !cmd.gameId) throw new GameError('คำสั่งไม่มี gameId');
  await ensureCatalogLoaded();

  const view = await withTransaction(async (client) => {
    if (cmd.idempotencyKey) {
      const hit = await client.query<{ result: ModeratorViewModel }>(
        'SELECT result FROM idempotency WHERE key = $1', [idemKey(cmd.gameId, String(cmd.idempotencyKey))]);
      if (hit.rowCount) return hit.rows[0].result;
    }

    /* FOR UPDATE serialises commands on this game only. A second command
     * arriving mid-flight waits here and then fails the version check below,
     * which is the behaviour the moderator screen already expects. */
    const got = await client.query<{ state: GameState }>(
      'SELECT state FROM games WHERE game_id = $1 FOR UPDATE', [cmd.gameId]);
    if (!got.rowCount) throw new GameError('ไม่พบเกมรหัส ' + cmd.gameId);

    const state = reviveState(got.rows[0].state);
    const baseVersion = state.version;
    E.assertVersion(state, cmd.expectedVersion as number | undefined);

    if (highImpact) await takeSnapshot(client, state, String(cmd.idempotencyKey || E.uwRandomId(6)), label);

    mutator(state);

    state.version = baseVersion + 1;
    state.updatedAt = E.uwNow();

    const upd = await client.query(
      'UPDATE games SET state = $1, version = $2, status = $3, title = $4, finished = $5, ' +
      'updated_at = now() WHERE game_id = $6 AND version = $7',
      [JSON.stringify(stripForStorage(state)), state.version, state.status, state.title,
       state.status === 'FINISHED', cmd.gameId, baseVersion]);
    if (upd.rowCount === 0) {
      throw new GameError('ข้อมูลไม่ตรงกัน มีคำสั่งอื่นแก้ไขเกมนี้ไปแล้ว กรุณารีเฟรชหน้าจอ');
    }

    await writeEvents(client, state);

    const vm = moderatorViewOf(state);
    if (cmd.idempotencyKey) {
      await client.query(
        'INSERT INTO idempotency (key, game_id, result) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
        [idemKey(cmd.gameId, String(cmd.idempotencyKey)), cmd.gameId, JSON.stringify(vm)]);
    }
    return vm;
  });

  return view;
}

/** Undo restores the snapshot taken before the last high-impact command (spec 14). */
export async function undoLastCommand(gameId: string): Promise<ModeratorViewModel> {
  await ensureCatalogLoaded();
  const view = await withTransaction(async (client) => {
    const got = await client.query<{ state: GameState }>(
      'SELECT state FROM games WHERE game_id = $1 FOR UPDATE', [gameId]);
    if (!got.rowCount) throw new GameError('ไม่พบเกมรหัส ' + gameId);
    const current = got.rows[0].state;

    const snap = await client.query<{ id: string; label: string; state: GameState }>(
      'SELECT id, label, state FROM snapshots WHERE game_id = $1 ORDER BY id DESC LIMIT 1', [gameId]);
    if (!snap.rowCount) throw new GameError('ไม่มี snapshot ให้ย้อนกลับ');

    const state = reviveState(snap.rows[0].state);
    const label = snap.rows[0].label;
    state.version = Number(current.version) + 1;
    state.updatedAt = E.uwNow();
    E.emit(state, 'COMMAND_REVERTED', { label });
    E.timeline(state, 'undo', 'ย้อนคำสั่ง: ' + (label || 'ไม่ระบุ'));

    await client.query(
      'UPDATE games SET state = $1, version = $2, status = $3, finished = $4, updated_at = now() ' +
      'WHERE game_id = $5',
      [JSON.stringify(stripForStorage(state)), state.version, state.status,
       state.status === 'FINISHED', gameId]);
    await client.query('DELETE FROM snapshots WHERE id = $1', [snap.rows[0].id]);
    await writeEvents(client, state);
    return moderatorViewOf(state);
  });

  return view;
}

/** Start a new game reusing the same seating order (spec 11.7). */
export async function rematch(gameId: string): Promise<CreatedGame> {
  await ensureCatalogLoaded();
  const old = await loadState(gameId);
  const names = old.players.map((p) => String((p as { name: string }).name));
  const created = await createGame({
    playerNames: names,
    title: old.title,
    deckProfile: old.deckProfile
  });

  /* Carry the rule variants and deck across, the way apiRematch() did. */
  const state = await loadState(created.view.gameId);
  state.ruleVariants = E.uwClone(old.ruleVariants);
  state.selectedRoles = E.uwClone(old.selectedRoles);
  if (state.selectedRoles.length) state.status = 'ROLE_ASSIGNMENT';
  await query('UPDATE games SET state = $1, status = $2 WHERE game_id = $3',
    [JSON.stringify(stripForStorage(state)), state.status, state.gameId]);

  return { view: moderatorViewOf(state), moderatorPin: created.moderatorPin };
}

/* ---------------- change detection (SSE) ---------------- */

/**
 * The stream route asks for this every second or so instead of holding a
 * LISTEN connection: serverless instances come and go, and a dropped listener
 * would freeze the classroom TV silently. One indexed lookup is cheap enough
 * for the handful of screens a single table ever opens.
 */
export async function readVersion(gameId: string): Promise<number | null> {
  const res = await query<{ version: number }>('SELECT version FROM games WHERE game_id = $1', [gameId]);
  return res.rowCount ? Number(res.rows[0].version) : null;
}

/* ---------------- cross-game statistics ---------------- */

/**
 * Finished games only. An unfinished game's state names the role of every
 * living player, so it must never reach a summary screen.
 */
export async function finishedGames(limit = 500): Promise<FinishedGameRow[]> {
  const res = await query<{ game_id: string; title: string; updated_at: Date; state: GameState }>(
    'SELECT game_id, title, updated_at, state FROM games ' +
    'WHERE finished = TRUE ORDER BY updated_at DESC LIMIT $1', [limit]);
  return res.rows.map((r) => ({
    gameId: r.game_id,
    title: r.title,
    finishedAt: r.updated_at.toISOString(),
    state: r.state
  }));
}

export async function gameStats(): Promise<Stats> {
  await ensureCatalogLoaded();
  return buildStats(await finishedGames());
}

/* ---------------- exports for the moderator ---------------- */

/** CSV replacement for the old Players sheet — nothing in the app reads it back. */
export async function playerTableCsv(gameId: string): Promise<string> {
  await ensureCatalogLoaded();
  const state = await loadState(gameId);
  const head = ['gameId', 'seat', 'playerId', 'name', 'baseRole', 'currentRole',
                'team', 'alive', 'statuses', 'causeOfDeath'];
  const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [head.join(',')];
  for (const raw of state.players) {
    const p = raw as Record<string, never>;
    lines.push([
      state.gameId, p.seat, p.playerId, p.name,
      p.baseRoleId ? E.roleDisplay(p.baseRoleId) : '',
      p.currentRoleId ? E.roleDisplay(p.currentRoleId) : '',
      p.currentTeam ? (E.TEAM_TH as Record<string, string>)[p.currentTeam] || '' : '',
      p.alive ? 'มีชีวิต' : 'เสียชีวิต',
      (p.statuses as string[]).join(' '),
      p.deathInfo ? (p.deathInfo as { causeTh: string }).causeTh : ''
    ].map(esc).join(','));
  }
  return lines.join('\n');
}
