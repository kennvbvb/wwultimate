import * as E from './engine.generated.js';
import type { GameState } from './types.ts';

/**
 * Pausing has to stop the clocks too.
 *
 * pauseGame() only swaps the status, so a five-minute break used to eat five
 * minutes of the discussion timer — and since the timer is what the moderator
 * shows the class, the break silently shortened the round. The deadlines live
 * in plain state fields, so they can be shifted here without touching the rule
 * engine.
 */

interface DayClock { discussionEndsAt?: number; nominationEndsAt?: number }

export function pauseWithClock(state: GameState): void {
  E.pauseGame(state);
  state.__pausedAt = Date.now();
}

export function resumeWithClock(state: GameState): void {
  const pausedAt = Number(state.__pausedAt || 0);
  E.resumeGame(state);
  state.__pausedAt = null;
  if (!pausedAt || !state.day) return;

  const elapsed = Date.now() - pausedAt;
  if (elapsed <= 0) return;

  /* Only deadlines that had time left when the break started are extended —
   * a timer that already ran out stays run out. */
  const day = state.day as DayClock;
  if (day.discussionEndsAt && day.discussionEndsAt > pausedAt) day.discussionEndsAt += elapsed;
  if (day.nominationEndsAt && day.nominationEndsAt > pausedAt) day.nominationEndsAt += elapsed;
}

export interface PauseInfo {
  /** The phase the game will return to — the screen stays on it while paused. */
  from: string;
  at: number;
}

export function pauseInfo(state: GameState): PauseInfo | null {
  if (state.status !== 'PAUSED') return null;
  return {
    from: String(state.__pausedFrom || 'DISCUSSION'),
    at: Number(state.__pausedAt || 0)
  };
}
