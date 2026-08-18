import { gameStats } from '@/lib/storage.ts';
import { requireAdmin } from '@/lib/auth.ts';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Behind the admin password on purpose: the numbers are built from finished
 * games, which name who held which card. Fine for the teacher, not for a
 * student who guesses the URL.
 */
export async function GET() {
  try {
    await requireAdmin();
    return json(await gameStats());
  } catch (e) {
    return errorResponse(e);
  }
}
