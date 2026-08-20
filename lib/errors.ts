/**
 * Error types and the rules for turning them into an HTTP answer.
 *
 * Deliberately free of Next.js imports so the mapping can be unit tested in
 * plain Node — lib/api.ts is only the thin adapter that builds the response.
 */

/** A rule or input problem, with a Thai message written for the moderator. */
export class GameError extends Error {}

/** The caller has not proved they may touch this game. */
export class AuthError extends Error {
  constructor(message = 'ต้องกรอก PIN ผู้ดำเนินเกมก่อน') { super(message); }
}

export interface ErrorMapping {
  status: number;
  message: string;
  headers?: Record<string, string>;
  /** Set when the real cause belongs in the server log rather than the response. */
  logDetail?: string;
}

/**
 * Postgres and its driver speak English and name hosts and ports. That is
 * exactly what an unauthenticated caller should not receive, and it is not
 * something a teacher could act on either.
 */
function isInfrastructureFailure(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  const code = String(err?.code || '');
  if (/^(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EPIPE|EAI_AGAIN)$/.test(code)) return true;
  /* pg class 08 = connection exception, 57P0x = server shutting down */
  if (/^(08...|57P0.|53300)$/.test(code)) return true;
  return /connect ECONNREFUSED|Connection terminated|terminating connection|timeout expired|ยังไม่ได้ตั้งค่า DATABASE_URL/
    .test(String(err?.message || ''));
}

export function classifyError(e: unknown): ErrorMapping {
  const message = e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่รู้จัก';

  if (isInfrastructureFailure(e)) {
    return {
      status: 503,
      message: 'ระบบเชื่อมต่อฐานข้อมูลไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่',
      headers: { 'retry-after': '5' },
      logDetail: message
    };
  }

  if (e instanceof AuthError) return { status: 401, message };

  /* A stale screen retrying an old command is normal, not a server fault. */
  if (/ข้อมูลไม่ตรงกัน/.test(message)) return { status: 409, message };

  /* Checked before the generic GameError branch: "no such game" is a 404 even
   * though the engine raises it the same way as a rule violation. */
  if (/ไม่พบเกม|ไม่พบผู้เล่น|ไม่พบบทบาท/.test(message)) return { status: 404, message };

  if (e instanceof GameError) return { status: 400, message };

  return { status: 400, message, logDetail: message };
}
