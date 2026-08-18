import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { verifyPin } from './storage.ts';

/**
 * Per-game moderator access.
 *
 * The rule from CLAUDE.md still holds: the game id and PIN never travel in a
 * URL. The moderator types the PIN once, and a signed HttpOnly cookie carries
 * the proof afterwards. One cookie lists every game unlocked on this device, so
 * a teacher running two tables back to back does not have to re-enter anything.
 */

const COOKIE = 'uw_session';
const ADMIN_COOKIE = 'uw_admin';
const MAX_GAMES = 10;
const TTL_HOURS = 12;

function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (raw && raw.length >= 16) return new TextEncoder().encode(raw);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ยังไม่ได้ตั้งค่า AUTH_SECRET (ต้องยาวอย่างน้อย 16 ตัวอักษร)');
  }
  /* Development only: a fixed key keeps logins alive across hot reloads. */
  return new TextEncoder().encode('uw-development-secret-do-not-use-in-production');
}

interface SessionPayload { games: string[]; admin?: boolean }

async function sign(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL_HOURS + 'h')
    .sign(secret());
}

async function read(name: string): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(name)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    const games = Array.isArray(payload.games) ? (payload.games as string[]) : [];
    return { games, admin: payload.admin === true };
  } catch {
    return null;
  }
}

async function write(name: string, payload: SessionPayload): Promise<void> {
  const jar = await cookies();
  jar.set(name, await sign(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_HOURS * 3600
  });
}

/** Adds a game to this device's session — call only after the PIN checked out. */
export async function grantModerator(gameId: string): Promise<void> {
  const current = (await read(COOKIE))?.games || [];
  const games = [gameId, ...current.filter((g) => g !== gameId)].slice(0, MAX_GAMES);
  await write(COOKIE, { games });
}

export async function isModerator(gameId: string): Promise<boolean> {
  const session = await read(COOKIE);
  return !!session && session.games.indexOf(gameId) >= 0;
}

/** Verifies a PIN and, on success, unlocks the game for this device. */
export async function loginWithPin(gameId: string, pin: string): Promise<boolean> {
  const ok = await verifyPin(gameId, pin);
  if (ok) await grantModerator(gameId);
  return ok;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export class AuthError extends Error {
  constructor(message = 'ต้องกรอก PIN ผู้ดำเนินเกมก่อน') { super(message); }
}

/** Throws unless this device has already proved it owns the game. */
export async function requireModerator(gameId: string): Promise<void> {
  if (!(await isModerator(gameId))) throw new AuthError();
}

/* ---------------- admin (role catalog) ---------------- */

export async function loginAdmin(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ยังไม่ได้ตั้งค่า ADMIN_PASSWORD');
  if (!password || password !== expected) return false;
  await write(ADMIN_COOKIE, { games: [], admin: true });
  return true;
}

export async function isAdmin(): Promise<boolean> {
  const session = await read(ADMIN_COOKIE);
  return !!session?.admin;
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new AuthError('ต้องเข้าสู่ระบบผู้ดูแลก่อน');
}
