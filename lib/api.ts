import { NextResponse } from 'next/server';
import { RateLimitError } from './rateLimit.ts';
import { classifyError } from './errors.ts';

/**
 * One place that turns a thrown Error into a response. Every message the engine
 * throws is already written in Thai for the moderator, so it is passed through
 * untouched — the UI shows it verbatim. The classification itself lives in
 * lib/errors.ts, which has no Next.js imports and can be tested directly.
 */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof RateLimitError) {
    return NextResponse.json({ error: e.message }, {
      status: 429, headers: { 'retry-after': String(e.retryAfterSeconds) }
    });
  }

  const mapped = classifyError(e);
  if (mapped.logDetail) console.error('request failed (' + mapped.status + '):', mapped.logDetail);
  return NextResponse.json({ error: mapped.message }, {
    status: mapped.status,
    ...(mapped.headers ? { headers: mapped.headers } : {})
  });
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
