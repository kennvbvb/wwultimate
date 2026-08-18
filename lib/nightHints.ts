import * as E from './engine.generated.js';
import type { GameState, NightStep } from './types.ts';

/**
 * Which targets the current night step will refuse, and why.
 *
 * The engine already rejects these in validateTargets() with a Thai reason, but
 * only after the moderator has tapped a name and waited for a round trip. In a
 * live game that reads as "the app is broken" — the Bodyguard case in
 * particular, where guarding the same player twice running is a rule most
 * tables forget. Greying the name out with the reason underneath says it before
 * the tap.
 *
 * This deliberately mirrors validateTargets() rather than calling it: that
 * function answers "is this whole selection legal", while a screen needs
 * "which single names are off limits right now". Any rule added there must be
 * reflected here — and in the test file that pins the two together.
 *
 * Rules that depend on what is already selected (Big Bad Wolf's adjacent second
 * victim) stay out: they change as the moderator taps, and the step card
 * already spells the requirement out in words.
 */
export function nightTargetHints(
  state: GameState,
  step: NightStep | null
): Record<string, string> {
  const hints: Record<string, string> = {};
  if (!step) return hints;

  const players = state.players as Record<string, unknown>[];
  const wantDead = step.targetRule === 'DEAD_PLAYER';

  /* The engine only enforces actor-relative rules when the step has exactly
   * one actor — a group step like the wolf pack has no single "self". */
  const actor = step.actorIds && step.actorIds.length === 1
    ? players.find((p) => p.playerId === step.actorIds[0])
    : undefined;

  for (const p of players) {
    const playerId = String(p.playerId);

    if (wantDead) {
      if (p.alive) hints[playerId] = 'ยังมีชีวิตอยู่';
      continue;
    }
    if (!p.alive) { hints[playerId] = 'เสียชีวิตแล้ว'; continue; }

    if (actor && playerId === actor.playerId && step.targetRule.indexOf('OTHER') >= 0) {
      hints[playerId] = step.targetRule === 'OTHER_ALIVE_NO_REPEAT_CONSECUTIVE'
        ? 'ป้องกันตนเองไม่ได้'
        : 'เลือกตัวเองไม่ได้';
      continue;
    }

    if (step.targetRule === 'OTHER_ALIVE_NO_REPEAT_CONSECUTIVE' &&
        actor && actor.lastTargetId === playerId) {
      hints[playerId] = 'คุ้มกันคนเดิมสองคืนติดกันไม่ได้';
      continue;
    }

    if (step.targetRule === 'OTHER_ALIVE_NEVER_REPEATED' && actor &&
        Array.isArray(actor.targetsHistory) &&
        (actor.targetsHistory as string[]).indexOf(playerId) >= 0) {
      hints[playerId] = 'เคยเลือกไปแล้ว เลือกซ้ำทั้งเกมไม่ได้';
      continue;
    }

    if (step.targetRule === 'WOLF_VICTIM' && E.isWolfTeam(p)) {
      hints[playerId] = 'อยู่ฝ่ายหมาป่า';
      continue;
    }
  }

  return hints;
}
