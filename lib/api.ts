import { NextResponse } from 'next/server';
import { AuthError } from './auth.ts';
import { GameError } from './storage.ts';

/**
 * One place that turns a thrown Error into a response. Every message the engine
 * throws is already written in Thai for the moderator, so it is passed through
 * untouched — the UI shows it verbatim.
 */
export function errorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
  if (e instanceof AuthError) return NextResponse.json({ error: message }, { status: 401 });
  /* A stale screen retrying an old command is normal, not a server fault. */
  if (/ข้อมูลไม่ตรงกัน/.test(message)) return NextResponse.json({ error: message }, { status: 409 });
  if (e instanceof GameError) return NextResponse.json({ error: message }, { status: 400 });
  if (/ไม่พบเกม|ไม่พบผู้เล่น|ไม่พบบทบาท/.test(message)) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  console.error('command failed:', e);
  return NextResponse.json({ error: message }, { status: 400 });
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return (body && typeof body === 'object') ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
