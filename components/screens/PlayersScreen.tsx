'use client';

import { useEffect, useState } from 'react';
import type { ModeratorViewModel } from '@/lib/types.ts';

/**
 * Seat order is not cosmetic: P.I., Mad Bomber and Big Bad Wolf all read the
 * seats next to a player, so the list has to match how the table is actually
 * sitting.
 */
export default function PlayersScreen({ vm, onSave }: {
  vm: ModeratorViewModel;
  onSave: (names: string[]) => void;
}) {
  const [names, setNames] = useState<string[]>(vm.players.map((p) => p.name));
  const [adding, setAdding] = useState('');

  useEffect(() => { setNames(vm.players.map((p) => p.name)); }, [vm.players]);

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= names.length) return;
    const next = names.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setNames(next);
  };

  return (
    <section className="page active">
      <div className="card2">
        <h5>👥 ผู้เล่นและลำดับที่นั่ง</h5>
        <p className="hint">ลำดับที่นั่งมีผลกับ นักสืบเหนือธรรมชาติ มือระเบิดคลั่ง และจ่าฝูงหมาป่า —
          ใช้ปุ่มลูกศรเพื่อสลับที่นั่ง</p>

        {names.map((name, i) => (
          <div className="prow" key={i}>
            <div className="seatno">{i + 1}</div>
            <input className="inp" value={name}
                   onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))} />
            <button className="mini" onClick={() => move(i, -1)} title="เลื่อนขึ้น">↑</button>
            <button className="mini" onClick={() => move(i, 1)} title="เลื่อนลง">↓</button>
            <button className="mini" onClick={() => setNames(names.filter((_, j) => j !== i))}
                    title="ลบ">✕</button>
          </div>
        ))}

        <div className="row-gap mt-3">
          <input className="inp" value={adding} placeholder="เพิ่มชื่อผู้เล่น"
                 onChange={(e) => setAdding(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && adding.trim()) {
                     setNames(names.concat(adding.trim())); setAdding('');
                   }
                 }} />
          <button className="btn-g" onClick={() => {
            if (!adding.trim()) return;
            setNames(names.concat(adding.trim()));
            setAdding('');
          }}>เพิ่ม</button>
        </div>

        <button className="btn-p w-100 mt-3" disabled={names.filter((n) => n.trim()).length < 3}
                onClick={() => onSave(names.map((n) => n.trim()).filter(Boolean))}>
          บันทึกรายชื่อและไปเลือกบทบาท
        </button>
      </div>

      <div className="card2">
        <h6>วงกลมที่นั่ง</h6>
        <div className="seat-circle">
          {names.map((n, i) => (
            <span className="seat-chip" key={i}><b>{i + 1}</b> {n}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
