'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CatalogRole, ModeratorViewModel, RuleVariants, SelectedRole } from '@/lib/types.ts';
import { BOOL_VARIANTS, CHOICE_VARIANTS, NUMBER_VARIANTS, TEAM_GROUPS } from '@/lib/client/variants.ts';
import { useUi } from '@/components/ui';

interface Props {
  vm: ModeratorViewModel;
  catalog: CatalogRole[];
  impactVerified: boolean;
  onSave: (selected: SelectedRole[], variants: RuleVariants, title: string) => void;
}

export default function RolesScreen({ vm, catalog, impactVerified, onSave }: Props) {
  const ui = useUi();
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const r of vm.selectedRoles) out[r.roleId] = r.count;
    return out;
  });
  const [variants, setVariants] = useState<RuleVariants>(vm.ruleVariants);
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [packFilter, setPackFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => { setVariants(vm.ruleVariants); }, [vm.ruleVariants]);

  const byId = useMemo(() => {
    const m: Record<string, CatalogRole> = {};
    for (const r of catalog) m[r.roleId] = r;
    return m;
  }, [catalog]);

  const totals = useMemo(() => {
    let cards = 0, impact = 0;
    for (const [roleId, count] of Object.entries(selected)) {
      cards += count;
      impact += (byId[roleId]?.villageImpact || 0) * count;
    }
    return { cards, impact };
  }, [selected, byId]);

  const bump = (roleId: string, delta: number) => {
    const def = byId[roleId];
    setSelected((cur) => {
      const next = { ...cur };
      let n = (next[roleId] || 0) + delta;
      if (n < 0) n = 0;
      if (def && def.maxCopies && n > def.maxCopies) {
        ui.toast('บทบาทนี้ใช้ได้สูงสุด ' + def.maxCopies + ' ใบ');
        n = def.maxCopies;
      }
      if (n === 0) delete next[roleId]; else next[roleId] = n;
      return next;
    });
  };

  /** Same shape the Apps Script version suggested: ~1 wolf per 4 players. */
  const quickDeck = () => {
    const n = vm.players.length;
    if (n < 5) { ui.toast('ต้องบันทึกรายชื่อผู้เล่นอย่างน้อย 5 คนก่อน'); return; }
    let wolves = Math.floor(n / 4);
    if (wolves < 1) wolves = 1;
    if (wolves > 4) wolves = 4;

    const deck: Record<string, number> = { werewolf: wolves, seer: 1 };
    let used = wolves + 1;
    for (const extra of ['bodyguard', 'hunter', 'tanner', 'witch', 'lycan', 'cursed', 'mason']) {
      if (used >= n - 2) break;             /* always keep at least two plain villagers */
      if (!byId[extra]) continue;
      if (extra === 'mason') {
        if (used + 2 > n - 2) continue;
        deck.mason = 2; used += 2;
      } else { deck[extra] = 1; used += 1; }
    }
    if (used < n) deck.villager = n - used;
    setSelected(deck);
    ui.toast('จัดชุดสำหรับ ' + n + ' คนแล้ว ปรับเพิ่มลดได้ตามต้องการ');
  };

  const groups = TEAM_GROUPS.map((g) => {
    const q = search.trim().toLowerCase();
    const roles = catalog.filter((r) => {
      if (!r.enabled) return false;
      if (r.team !== g.key) return false;
      if (packFilter === 'SELECTED') { if (!selected[r.roleId]) return false; }
      else if (packFilter !== 'ALL' && r.pack !== packFilter) return false;
      if (teamFilter !== 'ALL' && r.team !== teamFilter) return false;
      if (q && (r.th + ' ' + r.en + ' ' + r.roleId).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    const picked = roles.reduce((sum, r) => sum + (selected[r.roleId] || 0), 0);
    return { ...g, roles, picked };
  }).filter((g) => g.roles.length > 0);

  const toArray = (): SelectedRole[] =>
    Object.entries(selected).filter(([, c]) => c > 0).map(([roleId, count]) => ({ roleId, count }));

  const balanceText = totals.cards === 0
    ? 'ยังไม่ได้เลือกการ์ด'
    : totals.cards !== vm.players.length
      ? 'จำนวนการ์ด ' + totals.cards + ' ใบ ไม่ตรงกับผู้เล่น ' + vm.players.length + ' คน'
      : totals.impact > 4 ? 'ฝ่ายหมู่บ้านได้เปรียบมาก'
        : totals.impact < -4 ? 'ฝ่ายหมาป่าได้เปรียบมาก'
          : 'ค่อนข้างสมดุล';

  return (
    <section className="page active">
      <div className="card2">
        <div className="between">
          <div>
            <div className="sum-num"><b>{totals.cards}</b> / {vm.players.length}</div>
            <div className="hint">การ์ดที่เลือก / ผู้เล่น</div>
          </div>
          <div className="text-end">
            <div className="sum-num"><b>{totals.impact > 0 ? '+' : ''}{totals.impact}</b></div>
            <div className="hint">Village Impact</div>
          </div>
        </div>
        <div className="mt-2 hint">{balanceText}</div>
        {!impactVerified && (
          <div className="offline mt-2">
            ⚠️ ค่า Village Impact เป็นค่าประมาณ ยังไม่ได้ตรวจกับการ์ดจริง
            แก้ได้ที่หน้าผู้ดูแลบทบาท
          </div>
        )}
        <button className="btn-p w-100 mt-2"
                disabled={totals.cards !== vm.players.length}
                onClick={() => onSave(toArray(), variants, vm.title)}>ยืนยันชุดบทบาท</button>
      </div>

      <div className="card2">
        <h5>🎚️ ตัวเลือกกติกา</h5>
        <div className="variant-grid">
          {CHOICE_VARIANTS.map((v) => (
            <div key={v.key}>
              <label className="lbl">{v.label}</label>
              <select className="inp" value={String(variants[v.key])}
                      onChange={(e) => setVariants({ ...variants, [v.key]: e.target.value })}>
                {v.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          ))}
          {BOOL_VARIANTS.map((v) => (
            <div key={v.key}>
              <label className="lbl">{v.label}</label>
              <select className="inp" value={variants[v.key] ? '1' : '0'}
                      onChange={(e) => setVariants({ ...variants, [v.key]: e.target.value === '1' })}>
                <option value="0">ปิด</option>
                <option value="1">เปิด</option>
              </select>
            </div>
          ))}
          {NUMBER_VARIANTS.map((v) => (
            <div key={v.key}>
              <label className="lbl">{v.label}</label>
              <input className="inp" type="number" min={v.min} max={v.max}
                     value={Number(variants[v.key])}
                     onChange={(e) => setVariants({ ...variants, [v.key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
      </div>

      <div className="card2">
        <h5>🃏 เลือกบทบาท</h5>
        <button className="btn-gold w-100 mb-2" onClick={quickDeck}>✨ จัดชุดแนะนำอัตโนมัติ</button>

        <div className="lbl">ฝ่าย</div>
        <div className="filters">
          {[['ALL', 'ทุกฝ่าย'], ['VILLAGE', 'ชาวบ้าน'], ['WEREWOLF', 'หมาป่า'],
            ['VAMPIRE', 'แวมไพร์'], ['CULT', 'ลัทธิ'], ['INDEPENDENT', 'อิสระ']].map(([k, label]) => (
            <button key={k} className={'chip' + (teamFilter === k ? ' active' : '')}
                    onClick={() => setTeamFilter(k)}>{label}</button>
          ))}
        </div>

        <div className="lbl mt-2">ชุดการ์ด</div>
        <div className="filters">
          {[['ALL', 'ทั้งหมด'], ['CORE', 'Core'], ['WOLFPACK', 'Wolfpack'],
            ['HUNTING_PARTY', 'Hunting Party'], ['SELECTED', 'ที่เลือกไว้']].map(([k, label]) => (
            <button key={k} className={'chip' + (packFilter === k ? ' active' : '')}
                    onClick={() => setPackFilter(k)}>{label}</button>
          ))}
        </div>

        <input className="inp mt-2" placeholder="ค้นหาบทบาท..." value={search}
               onChange={(e) => setSearch(e.target.value)} />

        {groups.map((g) => (
          <div key={g.key}>
            <div className={'grp grp-' + g.key}>
              <span>{g.icon}</span>
              <span className="grp-name">{g.th}</span>
              <span className="grp-count">{g.roles.length} บทบาท</span>
              {g.picked > 0 && <span className="grp-picked">เลือก {g.picked}</span>}
            </div>
            {g.roles.map((r) => {
              const count = selected[r.roleId] || 0;
              return (
                <div className={'role' + (count ? ' picked' : '')} key={r.roleId}>
                  <div className="role-main">
                    <div className="role-name">
                      {r.th}
                      <span className="role-en">{r.en}</span>
                      <span className="imp">{r.villageImpact > 0 ? '+' : ''}{r.villageImpact}</span>
                    </div>
                    {r.noteTh && <div className="role-note">{r.noteTh}</div>}
                  </div>
                  <div className="stepper">
                    <button className="mini" onClick={() => bump(r.roleId, -1)}>−</button>
                    <b>{count}</b>
                    <button className="mini" onClick={() => bump(r.roleId, 1)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
