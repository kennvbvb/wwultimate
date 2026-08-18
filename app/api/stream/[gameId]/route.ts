import { readVersion } from '@/lib/storage.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_MS = 1200;
/* Serverless functions are capped, and a stream that dies at an arbitrary point
 * looks like a frozen screen. Closing on purpose lets EventSource reconnect on
 * its own schedule instead. */
const MAX_LIFETIME_MS = 50_000;

/**
 * Tells listeners when a game changed, so the public display stops polling the
 * whole view model every five seconds.
 *
 * Only the version number travels over the stream: the client fetches the view
 * it is entitled to (public or moderator) through the normal route. That way a
 * mistake here can never leak a living player's role onto the wall.
 */
export async function GET(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await ctx.params;
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch { /* already closed by the client */ }
      };

      /* Tell the browser how fast to come back after the deliberate close. */
      controller.enqueue(encoder.encode('retry: 2000\n\n'));

      let lastVersion = -1;
      const tick = async () => {
        if (closed) return;
        try {
          const version = await readVersion(gameId);
          if (version === null) { send('gone', { gameId }); close(); return; }
          if (version !== lastVersion) {
            lastVersion = version;
            send('change', { gameId, version });
          } else {
            /* Proxies drop silent connections; a comment keeps it warm. */
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          }
        } catch {
          close();
          return;
        }
        if (Date.now() - startedAt > MAX_LIFETIME_MS) close();
      };

      const timer = setInterval(tick, POLL_MS);
      req.signal.addEventListener('abort', close);
      await tick();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      /* Nginx-style proxies buffer by default, which would batch every update. */
      'x-accel-buffering': 'no'
    }
  });
}
