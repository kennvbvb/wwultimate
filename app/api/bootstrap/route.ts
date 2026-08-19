import { catalogPayload } from '@/lib/catalog.ts';
import * as E from '@/lib/engine.generated.js';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Everything the first screen needs: role catalog and rule defaults.
 *
 * It deliberately does NOT list games in progress. That list used to be public,
 * which handed anyone who opened the site the id of every running game — the
 * exact thing needed to watch a public display or start guessing PINs. Devices
 * remember their own games locally; an admin can look the rest up.
 */
export async function GET() {
  try {
    const catalog = await catalogPayload();
    return json({
      appName: E.APP_NAME,
      appVersion: E.APP_VERSION,
      catalog,
      defaults: E.defaultRuleVariants()
    });
  } catch (e) {
    return errorResponse(e);
  }
}
