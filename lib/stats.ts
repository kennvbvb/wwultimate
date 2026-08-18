import * as E from './engine.generated.js';
import type { GameState, Team } from './types.ts';

/**
 * Cross-game statistics for the teacher.
 *
 * Only finished games are counted. A game still in progress would expose the
 * roles of players who are alive right now, and the whole point of the public
 * screen rules is that nothing outside the moderator's phone knows those.
 *
 * Players are matched by name, because the app has no notion of a person across
 * games — a class list is stable enough for that, and the screen says so.
 */

export interface FinishedGameRow {
  gameId: string;
  title: string;
  finishedAt: string;
  state: GameState;
}

export interface StatsPlayerRow {
  name: string;
  games: number;
  survived: number;
  wins: number;
  wolfGames: number;
}

export interface StatsRoleRow {
  roleId: string;
  roleTh: string;
  teamTh: string;
  used: number;
  survived: number;
  wins: number;
}

export interface StatsGameRow {
  gameId: string;
  title: string;
  finishedAt: string;
  players: number;
  days: number;
  winnersTh: string;
}

export interface Stats {
  games: number;
  totalPlayerSeats: number;
  averagePlayers: number;
  averageDays: number;
  teamWins: { team: string; teamTh: string; wins: number; share: number }[];
  players: StatsPlayerRow[];
  roles: StatsRoleRow[];
  recent: StatsGameRow[];
}

interface StatePlayer {
  playerId: string;
  name: string;
  alive: boolean;
  baseRoleId: string | null;
  currentRoleId: string | null;
  currentTeam: Team | null;
}

function playersOf(state: GameState): StatePlayer[] {
  return (state.players as unknown as StatePlayer[]) || [];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildStats(rows: FinishedGameRow[]): Stats {
  const teamWins: Record<string, number> = {};
  const players: Record<string, StatsPlayerRow> = {};
  const roles: Record<string, StatsRoleRow> = {};
  const recent: StatsGameRow[] = [];

  let seats = 0;
  let days = 0;

  for (const row of rows) {
    const state = row.state;
    const list = playersOf(state);
    const winners = state.winners;
    const winningTeams: string[] = winners ? winners.primaryWinningTeams : [];
    const individualIds = new Set(
      (winners?.individualWinners || []).map((w) => String(w.playerId)));

    seats += list.length;
    days += Number(state.dayNumber || 0);

    recent.push({
      gameId: row.gameId,
      title: row.title || row.gameId,
      finishedAt: row.finishedAt,
      players: list.length,
      days: Number(state.dayNumber || 0),
      winnersTh: winningTeams.length
        ? winningTeams.map((t) => E.winTeamLabel(t)).join(' + ')
        : (individualIds.size ? 'ผู้ชนะเดี่ยว' : 'ไม่มีผู้ชนะ')
    });

    for (const team of winningTeams) teamWins[team] = (teamWins[team] || 0) + 1;

    for (const p of list) {
      const won = (p.currentTeam !== null && winningTeams.indexOf(p.currentTeam) >= 0) ||
        individualIds.has(p.playerId);

      const name = String(p.name || '').trim() || '(ไม่มีชื่อ)';
      const entry = players[name] || (players[name] = {
        name, games: 0, survived: 0, wins: 0, wolfGames: 0
      });
      entry.games++;
      if (p.alive) entry.survived++;
      if (won) entry.wins++;
      if (p.currentTeam === 'WEREWOLF') entry.wolfGames++;

      /* The card the player was dealt, not what they were converted into —
       * "how often does the Seer survive" is a question about the card. */
      const roleId = p.baseRoleId;
      if (!roleId || !E.hasRoleDef(roleId)) continue;
      const def = E.getRole(roleId);
      const roleRow = roles[roleId] || (roles[roleId] = {
        roleId,
        roleTh: def.displayNameTh,
        teamTh: (E.TEAM_TH as Record<string, string>)[def.baseTeam] || '',
        used: 0, survived: 0, wins: 0
      });
      roleRow.used++;
      if (p.alive) roleRow.survived++;
      if (won) roleRow.wins++;
    }
  }

  const totalWins = Object.values(teamWins).reduce((a, b) => a + b, 0);

  return {
    games: rows.length,
    totalPlayerSeats: seats,
    averagePlayers: rows.length ? round1(seats / rows.length) : 0,
    averageDays: rows.length ? round1(days / rows.length) : 0,
    teamWins: Object.keys(teamWins)
      .map((team) => ({
        team,
        teamTh: E.winTeamLabel(team),
        wins: teamWins[team],
        share: totalWins ? Math.round((teamWins[team] / totalWins) * 100) : 0
      }))
      .sort((a, b) => b.wins - a.wins),
    players: Object.values(players).sort((a, b) => b.games - a.games || b.wins - a.wins),
    roles: Object.values(roles).sort((a, b) => b.used - a.used),
    recent: recent.slice(0, 20)
  };
}
