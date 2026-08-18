/**
 * Types for lib/engine.generated.js, which scripts/build-engine.mjs produces
 * from lib/engine/*.gs. The .js file is gitignored; this declaration is not, so
 * type-checking works on a fresh clone before the first build.
 *
 * Keep in sync with the EXPORTS list in scripts/build-engine.mjs.
 */
import type {
  GameState, ModeratorViewModel, PublicViewModel, CatalogViewModel, FinalSummary,
  RuleVariants, NightStep, ImpactSummary, RoleOverrideRow, Team, SelectedRole
} from './types';

export const APP_NAME: string;
export const APP_VERSION: string;
export const CAUSE: Record<string, string>;
export const CAUSE_TH: Record<string, string>;
export const EVENT_SOFT_LIMIT: number;
export const MAX_DEATH_QUEUE_ITERATIONS: number;
export const ST: Record<string, string>;
export const STATUS: Record<string, string>;
export const TEAM: Record<string, Team>;
export const TEAM_TH: Record<string, string>;
export const VILLAGE_IMPACT_VERIFIED: boolean;

export interface RoleDef {
  roleId: string;
  pack: 'CORE' | 'WOLFPACK' | 'HUNTING_PARTY';
  displayNameTh: string;
  displayNameEn: string;
  baseTeam: Team;
  villageImpact: number;
  maxCopies: number;
  wakePolicy: string;
  wakePriority?: number;
  complexity: number;
  noteTh: string;
  enabled: boolean;
  [k: string]: unknown;
}

export interface ValidationResult {
  problems: string[];
  warnings: string[];
  totalCards: number;
  wolves: number;
}

/* ---- setup ---- */
export function createGameState(payload: { playerNames?: string[]; title?: string; deckProfile?: { packs: string[] } }): GameState;
export function addPlayer(state: GameState, name: string): Record<string, unknown>;
export function setPlayers(state: GameState, names: string[]): GameState;
export function configureGame(state: GameState, payload: {
  ruleVariants?: Partial<RuleVariants>; deckProfile?: { packs: string[] };
  selectedRoles?: SelectedRole[]; title?: string;
}): GameState;
export function deckRemaining(state: GameState): Record<string, number>;
export function assignRoles(state: GameState, assignments: { playerId: string; roleId: string | null; hiddenRoleId?: string | null }[]): GameState;
export function assignmentStatus(state: GameState): { assigned: number; total: number; remaining: Record<string, number>; readyTh?: string };
export function reopenRoleAssignment(state: GameState, reason?: string): GameState;
export function startGame(state: GameState): GameState;

/* ---- night ---- */
export function buildNightSteps(state: GameState): NightStep[];
export function startNight(state: GameState): GameState;
export function currentStep(state: GameState): NightStep | null;
export function findStep(state: GameState, stepId: string): NightStep | null;
export function advanceStep(state: GameState): GameState;
export function submitRoleAction(state: GameState, stepId: string, targetIds?: string[], meta?: Record<string, unknown>): Record<string, unknown>;
export function skipStep(state: GameState, stepId: string): GameState;
export function finishNight(state: GameState): GameState;
export function resolveNight(state: GameState): GameState;
export function afterResolution(state: GameState): GameState;

/* ---- day ---- */
export function startDiscussion(state: GameState): GameState;
export function openNomination(state: GameState): GameState;
export function startNomination(state: GameState, nomineeIds: string[]): GameState;
export function submitVote(state: GameState, voterId: string, choice: string): GameState;
export function tallyVotes(state: GameState): Record<string, unknown>;
export function resolveVote(state: GameState, moderatorChoice?: string): GameState;
export function forceEndDay(state: GameState): GameState;
export function endDayAndStartNight(state: GameState): GameState;
export function eligibleVoters(state: GameState): Record<string, unknown>[];
export function voteWeight(state: GameState, player: Record<string, unknown>): number;

/* ---- deaths / effects ---- */
export function attemptKill(state: GameState, playerId: string, cause: string, meta?: Record<string, unknown>): boolean;
export function enqueueDeath(state: GameState, playerId: string, cause: string, meta?: Record<string, unknown>): void;
export function processDeathQueue(state: GameState): GameState;
export function resolveDeathPrompt(state: GameState, promptId: string, targetId?: string): GameState;
export function resolvePrompt(state: GameState, promptId: string, targetId?: string): GameState;
export function moderatorKill(state: GameState, playerId: string, reason?: string): GameState;

/* ---- lifecycle ---- */
export function pauseGame(state: GameState): GameState;
export function resumeGame(state: GameState): GameState;
export function endGame(state: GameState, reason?: string): GameState;
export function evaluateWin(state: GameState): Record<string, unknown> | null;
export function winTeamLabel(team: string): string;

/* ---- catalog ---- */
export function listRoles(): RoleDef[];
export function getRole(roleId: string): RoleDef;
export function hasRoleDef(roleId: string): boolean;
export function roleDisplay(roleId: string): string;
export function applyCatalogOverrides(rows: RoleOverrideRow[]): number;
export function catalogViewModel(): CatalogViewModel;
export function villageImpactSummary(state: GameState): ImpactSummary;

/* ---- validation ---- */
export function validateRoleSelection(state: GameState): ValidationResult;
export function validateTargets(state: GameState, step: NightStep, targetIds: string[]): void;
export function validateVote(state: GameState, voterId: string, choice: string): void;
export function assertVersion(state: GameState, expected?: number | string | null): boolean;

/* ---- view models ---- */
export function moderatorViewModel(state: GameState): ModeratorViewModel;
export function publicViewModel(state: GameState): PublicViewModel;
export function finalSummary(state: GameState): FinalSummary;
export function statusLabel(status: string): string;
export function defaultRuleVariants(): RuleVariants;

/* ---- player helpers ---- */
export function findPlayer(state: GameState, playerId: string): Record<string, unknown> | null;
export function mustPlayer(state: GameState, playerId: string): Record<string, unknown>;
export function alivePlayers(state: GameState): Record<string, unknown>[];
export function playersWithRole(state: GameState, roleId: string, aliveOnly?: boolean): Record<string, unknown>[];
export function anyAliveWithRole(state: GameState, roleId: string): boolean;
export function anyPlayerHadRole(state: GameState, roleId: string): boolean;
export function seatOrder(state: GameState): Record<string, unknown>[];
export function livingNeighbours(state: GameState, playerId: string): Record<string, unknown>[];
export function neighboursForPI(state: GameState, playerId: string): Record<string, unknown>[];
export function hasStatus(player: Record<string, unknown>, status: string): boolean;
export function addStatus(player: Record<string, unknown>, status: string): void;
export function removeStatus(player: Record<string, unknown>, status: string): void;
export function detectedTeam(state: GameState, player: Record<string, unknown>): string;
export function isThreatToSeer(state: GameState, player: Record<string, unknown>): boolean;
export function isWolfTeam(player: Record<string, unknown>): boolean;
export function isCultMember(player: Record<string, unknown>): boolean;

/* ---- events / timeline ---- */
export function emit(state: GameState, type: string, payload?: unknown): void;
export function timeline(state: GameState, icon: string, textTh: string): void;

/* ---- small utilities ---- */
export function uwClone<T>(value: T): T;
export function uwContains(arr: unknown[], value: unknown): boolean;
export function uwEscape(text: string): string;
export function uwGameId(): string;
export function uwNow(): string;
export function uwPin(): string;
export function uwPush(arr: unknown[], value: unknown): unknown[];
export function uwRandomId(length?: number): string;
export function uwRemove(arr: unknown[], value: unknown): unknown[];
export function uwUnique(arr: unknown[]): unknown[];
