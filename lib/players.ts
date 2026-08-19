/**
 * Player names.
 *
 * The engine accepts whatever it is handed and falls back to "ผู้เล่น N" for a
 * blank. That is fine for the engine and wrong for a classroom: two children
 * called ปอนด์ make the vote screen ambiguous, and the cross-game statistics
 * match people by name, so a stray space silently splits one child into two.
 */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 40;
export const MAX_NAME_LENGTH = 40;

export interface NameCheck {
  names: string[];
  duplicates: string[];
}

/** Collapses whitespace and normalises Unicode so lookalikes compare equal. */
export function normaliseName(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** Case- and space-insensitive key used only for spotting duplicates. */
function duplicateKey(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase('th-TH');
}

export function findDuplicateNames(names: string[]): string[] {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const name of names) {
    const key = duplicateKey(name);
    if (!key) continue;
    if (seen.has(key)) {
      if (duplicates.indexOf(seen.get(key) as string) < 0) duplicates.push(seen.get(key) as string);
    } else {
      seen.set(key, name);
    }
  }
  return duplicates;
}

/**
 * Cleans a submitted roster and refuses the cases that would confuse the
 * moderator later. Duplicates are reported rather than rejected — a class
 * really can have two children with the same first name, and the fix is to add
 * an initial, which the moderator has to decide.
 */
export function checkPlayerNames(raw: unknown): NameCheck {
  if (!Array.isArray(raw)) throw new Error('รายชื่อผู้เล่นไม่ถูกต้อง');

  const names = raw.map(normaliseName);
  if (names.some((n) => !n)) throw new Error('มีชื่อผู้เล่นที่เว้นว่างไว้ กรุณากรอกให้ครบทุกคน');
  if (names.length < MIN_PLAYERS) throw new Error('ต้องมีผู้เล่นอย่างน้อย ' + MIN_PLAYERS + ' คน');
  if (names.length > MAX_PLAYERS) throw new Error('รองรับผู้เล่นไม่เกิน ' + MAX_PLAYERS + ' คน');

  return { names, duplicates: findDuplicateNames(names) };
}
