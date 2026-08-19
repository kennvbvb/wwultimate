import * as E from './engine.generated.js';
import type { GameState } from './types.ts';

/**
 * Vote completeness and tie-break guards.
 *
 * The engine tallies whatever votes happen to be recorded and decides — it has
 * no notion of "everyone has voted yet". On a table that is fine, because the
 * moderator reads the room; on a screen it means a half-entered vote can hang
 * somebody. These guards live in the command layer so the rule engine stays
 * untouched, and they run inside the same transaction as resolveVote().
 */

export interface VoteProgress {
  /** Everyone allowed to vote right now (dead, exiled and muted are excluded). */
  eligible: { playerId: string; name: string; weight: number }[];
  received: number;
  total: number;
  missing: { playerId: string; name: string }[];
  complete: boolean;
  tally: Record<string, number>;
  spare: number;
  best: number;
  top: string[];
  /** True only when the tie actually decides the day (a spared majority is not a tie). */
  tie: boolean;
  tieCandidates: { playerId: string; name: string }[];
  needsModeratorChoice: boolean;
}

interface Tally {
  tally: Record<string, number>;
  spare: number;
  top: string[];
  best: number;
}

function nameOf(state: GameState, playerId: string): string {
  const player = (state.players as { playerId: string; name: string }[])
    .find((p) => p.playerId === playerId);
  return player ? player.name : playerId;
}

/** Null unless the game is actually in the voting step. */
export function voteProgress(state: GameState): VoteProgress | null {
  if (state.status !== 'VOTING' || !state.day) return null;

  const eligible = (E.eligibleVoters(state) as { playerId: string; name: string }[])
    .map((p) => ({
      playerId: String(p.playerId),
      name: String(p.name),
      weight: E.voteWeight(state, p)
    }));

  const votes = (state.day as { votes?: Record<string, string> }).votes || {};
  const missing = eligible
    .filter((v) => !votes[v.playerId])
    .map((v) => ({ playerId: v.playerId, name: v.name }));

  const r = E.tallyVotes(state) as unknown as Tally;

  /* Mirrors resolveVote(): a tie only matters when somebody would actually
   * hang — no votes at all, or more weight spared than the leader, is a
   * no-lynch day whatever the ranking looks like. */
  const decisive = r.best > 0 && r.spare < r.best;
  const tie = decisive && r.top.length > 1;

  return {
    eligible,
    received: eligible.length - missing.length,
    total: eligible.length,
    missing,
    complete: missing.length === 0,
    tally: r.tally,
    spare: r.spare,
    best: r.best,
    top: r.top,
    tie,
    tieCandidates: tie ? r.top.map((id) => ({ playerId: id, name: nameOf(state, id) })) : [],
    needsModeratorChoice: tie && state.ruleVariants.tieVoteRule === 'MODERATOR_DECIDES'
  };
}

/** Refuses to close the vote while anyone entitled to vote has not been recorded. */
export function assertVoteReady(state: GameState): VoteProgress {
  const progress = voteProgress(state);
  if (!progress) throw new Error('ตอนนี้ไม่ใช่ช่วงลงคะแนน');
  if (progress.complete) return progress;

  const names = progress.missing.map((m) => m.name);
  const shown = names.slice(0, 5).join(', ');
  const rest = names.length > 5 ? ' และอีก ' + (names.length - 5) + ' คน' : '';
  throw new Error(
    'ยังลงคะแนนไม่ครบ (' + progress.received + '/' + progress.total + ') ' +
    'ยังไม่ได้ลง: ' + shown + rest +
    ' — ถ้าตั้งใจให้งดออกเสียง ให้เลือก "งดโหวต / ไว้ชีวิต"');
}

/**
 * MODERATOR_DECIDES lets the moderator pick who hangs, but only among the
 * players who actually tied. Without this the engine would accept any id and
 * hang someone the village never voted for.
 */
export function assertTieChoice(state: GameState, choice?: string | null): void {
  const progress = voteProgress(state);
  if (!progress || !progress.needsModeratorChoice) return;

  if (!choice) {
    throw new Error('คะแนนเสมอ ผู้ดำเนินเกมต้องเลือกผู้ถูกกำจัดจากผู้ที่คะแนนเท่ากัน');
  }
  if (progress.top.indexOf(choice) < 0) {
    const names = progress.tieCandidates.map((c) => c.name).join(', ');
    throw new Error('เลือกได้เฉพาะผู้ที่คะแนนเสมอกันเท่านั้น (' + names + ')');
  }
}
