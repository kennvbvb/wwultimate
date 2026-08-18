'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UiProvider, useUi } from '@/components/ui';

interface AdminRole {
  roleId: string;
  pack: string;
  th: string;
  en: string;
  team: string;
  teamTh: string;
  villageImpact: number;
  maxCopies: number;
  noteTh: string;
  enabled: boolean;
  overridden: boolean;
}

const CSV_HEADER = ['roleId', 'displayNameTh', 'villageImpact', 'maxCopies', 'enabled', 'noteTh'];

export default function AdminPage() {
  return (
    <UiProvider>
      <AdminScreen />
    </UiProvider>
  );
}

function AdminScreen() {
  const ui = useUi();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [impactVerified, setImpactVerified] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/roles');
    if (res.status === 401) { setAuthed(false); return; }
    const body = await res.json();
    setRoles(body.roles);
    setImpactVerified(body.impactVerified);
    setAuthed(true);
    setDirty(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const signIn = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) { ui.toast((await res.json()).error, 'bad'); return; }
      setPassword('');
      await load();
    } finally { setBusy(false); }
  };

  const edit = (roleId: string, patch: Partial<AdminRole>) => {
    setRoles((cur) => cur.map((r) => (r.roleId === roleId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rows: roles.map((r) => ({
            roleId: r.roleId, displayNameTh: r.th, villageImpact: r.villageImpact,
            maxCopies: r.maxCopies, enabled: r.enabled, noteTh: r.noteTh
          }))
        })
      });
      if (!res.ok) { ui.toast((await res.json()).error, 'bad'); return; }
      /* The catalog cache is cleared server-side, so the next new game sees this. */
      ui.toast('บันทึกแล้ว เกมที่สร้างหลังจากนี้จะใช้ค่าใหม่ทันที', 'good');
      await load();
    } finally { setBusy(false); }
  };

  const reset = async () => {
    const res = await ui.confirm({
      title: 'คืนค่าเริ่มต้นทั้งหมด', icon: '↩️', danger: true,
      text: 'ลบค่าที่แก้ไว้ทุกบทบาท กลับไปใช้ค่าที่มากับโปรแกรม'
    });
    if (!res.confirmed) return;
    setBusy(true);
    try {
      await fetch('/api/admin/roles', { method: 'DELETE' });
      await load();
      ui.toast('คืนค่าเริ่มต้นแล้ว', 'good');
    } finally { setBusy(false); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [CSV_HEADER.join(',')].concat(roles.map((r) => [
      r.roleId, r.th, r.villageImpact, r.maxCopies, r.enabled ? 'TRUE' : 'FALSE', r.noteTh
    ].map(esc).join(',')));
    /* BOM keeps Thai readable when the file is opened in Excel. */
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'role-catalog.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const text = (await file.text()).replace(/^﻿/, '');
    const rows = parseCsv(text);
    if (!rows.length) { ui.toast('ไฟล์ว่างหรืออ่านไม่ได้', 'bad'); return; }
    const head = rows[0].map((h) => h.trim());
    const idx = (name: string) => head.indexOf(name);
    if (idx('roleId') < 0) { ui.toast('ไฟล์ต้องมีคอลัมน์ roleId', 'bad'); return; }

    let applied = 0;
    setRoles((cur) => cur.map((r) => {
      const row = rows.slice(1).find((cells) => cells[idx('roleId')] === r.roleId);
      if (!row) return r;
      applied++;
      const pick = (name: string) => (idx(name) >= 0 ? row[idx(name)] : undefined);
      const impact = pick('villageImpact');
      const copies = pick('maxCopies');
      const enabled = pick('enabled');
      return {
        ...r,
        th: pick('displayNameTh') || r.th,
        villageImpact: impact === undefined || impact === '' ? r.villageImpact : Number(impact),
        maxCopies: copies === undefined || copies === '' ? r.maxCopies : Number(copies),
        enabled: enabled === undefined || enabled === '' ? r.enabled : /^(true|1|yes|ใช่)$/i.test(enabled),
        noteTh: pick('noteTh') ?? r.noteTh
      };
    }));
    setDirty(true);
    ui.toast('อ่านจากไฟล์แล้ว ' + applied + ' บทบาท — ยังไม่บันทึกจนกว่าจะกดบันทึก');
  };

  if (authed === null) return <main id="main"><div className="card2 hint">กำลังตรวจสิทธิ์…</div></main>;

  if (!authed) {
    return (
      <main id="main">
        <div className="card2">
          <h5>🔐 หน้าผู้ดูแลบทบาท</h5>
          <p className="hint">ใช้รหัสผ่านผู้ดูแล (คนละตัวกับ PIN ของเกม)</p>
          <input className="inp" type="password" value={password} placeholder="รหัสผ่านผู้ดูแล"
                 onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }} />
          <button className="btn-p w-100 mt-3" disabled={busy || !password} onClick={signIn}>
            เข้าสู่ระบบ
          </button>
        </div>
      </main>
    );
  }

  return (
    <main id="main">
      <div className="card2">
        <h5>🧾 แก้ค่าบทบาท {roles.length} รายการ</h5>
        <p className="hint">
          แทนการแก้ในแท็บ RoleCatalog ของ Google Sheets เดิม — ค่าที่แก้จะถูกซ้อนทับลงบนค่าที่มากับโปรแกรม
          และมีผลกับเกมที่สร้างหลังจากบันทึก
        </p>
        {!impactVerified && (
          <div className="offline">
            ⚠️ ค่า Village Impact ยังไม่ได้ยืนยันกับการ์ดจริง หน้าจอเลือกบทบาทจะขึ้นคำเตือนไว้
            เมื่อแก้ครบทุกใบแล้วให้ตั้ง environment variable <code>VILLAGE_IMPACT_VERIFIED=true</code>
            แล้ว deploy ใหม่ คำเตือนจะหายไป
          </div>
        )}
        <div className="row-gap mt-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn-p" disabled={busy || !dirty} onClick={save}>💾 บันทึก</button>
          <button className="btn-ghost" onClick={exportCsv}>⬇ ส่งออก CSV</button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>⬆ นำเข้า CSV</button>
          <button className="btn-r" disabled={busy} onClick={reset}>คืนค่าเริ่มต้น</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                 onChange={(e) => {
                   const file = e.target.files?.[0];
                   if (file) importCsv(file);
                   e.target.value = '';
                 }} />
        </div>
        {dirty && <div className="hint mt-2">มีการแก้ไขที่ยังไม่ได้บันทึก</div>}
      </div>

      {roles.map((r) => (
        <div className="card2" key={r.roleId} style={{ padding: 12 }}>
          <div className="between">
            <div>
              <b>{r.th}</b> <span className="role-en">{r.en}</span>
              <div className="hint">{r.roleId} • {r.pack}</div>
            </div>
            <span className={'tag t-' + r.team}>{r.teamTh}</span>
          </div>

          <div className="variant-grid mt-2">
            <div>
              <label className="lbl">ชื่อภาษาไทย</label>
              <input className="inp" value={r.th} onChange={(e) => edit(r.roleId, { th: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Village Impact</label>
              <input className="inp" type="number" value={r.villageImpact}
                     onChange={(e) => edit(r.roleId, { villageImpact: Number(e.target.value) })} />
            </div>
            <div>
              <label className="lbl">จำนวนใบสูงสุด</label>
              <input className="inp" type="number" min={0} value={r.maxCopies}
                     onChange={(e) => edit(r.roleId, { maxCopies: Number(e.target.value) })} />
            </div>
            <div>
              <label className="lbl">เปิดใช้ (มีการ์ดในกล่อง)</label>
              <select className="inp" value={r.enabled ? '1' : '0'}
                      onChange={(e) => edit(r.roleId, { enabled: e.target.value === '1' })}>
                <option value="1">มี</option>
                <option value="0">ไม่มี</option>
              </select>
            </div>
          </div>
          <div className="mt-2">
            <label className="lbl">หมายเหตุ</label>
            <input className="inp" value={r.noteTh}
                   onChange={(e) => edit(r.roleId, { noteTh: e.target.value })} />
          </div>
        </div>
      ))}
    </main>
  );
}

/** Minimal RFC4180 reader — enough for a sheet exported from Excel or Sheets. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.length)) rows.push(row);
  return rows;
}
