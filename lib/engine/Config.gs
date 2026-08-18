/**
 * Config.gs
 * Global constants for the Ultimate Werewolf: Deluxe moderator web app.
 * No secrets here. Spreadsheet ID lives in Script Properties (key: SPREADSHEET_ID).
 */

var APP_NAME = 'Ultimate Werewolf — Moderator Console';
var APP_VERSION = '1.0.0';

/** Sheet tab names (spec 9.4) */
var SHEETS = {
  GAMES: 'Games',
  PLAYERS: 'Players',
  EVENTS: 'Events',
  SNAPSHOTS: 'Snapshots',
  ROLE_CATALOG: 'RoleCatalog',
  SETTINGS: 'Settings'
};

/** Script Properties keys */
var PROP = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  APP_SECRET: 'APP_SECRET'
};

/** Game status values (spec 5) */
var STATUS = {
  SETUP: 'SETUP',
  ROLE_ASSIGNMENT: 'ROLE_ASSIGNMENT',
  FIRST_NIGHT: 'FIRST_NIGHT',
  NIGHT: 'NIGHT',
  RESOLVE_NIGHT: 'RESOLVE_NIGHT',
  DAWN: 'DAWN',
  DISCUSSION: 'DISCUSSION',
  NOMINATION: 'NOMINATION',
  VOTING: 'VOTING',
  RESOLVE_DAY: 'RESOLVE_DAY',
  DEATH_TRIGGER: 'DEATH_TRIGGER',
  WIN_CHECK: 'WIN_CHECK',
  FINISHED: 'FINISHED',
  PAUSED: 'PAUSED'
};

/** Teams */
var TEAM = {
  VILLAGE: 'VILLAGE',
  WEREWOLF: 'WEREWOLF',
  VAMPIRE: 'VAMPIRE',
  CULT: 'CULT',
  INDEPENDENT: 'INDEPENDENT'
};

var TEAM_TH = {
  VILLAGE: 'หมู่บ้าน',
  WEREWOLF: 'หมาป่า',
  VAMPIRE: 'แวมไพร์',
  CULT: 'ลัทธิ',
  INDEPENDENT: 'อิสระ'
};

/** Player statuses stacked on top of a role (spec 3.4) */
var ST = {
  SOULMATE: 'SOULMATE',
  CULT_MEMBER: 'CULT_MEMBER',
  BLESSED: 'BLESSED',
  MUTED: 'MUTED',
  EXILED: 'EXILED',
  DELAYED_DEATH: 'DELAYED_DEATH',
  COMPANION: 'COMPANION',
  FEARED: 'FEARED',
  VAMPIRE_BITTEN: 'VAMPIRE_BITTEN',
  PRINCE_SAVED: 'PRINCE_SAVED',
  IDIOT_REVEALED: 'IDIOT_REVEALED',
  DOPPEL_TARGET: 'DOPPEL_TARGET',
  HOODLUM_MARK: 'HOODLUM_MARK',
  CANNOT_VOTE: 'CANNOT_VOTE'
};

/** Causes of death */
var CAUSE = {
  WOLF_ATTACK: 'WOLF_ATTACK',
  VAMPIRE_BITE: 'VAMPIRE_BITE',
  WITCH_KILL: 'WITCH_KILL',
  HUNTRESS_KILL: 'HUNTRESS_KILL',
  REVEALER_BACKFIRE: 'REVEALER_BACKFIRE',
  REVEALER_KILL: 'REVEALER_KILL',
  LYNCH: 'LYNCH',
  HUNTER_SHOT: 'HUNTER_SHOT',
  MAD_BOMBER: 'MAD_BOMBER',
  SOULMATE_GRIEF: 'SOULMATE_GRIEF',
  DIRE_WOLF_GRIEF: 'DIRE_WOLF_GRIEF',
  VIRGINIA_FEAR: 'VIRGINIA_FEAR',
  TOUGH_GUY_DELAYED: 'TOUGH_GUY_DELAYED',
  GHOST_SACRIFICE: 'GHOST_SACRIFICE',
  MODERATOR: 'MODERATOR'
};

var CAUSE_TH = {
  WOLF_ATTACK: 'ถูกหมาป่าโจมตี',
  VAMPIRE_BITE: 'ถูกแวมไพร์กัด',
  WITCH_KILL: 'ถูกแม่มดวางยา',
  HUNTRESS_KILL: 'ถูกนักล่าสังหาร',
  REVEALER_BACKFIRE: 'เปิดโปงผิดคน',
  REVEALER_KILL: 'ถูกเปิดโปงว่าเป็นหมาป่า',
  LYNCH: 'ถูกหมู่บ้านแขวนคอ',
  HUNTER_SHOT: 'ถูกนายพรานยิง',
  MAD_BOMBER: 'ถูกระเบิดของมือระเบิด',
  SOULMATE_GRIEF: 'ตรอมใจตายตามคู่แท้',
  DIRE_WOLF_GRIEF: 'ตายตามคู่หู',
  VIRGINIA_FEAR: 'ตายด้วยความหวาดกลัว',
  TOUGH_GUY_DELAYED: 'บาดแผลจากคืนก่อน',
  GHOST_SACRIFICE: 'สิ้นใจในคืนแรก',
  MODERATOR: 'ผู้ดำเนินเกมกำหนด'
};

/** Default rule variants (spec 4) */
function defaultRuleVariants() {
  return {
    roleRevealMode: 'FULL',              // FULL | TEAM_ONLY | NONE
    tieVoteRule: 'NO_LYNCH',             // NO_LYNCH | REVOTE | ALL_TIED_DIE | MODERATOR_DECIDES
    mayorMode: 'ROLE_CARD',              // ROLE_CARD | ELECTED | DISABLED
    apprenticeSeerMode: 'INHERIT_ONLY',  // INHERIT_ONLY | DOUBLE_CHECK
    cupidMode: 'STANDARD',               // STANDARD | TAKES_LEFTOVER_ROLE | MODERATOR_SELECTS
    doppelgangerMode: 'INHERIT_ON_TARGET_DEATH',
    witchMode: 'ONE_HEAL_ONE_KILL',      // ONE_HEAL_ONE_KILL | ONE_POWER_TOTAL
    priestMode: 'BLESSING',              // BLESSING | DEAD_ROLE_CHECK
    villageIdiotMode: 'SURVIVES_LYNCH',  // SURVIVES_LYNCH | VOTE_ONLY
    tannerMode: 'LYNCH_ONLY',            // ANY_DEATH | LYNCH_ONLY
    tannerEndsGame: true,
    vampireEnabled: false,
    vampireDetectableBySeer: false,      // does Seer/P.I. read Vampire as a threat
    drunkRevealNight: 3,
    discussionSeconds: 300,
    nightActionSeconds: 45,
    nominationSeconds: 120,
    randomDelayMs: 900
  };
}

/** Guard against runaway cascade loops in the death queue */
var MAX_DEATH_QUEUE_ITERATIONS = 300;

/** Rows kept per game in the Events tab before trimming warning */
var EVENT_SOFT_LIMIT = 4000;
