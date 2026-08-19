import {
  runCommand, undoLastCommand, rematch, reopenRoleAssignment, GameError
} from '@/lib/storage.ts';
import { grantModerator, requireModerator } from '@/lib/auth.ts';
import { errorResponse, json, readJson } from '@/lib/api.ts';
import { HANDLERS } from '@/lib/commands.ts';
import type { Command } from '@/lib/types.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every mutation in the app arrives here — see lib/commands.ts for the table. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const action = String(body.action || '');
    const gameId = String(body.gameId || '');
    if (!gameId) throw new GameError('คำสั่งไม่มี gameId');
    await requireModerator(gameId);

    const cmd = body as unknown as Command;

    if (action === 'undo') return json(await undoLastCommand(gameId));

    /* Not a plain mutation: once the game has started this restores the
     * snapshot from before the first night (see lib/storage.ts). */
    if (action === 'reopenRoleAssignment') {
      return json(await reopenRoleAssignment(cmd, body.reason as string | undefined));
    }

    if (action === 'rematch') {
      const created = await rematch(gameId);
      /* The new game belongs to the same moderator — no second PIN prompt. */
      await grantModerator(created.view.gameId);
      return json({ ...created.view, moderatorPin: created.moderatorPin });
    }

    const handler = HANDLERS[action];
    if (!handler) throw new GameError('ไม่รู้จักคำสั่ง ' + action);

    const label = action === 'submitRoleAction'
      ? handler.label + ': ' + String(cmd.stepId || '')
      : action === 'skipStep'
        ? handler.label + ' ' + String(cmd.stepId || '')
        : handler.label;

    return json(await runCommand(cmd, label, handler.high, (state) => handler.fn(state, cmd)));
  } catch (e) {
    return errorResponse(e);
  }
}
