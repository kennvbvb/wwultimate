'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PublicViewModel } from '@/lib/types.ts';
import { getPublic } from '@/lib/client/api.ts';
import { useGameStream } from '@/lib/client/useGameStream.ts';

/**
 * The screen on the classroom wall.
 *
 * It only ever reads /api/public, which returns publicViewModel — a living
 * player's role must never appear here, whatever else changes (CLAUDE.md §11).
 */
export default function PublicScreen({ gameId }: { gameId: string }) {
  const [view, setView] = useState<PublicViewModel | null>(null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);

  const load = useCallback(() => {
    getPublic(gameId)
      .then((v) => { setView(v); setError(''); setStale(false); })
      .catch((e) => { setError(e.message); setStale(true); });
  }, [gameId]);

  useEffect(() => { load(); }, [load]);
  useGameStream(gameId, view?.version || 0, load);

  /* The timer has to keep ticking between updates. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (error && !view) {
    return <main id="main"><div className="card2">{error}</div></main>;
  }
  if (!view) return <main id="main"><div className="card2 hint">กำลังโหลด…</div></main>;

  const endsAt = view.day ? (view.day.nominationEndsAt || view.day.discussionEndsAt || 0) : 0;
  const left = endsAt ? Math.max(0, Math.floor((endsAt - Date.now()) / 1000)) : 0;
  const timer = endsAt
    ? String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0')
    : '';

  return (
    <main id="main">
      {stale && <div className="offline">การเชื่อมต่อสะดุด กำลังลองใหม่ ข้อมูลอาจไม่ใช่ล่าสุด</div>}
      <div className="pub-head">
        <div className="pub-phase">{view.winners ? 'จบเกม' : view.statusTh}</div>
        <div className="pub-count">มีชีวิต {view.aliveCount} / {view.totalCount}</div>
      </div>
      {timer && <div className={'pub-timer' + (left <= 30 ? ' low' : '')}>{timer}</div>}

      <div className="pub-grid">
        {view.players.map((p) => {
          const sub = p.alive
            ? (p.badges.length ? p.badges.join(' • ') : 'ที่นั่ง ' + p.seat)
            : (p.roleTh || p.teamTh || p.causeTh || 'เสียชีวิต');
          return (
            <div className={'pub-card' + (p.alive ? '' : ' gone')} key={p.playerId}>
              <div className="pn">{p.name}</div>
              <div className="ps">{sub}</div>
            </div>
          );
        })}
      </div>

      <div className="pub-log">
        {view.timelinePublic.slice(-12).reverse().map((t, i) => <div key={i}>{t.text}</div>)}
      </div>
    </main>
  );
}
