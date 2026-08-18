'use client';

import { useState } from 'react';
import type { Bootstrap } from '@/lib/client/api.ts';

const NAME_POOL = ['สมชาย', 'สมหญิง', 'วิชัย', 'มานี', 'ปิติ', 'ชูใจ', 'วีระ', 'ดวงใจ',
  'ธนา', 'ณัฐ', 'ก้อง', 'แพร', 'ฟ้า', 'ต้น', 'มิ้นท์', 'บอส'];

export function parseNames(text: string): string[] {
  return text.split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.slice(0, 40));
}

export default function HomeScreen({ boot, onCreate, onOpen }: {
  boot: Bootstrap | null;
  onCreate: (names: string[], title: string) => void;
  onOpen: (gameId: string, pin: string) => void;
}) {
  const [title, setTitle] = useState('เกมหมาป่า');
  const [namesText, setNamesText] = useState('');
  const [openId, setOpenId] = useState('');
  const [pin, setPin] = useState('');

  const quickNames = (n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(NAME_POOL[i % NAME_POOL.length] + (i >= NAME_POOL.length ? ' ' + i : ''));
    setNamesText(out.join('\n'));
  };

  const names = parseNames(namesText);

  return (
    <section className="page active">
      <div className="hero">
        <div className="moon" />
        <h1>Ultimate Werewolf</h1>
        <p>ผู้ช่วยผู้ดำเนินเกมสำหรับ Deluxe Edition — ใช้การ์ดจริง เว็บช่วยจัดลำดับ คำนวณผล และตรวจเงื่อนไขชนะ</p>
      </div>

      <div className="card2">
        <h5>➕ สร้างเกมใหม่</h5>
        <label className="lbl">ชื่อเกม</label>
        <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="เช่น เกมคืนวันศุกร์" />
        <label className="lbl mt-3">รายชื่อผู้เล่นตามลำดับที่นั่ง (บรรทัดละหนึ่งชื่อ)</label>
        <textarea className="inp" rows={7} value={namesText}
                  onChange={(e) => setNamesText(e.target.value)}
                  placeholder={'สมชาย\nสมหญิง\nวิชัย'} />
        <div className="row-gap mt-2">
          <button className="btn-ghost" onClick={() => quickNames(8)}>ใส่ชื่อสมมติ 8 คน</button>
          <button className="btn-ghost" onClick={() => quickNames(12)}>12 คน</button>
        </div>
        <div className="hint mt-2">ตอนนี้ {names.length} ชื่อ (ต้องมีอย่างน้อย 3 คน)</div>
        <button className="btn-p w-100 mt-3" disabled={names.length < 3}
                onClick={() => onCreate(names, title)}>▶ สร้างเกม</button>
      </div>

      <div className="card2">
        <h5>🔑 เปิดเกมเดิม</h5>
        <label className="lbl">รหัสเกม</label>
        <input className="inp" value={openId} placeholder="GAME-XXXXXX"
               onChange={(e) => setOpenId(e.target.value.toUpperCase())} />
        <label className="lbl mt-2">PIN ผู้ดำเนินเกม</label>
        <input className="inp" value={pin} placeholder="XXXX-XXXX"
               onChange={(e) => setPin(e.target.value)} />
        <button className="btn-g w-100 mt-3" disabled={!openId || !pin}
                onClick={() => onOpen(openId.trim(), pin.trim())}>เปิดเกม</button>

        {boot && boot.openGames.length > 0 && (
          <div className="mt-3">
            <div className="lbl">เกมที่ยังเล่นค้างอยู่</div>
            {boot.openGames.map((g) => (
              <div className="prow" key={g.gameId}>
                <div className="pname">
                  {g.title || g.gameId}
                  <div className="hint">{g.gameId} • {g.statusTh}
                    {g.nightNumber ? ' • คืนที่ ' + g.nightNumber : ''}
                    {g.dayNumber ? ' • วันที่ ' + g.dayNumber : ''}</div>
                </div>
                <button className="btn-ghost" onClick={() => setOpenId(g.gameId)}>เลือก</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
