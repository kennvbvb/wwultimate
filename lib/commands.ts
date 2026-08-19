import * as E from './engine.generated.js';
import { pauseWithClock, resumeWithClock } from './pause.ts';
import { checkPlayerNames } from './players.ts';
import { assertTieChoice, assertVoteReady } from './voting.ts';
import type { Command, GameState } from './types.ts';

/**
 * The command table: one entry per mutation the moderator screen can send.
 *
 * Api.gs had one public function per command; on Vercel that would mean 20
 * nearly identical route files. The table below keeps what actually differed
 * between them — the Thai label written into the undo history, and whether the
 * command is worth a snapshot.
 *
 * `high: true` is the same list of nine commands the Apps Script version used.
 * Changing it silently changes what the undo button can reach, so leave it
 * alone unless the undo behaviour is what you mean to change.
 */
interface Handler {
  label: string;
  high: boolean;
  fn: (state: GameState, cmd: Command) => void;
}

const HANDLERS: Record<string, Handler> = {
  setPlayers: {
    label: 'ตั้งรายชื่อผู้เล่น', high: false,
    fn: (s, c) => {
      /* Trimmed and checked here rather than trusting the screen: the API is
       * reachable directly, and a blank name becomes "ผู้เล่น 7" deep inside
       * the engine where nobody sees it. */
      const { names, duplicates } = checkPlayerNames(c.playerNames || []);
      E.setPlayers(s, names);
      s.__duplicateNames = duplicates;
    }
  },
  configureGame: {
    label: 'ตั้งค่ากติกาและชุดบทบาท', high: false,
    fn: (s, c) => { E.configureGame(s, c as Parameters<typeof E.configureGame>[1]); }
  },
  assignRoles: {
    label: 'บันทึกการแจกบทบาท', high: false,
    fn: (s, c) => { E.assignRoles(s, (c.assignments as Parameters<typeof E.assignRoles>[1]) || []); }
  },
  swapRoles: {
    label: 'สลับบทบาทระหว่างผู้เล่นสองคน', high: false,
    fn: (s, c) => swapRoles(s, String(c.playerA), String(c.playerB))
  },
  startGame: {
    label: 'เริ่มเกม', high: true,
    fn: (s) => { E.startGame(s); }
  },
  /* Tapping the wrong name is the likeliest mistake at a real table, so these
   * two get a snapshot even though they are small steps — without one the undo
   * button can only reach back past the whole night. */
  submitRoleAction: {
    label: 'บันทึกการกระทำกลางคืน', high: true,
    fn: (s, c) => {
      const info = E.submitRoleAction(s, String(c.stepId),
        (c.targetIds as string[]) || [], (c.meta as Record<string, unknown>) || {});
      s.__lastInfo = info;
    }
  },
  skipStep: {
    label: 'ข้ามขั้นตอน', high: true,
    fn: (s, c) => { E.skipStep(s, String(c.stepId)); }
  },
  resolveNight: {
    label: 'สรุปผลกลางคืน', high: true,
    fn: (s) => { E.finishNight(s); }
  },
  resolvePrompt: {
    label: 'ประมวลผลทริกเกอร์การตาย', high: true,
    fn: (s, c) => { E.resolveDeathPrompt(s, String(c.promptId), c.targetId as string | undefined); }
  },
  startDiscussion: {
    label: 'เริ่มช่วงอภิปราย', high: false,
    fn: (s) => { E.startDiscussion(s); }
  },
  openNomination: {
    label: 'เปิดการเสนอชื่อ', high: false,
    fn: (s) => { E.openNomination(s); }
  },
  startNomination: {
    label: 'ปิดการเสนอชื่อ', high: true,
    fn: (s, c) => { E.startNomination(s, (c.nomineeIds as string[]) || []); }
  },
  submitVote: {
    label: 'บันทึกคะแนน', high: false,
    fn: (s, c) => {
      const votes = (c.votes as Record<string, string>) || {};
      for (const voterId of Object.keys(votes)) E.submitVote(s, voterId, votes[voterId]);
    }
  },
  resolveVote: {
    label: 'สรุปผลการลงคะแนน', high: true,
    fn: (s, c) => {
      /* Both guards run inside the command's transaction, so a rejected close
       * leaves the recorded votes exactly as they were. */
      assertVoteReady(s);
      assertTieChoice(s, c.moderatorChoice as string | undefined);
      E.resolveVote(s, c.moderatorChoice as string | undefined);
    }
  },
  forceEndDay: {
    label: 'ปิดวันโดยไม่แขวนคอ', high: true,
    fn: (s) => { E.forceEndDay(s); }
  },
  moderatorKill: {
    label: 'ผู้ดำเนินเกมสั่งให้เสียชีวิต', high: true,
    fn: (s, c) => { E.moderatorKill(s, String(c.playerId), c.reason as string | undefined); }
  },
  pauseGame: {
    label: 'หยุดพักเกม', high: false,
    fn: (s) => { pauseWithClock(s); }
  },
  resumeGame: {
    label: 'เล่นต่อ', high: false,
    fn: (s) => { resumeWithClock(s); }
  },
  endGame: {
    label: 'จบเกม', high: true,
    fn: (s, c) => { E.endGame(s, c.reason as string | undefined); }
  }
};

/**
 * Ported verbatim from apiSwapRoles(): swapping two dealt cards is a moderator
 * correction, not a game rule, so it never belonged in the engine.
 */
function swapRoles(state: GameState, playerA: string, playerB: string): void {
  const a = E.mustPlayer(state, playerA) as Record<string, unknown>;
  const b = E.mustPlayer(state, playerB) as Record<string, unknown>;
  const tmp = { r: a.baseRoleId, h: a.hiddenRoleId };
  a.baseRoleId = b.baseRoleId; a.currentRoleId = b.baseRoleId; a.hiddenRoleId = b.hiddenRoleId;
  b.baseRoleId = tmp.r; b.currentRoleId = tmp.r; b.hiddenRoleId = tmp.h;
  a.baseTeam = a.baseRoleId ? E.getRole(String(a.baseRoleId)).baseTeam : null;
  a.currentTeam = a.baseTeam;
  b.baseTeam = b.baseRoleId ? E.getRole(String(b.baseRoleId)).baseTeam : null;
  b.currentTeam = b.baseTeam;
  a.charges = a.baseRoleId && E.getRole(String(a.baseRoleId)).charges
    ? E.uwClone(E.getRole(String(a.baseRoleId)).charges) : {};
  b.charges = b.baseRoleId && E.getRole(String(b.baseRoleId)).charges
    ? E.uwClone(E.getRole(String(b.baseRoleId)).charges) : {};
}

/** Command names the client may send. Used by the API route and its tests. */
export function listCommands(): string[] {
  return Object.keys(HANDLERS).concat(['undo', 'rematch', 'reopenRoleAssignment']);
}

export { HANDLERS };

