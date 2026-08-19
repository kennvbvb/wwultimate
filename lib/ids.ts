import { randomInt } from 'node:crypto';

/**
 * Game ids and moderator PINs.
 *
 * The engine builds these with Math.random(), which is fine for the seat labels
 * it also generates but not for something that guards access to a game. These
 * replace them at the storage boundary — the engine file stays untouched.
 *
 * The alphabet is the engine's: no O/0, I/1 or similar look-alikes, because a
 * teacher reads the PIN off a phone and types it on another device.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Uniformly distributed — randomInt rejects the biased tail for us. */
export function secureCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

export function secureGameId(): string {
  return 'GAME-' + secureCode(6);
}

/** Two groups of four: ~40 bits, and still readable out loud. */
export function securePin(): string {
  return secureCode(4) + '-' + secureCode(4);
}
