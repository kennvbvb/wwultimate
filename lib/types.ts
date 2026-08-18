/**
 * Types for the engine's state and view models.
 *
 * The engine is untyped JavaScript by design (see MIGRATION.md §1.1), so these
 * are hand-written from GameService.gs and RuleEngine.gs. They exist to catch
 * misspelled view-model fields in the UI — the single most common bug class on
 * the Apps Script version — not to constrain the engine.
 */

export type Team = 'VILLAGE' | 'WEREWOLF' | 'VAMPIRE' | 'CULT' | 'INDEPENDENT';

export type GameStatus =
  | 'SETUP' | 'ROLE_ASSIGNMENT' | 'FIRST_NIGHT' | 'NIGHT' | 'RESOLVE_NIGHT'
  | 'DAWN' | 'DISCUSSION' | 'NOMINATION' | 'VOTING' | 'RESOLVE_DAY'
  | 'DEATH_TRIGGER' | 'WIN_CHECK' | 'FINISHED' | 'PAUSED';

export type TargetRule =
  | 'NONE' | 'OTHER_ALIVE' | 'OPTIONAL_OTHER_ALIVE' | 'TWO_ALIVE' | 'TWO_OTHER_ALIVE'
  | 'WOLF_VICTIM' | 'OTHER_ALIVE_NO_REPEAT_CONSECUTIVE' | 'OTHER_ALIVE_NEVER_REPEATED'
  | 'DEAD_PLAYER';

export interface RuleVariants {
  roleRevealMode: 'FULL' | 'TEAM_ONLY' | 'NONE';
  tieVoteRule: 'NO_LYNCH' | 'REVOTE' | 'ALL_TIED_DIE' | 'MODERATOR_DECIDES';
  mayorMode: 'ROLE_CARD' | 'ELECTED' | 'DISABLED';
  apprenticeSeerMode: 'INHERIT_ONLY' | 'DOUBLE_CHECK';
  cupidMode: 'STANDARD' | 'TAKES_LEFTOVER_ROLE' | 'MODERATOR_SELECTS';
  doppelgangerMode: string;
  witchMode: 'ONE_HEAL_ONE_KILL' | 'ONE_POWER_TOTAL';
  priestMode: 'BLESSING' | 'DEAD_ROLE_CHECK';
  villageIdiotMode: 'SURVIVES_LYNCH' | 'VOTE_ONLY';
  tannerMode: 'ANY_DEATH' | 'LYNCH_ONLY';
  tannerEndsGame: boolean;
  vampireEnabled: boolean;
  vampireDetectableBySeer: boolean;
  drunkRevealNight: number;
  discussionSeconds: number;
  nightActionSeconds: number;
  nominationSeconds: number;
  randomDelayMs: number;
}

export interface SelectedRole { roleId: string; count: number; }

export interface DeathInfo {
  cause: string;
  causeTh: string;
  night?: number;
  day?: number;
  [k: string]: unknown;
}

/** One entry in the moderator's players list. */
export interface ModeratorPlayer {
  playerId: string;
  seat: number;
  name: string;
  alive: boolean;
  baseRoleId: string | null;
  baseRoleTh: string;
  currentRoleId: string | null;
  currentRoleTh: string;
  hiddenRoleTh: string;
  team: Team | null;
  teamTh: string;
  changedTeam: boolean;
  statuses: string[];
  charges: Record<string, number>;
  linkedPlayerIds: string[];
  deathInfo: DeathInfo | null;
}

export interface NightStep {
  stepId: string;
  roleId: string;
  kind: 'ROLE' | 'GROUP';
  wakePriority: number;
  titleTh: string;
  scriptTh: string;
  noteTh: string;
  actorIds: string[];
  targetRule: TargetRule;
  minTargets: number;
  maxTargets: number;
  optional: boolean;
  requireAdjacentSecond?: boolean;
  status: 'PENDING' | 'DONE' | 'SKIPPED';
  result: unknown;
  choices?: string[];
  [k: string]: unknown;
}

export interface NightView {
  number: number;
  stepIndex: number;
  totalSteps: number;
  steps: NightStep[];
  results: unknown[];
  deaths: unknown[];
  resolved: boolean;
}

export interface DayView {
  number: number;
  nominees: string[];
  votes: Record<string, string>;
  lynchCount: number;
  maxLynches: number;
  discussionEndsAt: number;
  nominationEndsAt: number;
  eligibleVoters: { playerId: string; name: string; weight: number }[];
}

