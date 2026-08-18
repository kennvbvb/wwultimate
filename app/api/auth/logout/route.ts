import { logout } from '@/lib/auth.ts';
import { json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await logout();
  return json({ ok: true });
}
