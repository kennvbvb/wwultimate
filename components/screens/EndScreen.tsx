'use client';

import { useEffect, useState } from 'react';
import type { FinalSummary } from '@/lib/types.ts';
import { getSummary } from '@/lib/client/api.ts';

export default function EndScreen({ gameId, version, onRematch }: {
  gameId: string; version: number; onRematch: () => void;
}) {
  const [summary, setSummary] = useState<FinalSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getSummary(gameId)
      .then((s) => { if (alive) setSummary(s); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [gameId, version]);

  if (error) return <section className="page active"><div className="card2 hint">{error}</div></section>;
  if (!summary) return <section className="page active"><div className="card2 hint">กำลังสรุปผล…</div></section>;

  return (
    <section className="page active">
      <div className="card2">
        <div className="winner">
          <div className="wt">{summary.teamsTh.length ? summary.teamsTh.join(' + ') : 'จบเกม'}</div>
          <div className="hint">{summary.reasonTh}</div>
          {summary.individuals.length > 0 && (
            <div className="mt-2">
              {summary.individuals.map((w, i) => (
                <span className="badge2" key={i}>{w.name || String(w)} ชนะเดี่ยว</span>
              ))}
            </div>
          )}
        </div>

        <table className="sumtable">
          <thead>
            <tr><th>ที่นั่ง</th><th>ชื่อ</th><th>บทบาท</th><th>ฝ่าย</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            {summary.players.map((p) => (
              <tr key={p.seat}>
                <td>{p.seat}</td>
                <td>{p.name}</td>
                <td>
                  {p.finalRoleTh}
                  {p.baseRoleTh && p.baseRoleTh !== p.finalRoleTh &&
                    <span className="hint"> (เดิม {p.baseRoleTh})</span>}
                </td>
                <td>{p.teamTh}</td>
                <td>{p.alive ? 'รอด' : p.causeTh}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <a className="btn-ghost w-100 mt-3" style={{ display: 'block', textAlign: 'center' }}
           href={'/api/game/' + encodeURIComponent(gameId) + '/players.csv'}>
          ⬇ ดาวน์โหลดตารางผู้เล่น (CSV)
        </a>
        <button className="btn-p w-100 mt-2" onClick={onRematch}>🔁 เล่นอีกรอบด้วยที่นั่งเดิม</button>
      </div>

      <div className="card2">
        <h6>🕘 ไทม์ไลน์</h6>
        <div className="reslist">
          {summary.timeline.map((t, i) => <div key={i}>{t.text}</div>)}
        </div>
      </div>
    </section>
  );
}
