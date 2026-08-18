import type { RuleVariants } from '../types.ts';

/**
 * The 18 rule variants, as the moderator sees them.
 *
 * Every entry here has real engine support behind it and a test that proves it
 * (CLAUDE.md §6). Adding a row without both is how this project once ended up
 * with eight buttons that did nothing — don't.
 *
 * cupidMode.TAKES_LEFTOVER_ROLE stays out on purpose: the app never learns
 * which cards are left in the box, so it could not honour that rule.
 */

export interface ChoiceVariant {
  key: keyof RuleVariants;
  label: string;
  options: [string, string][];
}

export interface BoolVariant { key: keyof RuleVariants; label: string }

export interface NumberVariant {
  key: keyof RuleVariants;
  label: string;
  min: number;
  max: number;
}

export const CHOICE_VARIANTS: ChoiceVariant[] = [
  { key: 'roleRevealMode', label: 'เปิดเผยบทบาทของผู้ที่ตาย',
    options: [['FULL', 'เปิดบทบาทเต็ม'], ['TEAM_ONLY', 'บอกเฉพาะฝ่าย'], ['NONE', 'ไม่เปิดเผย']] },
  { key: 'tieVoteRule', label: 'เมื่อคะแนนเสมอ',
    options: [['NO_LYNCH', 'ไม่แขวนใคร'], ['REVOTE', 'ลงคะแนนใหม่'],
              ['ALL_TIED_DIE', 'แขวนทุกคนที่เสมอ'], ['MODERATOR_DECIDES', 'ผู้ดำเนินเกมตัดสิน']] },
  { key: 'mayorMode', label: 'นายกเทศมนตรี',
    options: [['ROLE_CARD', 'ใช้การ์ดบทบาท'], ['ELECTED', 'เลือกตั้งในเกม'], ['DISABLED', 'ปิดใช้งาน']] },
  { key: 'apprenticeSeerMode', label: 'ผู้หยั่งรู้ฝึกหัด',
    options: [['INHERIT_ONLY', 'รับช่วงแล้วตรวจคืนละคน'], ['DOUBLE_CHECK', 'คืนที่รับช่วงตรวจได้สองคน']] },
  { key: 'cupidMode', label: 'กามเทพ',
    options: [['STANDARD', 'ใช้การ์ดกามเทพ'], ['MODERATOR_SELECTS', 'ผู้ดำเนินเกมจับคู่เอง ไม่ใช้การ์ด']] },
  { key: 'doppelgangerMode', label: 'ดอพเพลแกงเกอร์',
    options: [['INHERIT_ON_TARGET_DEATH', 'เห็นการ์ดต้นแบบตั้งแต่คืนแรก'],
              ['BLIND_INHERIT', 'ไม่เห็นการ์ด รู้เมื่อต้นแบบตาย']] },
  { key: 'witchMode', label: 'แม่มด',
    options: [['ONE_HEAL_ONE_KILL', 'ยาชุบชีวิต 1 + ยาพิษ 1'], ['ONE_POWER_TOTAL', 'ใช้พลังได้ครั้งเดียว']] },
  { key: 'priestMode', label: 'นักบวช',
    options: [['BLESSING', 'ให้พรคุ้มครอง (ใช้ครั้งเดียว)'], ['DEAD_ROLE_CHECK', 'ตรวจบทบาทผู้ตายได้ทุกคืน']] },
  { key: 'villageIdiotMode', label: 'คนโง่ประจำหมู่บ้าน',
    options: [['SURVIVES_LYNCH', 'รอดจากการแขวน แต่โหวตไม่ได้อีก'], ['VOTE_ONLY', 'เสียสิทธิ์โหวตเท่านั้น']] },
  { key: 'tannerMode', label: 'คนบ้าชนะเมื่อ',
    options: [['LYNCH_ONLY', 'ถูกโหวตแขวนคอเท่านั้น'], ['ANY_DEATH', 'ตายด้วยวิธีใดก็ได้']] }
];

export const BOOL_VARIANTS: BoolVariant[] = [
  { key: 'tannerEndsGame', label: 'คนบ้าชนะแล้วจบเกมทันที' },
  { key: 'vampireEnabled', label: 'เปิดใช้แวมไพร์' },
  { key: 'vampireDetectableBySeer', label: 'ผู้หยั่งรู้เห็นแวมไพร์เป็นภัย' }
];

export const NUMBER_VARIANTS: NumberVariant[] = [
  { key: 'drunkRevealNight', label: 'คนเมารู้ตัวในคืนที่', min: 2, max: 6 },
  { key: 'discussionSeconds', label: 'เวลาอภิปราย (วินาที)', min: 30, max: 900 },
  { key: 'nominationSeconds', label: 'เวลาเสนอชื่อ (วินาที)', min: 30, max: 600 },
  { key: 'nightActionSeconds', label: 'เวลาต่อขั้นตอนกลางคืน (วินาที)', min: 0, max: 180 },
  { key: 'randomDelayMs', label: 'หน่วงสุ่มตอนข้ามขั้นตอน (มิลลิวินาที)', min: 0, max: 3000 }
];

export const TEAM_GROUPS: { key: string; th: string; icon: string }[] = [
  { key: 'VILLAGE', th: 'ฝ่ายชาวบ้าน', icon: '🏠' },
  { key: 'WEREWOLF', th: 'ฝ่ายหมาป่า', icon: '🐺' },
  { key: 'VAMPIRE', th: 'ฝ่ายแวมไพร์', icon: '🦇' },
  { key: 'CULT', th: 'ฝ่ายลัทธิ', icon: '🔥' },
  { key: 'INDEPENDENT', th: 'ฝ่ายอิสระ', icon: '🎭' }
];
