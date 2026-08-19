import type { ModeratorViewModel } from '../types.ts';

/**
 * The one-line summaries the moderator reads out loud.
 *
 * All of this could be dug out of the screen, but in a real game the moderator
 * is looking at the table, not the phone — the result of a night, a seer's
 * answer or a lynch has to interrupt them, not wait to be noticed.
 *
 * Everything here is derived from the view model, so the wording stays the
 * engine's: these helpers never decide what happened, only how to say it.
 */

export interface Announcement {
  title: string;
  icon: string;
  lines: string[];
}

function playerLabel(vm: ModeratorViewModel, playerId: string): string {
  const player = vm.players.find((p) => p.playerId === playerId);
  return player ? player.name + ' (ที่นั่ง ' + player.seat + ')' : playerId;
}

/** What the role reveal rule allows to be said about a dead player. */
function revealSuffix(vm: ModeratorViewModel, playerId: string): string {
  const player = vm.players.find((p) => p.playerId === playerId);
  if (!player) return '';
  const mode = vm.ruleVariants.roleRevealMode;
  if (mode === 'FULL' && player.currentRoleTh) return ' • ' + player.currentRoleTh;
  if (mode === 'TEAM_ONLY' && player.teamTh) return ' • ฝ่าย' + player.teamTh;
  return '';
}

function deathIds(vm: ModeratorViewModel): string[] {
  const raw = (vm.night?.deaths || []) as (string | { playerId: string })[];
  return raw.map((d) => (typeof d === 'string' ? d : d.playerId));
}

/** Who died overnight — shown the moment the night is resolved. */
export function nightDeathAnnouncement(vm: ModeratorViewModel): Announcement {
  const ids = deathIds(vm);
  /* A death trigger (the Hunter's shot) fires before dawn, so the day number
   * has not moved yet — announcing "รุ่งเช้าวันที่ 0" would be nonsense. */
  const pending = vm.pendingPrompts.length > 0 || vm.status === 'DEATH_TRIGGER';
  const title = pending ? 'สรุปผลคืนที่ ' + vm.nightNumber : 'รุ่งเช้าวันที่ ' + vm.dayNumber;

  const lines = ids.length
    ? ids.map((id) => {
      const player = vm.players.find((p) => p.playerId === id);
      const cause = player?.deathInfo?.causeTh ? ' — ' + player.deathInfo.causeTh : '';
      return playerLabel(vm, id) + cause + revealSuffix(vm, id);
    })
    : ['คืนที่ผ่านมาไม่มีผู้เสียชีวิต'];

  if (pending) lines.push('ยังมีผลกระทบจากการเสียชีวิตที่ต้องจัดการก่อนเข้าสู่กลางวัน');

  return {
    title: ids.length ? title + ' — เสียชีวิต ' + ids.length + ' คน' : title,
    icon: ids.length ? '💀' : '🌅',
    lines
  };
}

/**
 * The answer a role just got: the seer's nod or shake, the P.I.'s reading, the
 * masons' names. The engine writes these sentences; this only picks the new one.
 */
export function stepResultAnnouncement(
  before: ModeratorViewModel | null, after: ModeratorViewModel
): Announcement | null {
  const seen = before?.night?.results.length || 0;
  const results = (after.night?.results || []) as { titleTh: string; infoTh: string }[];
  if (results.length <= seen) return null;

  const fresh = results[results.length - 1];
  if (!fresh || !fresh.infoTh) return null;
  return { title: fresh.titleTh, icon: '🔮', lines: [fresh.infoTh] };
}

/** Whether the vote actually hanged anybody, and what happened instead if not. */
export function lynchAnnouncement(
  before: ModeratorViewModel | null, after: ModeratorViewModel
): Announcement {
  const wasAlive = new Set(
    (before?.players || []).filter((p) => p.alive).map((p) => p.playerId));
  const newlyDead = after.players.filter((p) => !p.alive && wasAlive.has(p.playerId));

  /* Prince and Village Idiot survive a lynch, so the timeline is the only place
   * that says what happened to them. */
  const seen = before?.timeline.length || 0;
  const notable = after.timeline.slice(seen)
    .filter((t) => ['rope', 'peace', 'crown', 'jester'].indexOf(t.icon) >= 0)
    .map((t) => t.text);

  if (!newlyDead.length) {
    return {
      title: 'ไม่มีใครถูกแขวนคอ',
      icon: '🕊️',
      lines: notable.length ? notable : ['ผลการลงคะแนนไม่ทำให้ใครถูกแขวนคอ']
    };
  }

  return {
    title: newlyDead.length === 1 ? 'ถูกแขวนคอ' : 'ถูกแขวนคอ ' + newlyDead.length + ' คน',
    icon: '⚰️',
    lines: newlyDead
      .map((p) => playerLabel(after, p.playerId) +
        (p.deathInfo?.causeTh ? ' — ' + p.deathInfo.causeTh : '') +
        revealSuffix(after, p.playerId))
      .concat(notable.filter((line) => !newlyDead.some((p) => line.indexOf(p.name) >= 0)))
  };
}
