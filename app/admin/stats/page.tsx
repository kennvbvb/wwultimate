'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Stats } from '@/lib/stats.ts';

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/stats');
    if (res.status === 401) { setNeedsLogin(true); return; }
    if (!res.ok) { setError((await res.json()).error); return; }
    setStats(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  if (needsLogin) {
    return (
      <main id="main">
        <div className="card2">
          <h5>🔐 ต้องเข้าสู่ระบบผู้ดูแลก่อน</h5>
          <p className="hint">สถิติสร้างจากเกมที่จบแล้ว ซึ่งบอกได้ว่าใครถือการ์ดใบไหน จึงไม่เปิดให้นักเรียนดู</p>
          <Link className="btn-p w-100" style={{ display: 'block', textAlign: 'center' }} href="/admin">
            ไปหน้าผู้ดูแล
          </Link>
        </div>
      </main>
    );
  }

  if (error) return <main id="main"><div className="card2 hint">{error}</div></main>;
  if (!stats) return <main id="main"><div className="card2 hint">กำลังรวบรวมสถิติ…</div></main>;

  if (!stats.games) {
    return (
      <main id="main">
        <div className="card2">
          <h5>📊 สถิติข้ามเกม</h5>
          <p className="hint">ยังไม่มีเกมที่เล่นจบ สถิติจะเริ่มนับเมื่อมีเกมแรกจบลง</p>
          <Link className="btn-ghost w-100" style={{ display: 'block', textAlign: 'center' }} href="/admin">
            กลับหน้าผู้ดูแล
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main">
      <div className="card2">
        <div className="between">
          <h5 style={{ margin: 0 }}>📊 สถิติข้ามเกม</h5>
          <Link className="btn-ghost" href="/admin">หน้าผู้ดูแล</Link>
        </div>
        <p className="hint mt-2">
          นับเฉพาะเกมที่เล่นจบแล้ว {stats.games} เกม • ผู้เล่นเฉลี่ย {stats.averagePlayers} คนต่อเกม
          • ยาวเฉลี่ย {stats.averageDays} วัน
        </p>
      </div>

      <div className="card2">
        <h6>🏆 ฝ่ายที่ชนะ</h6>
        {stats.teamWins.map((t) => (
          <div className="vrow" key={t.team}>
            <div className="pname">{t.teamTh}</div>
            <div className="badge2">{t.wins} เกม</div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ background: '#0d1430', borderRadius: 999, overflow: 'hidden', height: 10 }}>
                <div style={{ width: t.share + '%', background: 'var(--gold)', height: '100%' }} />
              </div>
            </div>
            <div className="hint">{t.share}%</div>
          </div>
        ))}
        {!stats.teamWins.length && <div className="hint">ยังไม่มีเกมที่ฝ่ายใดชนะ</div>}
      </div>

      <div className="card2">
        <h6>🃏 บทบาทที่ใช้บ่อย</h6>
        <div style={{ overflowX: 'auto' }}>
          <table className="sumtable">
            <thead>
              <tr><th>บทบาท</th><th>ฝ่าย</th><th>ใช้</th><th>รอด</th><th>อยู่ฝ่ายชนะ</th></tr>
            </thead>
            <tbody>
              {stats.roles.map((r) => (
                <tr key={r.roleId}>
                  <td>{r.roleTh}</td>
                  <td>{r.teamTh}</td>
                  <td>{r.used}</td>
                  <td>{r.survived} ({pct(r.survived, r.used)}%)</td>
                  <td>{r.wins} ({pct(r.wins, r.used)}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card2">
        <h6>👥 ผู้เล่น</h6>
        <p className="hint">จับคู่ตามชื่อที่พิมพ์ไว้ ถ้าสะกดต่างกันจะนับเป็นคนละคน</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="sumtable">
            <thead>
              <tr><th>ชื่อ</th><th>เล่น</th><th>รอด</th><th>ชนะ</th><th>ได้เป็นหมาป่า</th></tr>
            </thead>
            <tbody>
              {stats.players.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.games}</td>
                  <td>{p.survived} ({pct(p.survived, p.games)}%)</td>
                  <td>{p.wins} ({pct(p.wins, p.games)}%)</td>
                  <td>{p.wolfGames}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card2">
        <h6>🕘 เกมล่าสุด</h6>
        {stats.recent.map((g) => (
          <div className="prow" key={g.gameId}>
            <div className="pname">
              {g.title}
              <div className="hint">
                {g.gameId} • {g.players} คน • {g.days} วัน • {new Date(g.finishedAt).toLocaleString('th-TH')}
              </div>
            </div>
            <span className="badge2">{g.winnersTh}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}
