import { requireAdmin } from '@/lib/auth.ts';
import { retentionSummary, runCleanup } from '@/lib/retention.ts';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    return json(await retentionSummary());
  } catch (e) {
    return errorResponse(e);
  }
}

/** Runs the cleanup now. Nothing here is scheduled — a school sets its own rhythm. */
export async function POST() {
  try {
    await requireAdmin();
    const result = await runCleanup();
    return json({ ...result, summary: await retentionSummary() });
  } catch (e) {
    return errorResponse(e);
  }
}
