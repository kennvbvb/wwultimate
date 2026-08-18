'use client';

import { useEffect, useRef } from 'react';

/**
 * Watches a game for changes.
 *
 * SSE carries only the version number, so the hook re-fetches through the
 * caller's own endpoint and never sees data it is not entitled to. If the
 * stream cannot be established — proxy, sleeping laptop, flaky school wifi —
 * it falls back to polling, because a frozen classroom screen is the one
 * failure mode that ruins a lesson.
 */
export function useGameStream(
  gameId: string | null,
  currentVersion: number,
  onChange: (version: number) => void,
  pollMs = 5000
): void {
  const versionRef = useRef(currentVersion);
  const changeRef = useRef(onChange);
  versionRef.current = currentVersion;
  changeRef.current = onChange;

  useEffect(() => {
    if (!gameId) return;
    let closed = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const bump = (version: number) => {
      if (closed) return;
      if (version > versionRef.current) changeRef.current(version);
    };

    const startPolling = () => {
      if (pollTimer || closed) return;
      pollTimer = setInterval(() => {
        fetch('/api/public/' + encodeURIComponent(gameId))
          .then((r) => (r.ok ? r.json() : null))
          .then((v) => { if (v && typeof v.version === 'number') bump(v.version); })
          .catch(() => { /* keep trying on the next tick */ });
      }, pollMs);
    };

    const stopPolling = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };

    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/stream/' + encodeURIComponent(gameId));
      source.addEventListener('change', (e) => {
        stopPolling();
        try { bump(JSON.parse((e as MessageEvent).data).version); } catch { /* ignore */ }
      });
      source.addEventListener('gone', () => { closed = true; source?.close(); });
      source.onerror = () => {
        /* EventSource retries by itself; polling covers the gap meanwhile. */
        startPolling();
      };
    };

    connect();
    return () => {
      closed = true;
      stopPolling();
      source?.close();
    };
  }, [gameId, pollMs]);
}