export interface TimelineEntry {
  at: string;
  phase: GameStatus;
  dayNumber: number;
  nightNumber: number;
  icon: string;
  text: string;
}

export interface PendingPrompt {
  promptId: string;
  type: string;
  playerId?: string;
  titleTh: string;
  bodyTh?: string;
  options?: { playerId: string; name: string }[];
  [k: string]: unknown;
}

export interface Winners {
  primaryWinningTeams: Team[];
  individualWinners: { playerId: string; name: string; roleTh: string; reasonTh: string }[];
  reasonTh: string;
  [k: string]: unknown;
}

export interface ImpactSummary {
  total: number;
  verdict: string;
  tone: 'ok' | 'warn';
  /** False until the villageImpact numbers are checked against the printed cards. */
  verified: boolean;
  note: string;
}

export interface ModeratorViewModel {
  mode: 'MODERATOR';
  gameId: string;
  version: number;
  title: string;
  status: GameStatus;
  statusTh: string;
  dayNumber: number;
  nightNumber: number;
  aliveCount: number;
  totalCount: number;
  rolesLocked: boolean;
  ruleVariants: RuleVariants;
  selectedRoles: SelectedRole[];
  players: ModeratorPlayer[];
  assignment: { assigned: number; total: number; remaining: Record<string, number>; readyTh?: string } | null;
  impact: ImpactSummary | null;
  night: NightView | null;
  currentStep: NightStep | null;
  day: DayView | null;
  pendingPrompts: PendingPrompt[];
  timeline: TimelineEntry[];
  winners: Winners | null;
  flags: Record<string, unknown>;
  /** Only present on the screen that creates a game — never persisted to a client. */
  moderatorPin?: string;
}

export interface PublicPlayer {
  playerId: string;
  seat: number;
  name: string;
  alive: boolean;
  roleTh: string;
  teamTh: string;
  causeTh: string;
  badges: string[];
}

export interface PublicViewModel {
  mode: 'PUBLIC';
  gameId: string;
  title: string;
  status: GameStatus;
  statusTh: string;
  dayNumber: number;
  nightNumber: number;
  aliveCount: number;
  totalCount: number;
  players: PublicPlayer[];
  day: Pick<DayView, 'nominees' | 'lynchCount' | 'maxLynches' | 'discussionEndsAt' | 'nominationEndsAt'> | null;
  winners: Winners | null;
  timelinePublic: TimelineEntry[];
  version?: number;
}

export interface CatalogRole {
  roleId: string;
  pack: 'CORE' | 'WOLFPACK' | 'HUNTING_PARTY';
  th: string;
  en: string;
  team: Team;
  teamTh: string;
  villageImpact: number;
  wakePolicy: string;
  complexity: number;
  maxCopies: number;
  noteTh: string;
  enabled: boolean;
}

export interface CatalogViewModel { roles: CatalogRole[]; impactVerified: boolean; }

export interface FinalSummary {
  gameId: string;
  teamsTh: string[];
  individuals: Winners['individualWinners'];
  reasonTh: string;
  players: {
    seat: number; name: string; baseRoleTh: string; finalRoleTh: string;
    teamTh: string; alive: boolean; causeTh: string;
  }[];
  timeline: TimelineEntry[];
}

/** The engine's game state. Deliberately loose: only storage and the engine touch it. */
export interface GameState {
  gameId: string;
  version: number;
  status: GameStatus;
  dayNumber: number;
  nightNumber: number;
  moderatorPin: string;
  title: string;
  ruleVariants: RuleVariants;
  deckProfile: { packs: string[] };
  selectedRoles: SelectedRole[];
  players: Record<string, unknown>[];
  night: Record<string, unknown> | null;
  day: Record<string, unknown> | null;
  flags: Record<string, unknown>;
  timeline: TimelineEntry[];
  winners: Winners | null;
  rolesLocked: boolean;
  createdAt: string;
  updatedAt: string;
  __events?: GameEvent[];
  [k: string]: unknown;
}

export interface GameEvent {
  seq: number;
  at: string;
  type: string;
  dayNumber: number;
  nightNumber: number;
  payload: unknown;
}

/** Every mutation arrives shaped like this (spec 10). */
export interface Command {
  gameId: string;
  expectedVersion?: number;
  idempotencyKey?: string;
  action: string;
  [k: string]: unknown;
}

export interface RoleOverrideRow {
  roleId: string;
  displayNameTh?: string | null;
  villageImpact?: number | null;
  maxCopies?: number | null;
  enabled?: boolean | null;
  noteTh?: string | null;
}
