'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogRole, ModeratorViewModel } from '@/lib/types.ts';
import { useUi } from '@/components/ui';

interface Props {
  vm: ModeratorViewModel;
  catalog: CatalogRole[];
  onSaveAssignments: (assignments: { playerId: string; roleId: string }[], silent: boolean) => Promise<void>;
  onStartGame: () => void;
}

/**
 * The secret screen: which physical card each player actually received.
 *
 * Edits are kept locally and pushed 1.2 s after the last change. On Apps Script
 * one dropdown per player meant one round trip per player, which made a table
 * of twelve unusable; the batching stays even though the server is faster now.
 */
export default function AssignScreen({ vm, catalog, onSaveAssignments, onStartGame }: Props) {
  const ui = useUi();
  const [assign, setAssign] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of vm.players) if (p.baseRoleId) out[p.playerId] = p.baseRoleId;
    return out;
  });
  const [dirty, setDirty] = useState(false);
  const [shuffle, setShuffle] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAssign((cur) => {
      const out = { ...cur };
      for (const p of vm.players) if (p.baseRoleId && !out[p.playerId]) out[p.playerId] = p.baseRoleId;
      return out;
    });
  }, [vm.players]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const roleById = useMemo(() => {
    const m: Record<string, CatalogRole> = {};
    for (const r of catalog) m[r.roleId] = r;
    return m;
  }, [catalog]);

  const toArray = (map: Record<string, string>) =>
    Object.entries(map).filter(([, roleId]) => roleId).map(([playerId, roleId]) => ({ playerId, roleId }));

  const setOne = (playerId: string, roleId: string) => {
    const next = { ...assign };
    if (roleId) next[playerId] = roleId; else delete next[playerId];
    setAssign(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      onSaveAssignments(toArray(next), true).then(() => setDirty(false)).catch(() => { /* shown by caller */ });
    }, 1200);
  };

  /* Same arithmetic the server does, so the status line never waits on a round trip. */
  const status = useMemo(() => {
    const quota: Record<string, number> = {};
    for (const s of vm.selectedRoles) quota[s.roleId] = s.count;
    const used: Record<string, number> = {};
    let unassigned = 0;
    for (const p of vm.players) {
      const roleId = assign[p.playerId];
      if (!roleId) { unassigned++; continue; }
      used[roleId] = (used[roleId] || 0) + 1;
    }
    let missing = 0, over = 0;
    for (const [roleId, want] of Object.entries(quota)) {
      const diff = want - (used[roleId] || 0);
      if (diff > 0) missing += diff;
    }
    for (const [roleId, got] of Object.entries(used)) {
      const extra = got - (quota[roleId] || 0);
      if (extra > 0) over += extra;
    }
    return { unassigned, missing, over, ready: !unassigned && !missing && !over };
  }, [assign, vm.players, vm.selectedRoles]);

  const shuffleHelper = () => {
    const list: string[] = [];
    for (const s of vm.selectedRoles) {
      for (let i = 0; i < s.count; i++) list.push(roleById[s.roleId]?.th || s.roleId);
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    setShuffle(list);
  };

  const start = async () => {
    if (dirty) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      await onSaveAssignments(toArray(assign), false);
      setDirty(false);
    }
    if (!status.ready) { ui.toast('ยังบันทึกการแจกการ์ดไม่ครบ', 'bad'); return; }
    const res = await ui.confirm({
      title: 'เริ่มคืนแรก', icon: '🌙',
      text: 'หลังจากนี้จะแก้ไขบทบาทได้เฉพาะผ่านเมนูเครื่องมือเท่านั้น',
      confirmText: 'เริ่มเลย', cancelText: 'ยังก่อน'
    });
    if (res.confirmed) onStartGame();
  };

  return (
    <section className="page active">
      <div className="card2 warn-box">
        <span>🔒</span>
        <div>
          <b>หน้าจอลับ</b> — บันทึกว่าผู้เล่นแต่ละคนได้รับการ์ดใบใดจากการแจกจริง
          กดปุ่ม 👁️ ที่แถบบนเพื่อซ่อนจอทันทีเมื่อมีคนเดินผ่าน
        </div>
      </div>

      <div className="card2">
        <h5>📋 การ์ดที่ต้องหยิบจากกล่อง</h5>
        {vm.selectedRoles.map((s) => {
          const d = roleById[s.roleId];
          return (
            <div className="prow" key={s.roleId}>
              <div className="seatno">{s.count}</div>
              <div className="pname">{d?.th || s.roleId}<div className="hint">{d?.en || ''}</div></div>
              <span className={'tag t-' + (d?.team || 'VILLAGE')}>{d?.teamTh || ''}</span>
            </div>
          );
        })}
        <button className="btn-ghost w-100 mt-2" onClick={shuffleHelper}>
          🔀 ช่วยสุ่มลำดับรายการการ์ดก่อนนำไปสับจริง
        </button>
        <p className="hint mt-2">
          ปุ่มนี้ช่วยสุ่ม “ลำดับรายการการ์ด” เพื่อให้หยิบจากกล่องเท่านั้น ไม่ใช่การแจกบทบาทดิจิทัลให้ผู้เล่น
        </p>
        {shuffle && (
          <div className="reslist mt-2">
            {shuffle.map((th, i) => <div key={i}>{i + 1}. {th}</div>)}
          </div>
        )}
      </div>

      <div className="card2">
        <h5>🪪 บันทึกการแจกการ์ด</h5>
        {vm.players.map((p) => (
          <div className="prow" key={p.playerId}>
            <div className="seatno">{p.seat}</div>
            <div className="pname">{p.name}</div>
            <select className="inp vpick" value={assign[p.playerId] || ''}
                    onChange={(e) => setOne(p.playerId, e.target.value)}>
              <option value="">— ยังไม่ระบุ —</option>
              {vm.selectedRoles.map((s) => (
                <option key={s.roleId} value={s.roleId}>{roleById[s.roleId]?.th || s.roleId}</option>
              ))}
            </select>
          </div>
        ))}

        <div className="mt-3">
          {status.ready
            ? <span className="badge2">พร้อมเริ่มเกม การ์ดตรงกับผู้เล่นครบทุกใบ</span>
            : <>
                {status.unassigned > 0 && <span className="badge2 bad">ยังไม่ได้ระบุ {status.unassigned} คน</span>}
                {status.missing > 0 && <span className="badge2 bad">การ์ดที่ยังไม่ถูกใช้ {status.missing} ใบ</span>}
                {status.over > 0 && <span className="badge2 bad">ใช้เกินโควตา {status.over} ใบ</span>}
              </>}
          {dirty && <span className="badge2 saving">☁ ยังไม่บันทึก</span>}
        </div>

        <button className="btn-p w-100 mt-2" onClick={start}>🌙 ยืนยันและเริ่มคืนแรก</button>
      </div>
    </section>
  );
}
