import { loginAdmin } from '@/lib/auth.ts';
import { errorResponse, json, readJson } from '@/lib/api.ts';
import { clientKey, enforceRateLimit } from '@/lib/rateLimit.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await enforceRateLimit('adminLogin', clientKey(req));
    const body = await readJson(req);
    if (!(await loginAdmin(String(body.password || '')))) {
      return json({ error: 'รหัสผ่านผู้ดูแลไม่ถูกต้อง' }, 401);
    }
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
