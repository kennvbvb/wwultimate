import { catalogPayload } from '@/lib/catalog.ts';
import { listOpenGames } from '@/lib/storage.ts';
import * as E from '@/lib/engine.generated.js';
import { errorResponse, json } from '@/lib/api.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the first screen needs: role catalog, rule defaults, open games. */
export async function GET() {
  try {
    const catalog = await catalogPayload();
    return json({
      appName: E.APP_NAME,
      appVersion: E.APP_VERSION,
      catalog,
      defaults: E.defaultRuleVariants(),
      openGames: await listOpenGames()
    });
  } catch (e) {
    return errorResponse(e);
  }
}
