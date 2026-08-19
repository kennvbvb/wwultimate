'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModeratorViewModel, RuleVariants, SelectedRole } from '@/lib/types.ts';
import * as api from '@/lib/client/api.ts';
import { ApiError, type Bootstrap, type RecentGame } from '@/lib/client/api.ts';
import { useGameStream } from '@/lib/client/useGameStream.ts';
import {
  lynchAnnouncement, nightDeathAnnouncement, stepResultAnnouncement
} from '@/lib/client/announce.ts';
import { Loading, Modal, PrivacyCover, UiProvider, useUi } from '@/components/ui';
import HomeScreen from '@/components/screens/HomeScreen';
import PlayersScreen from '@/components/screens/PlayersScreen';
import RolesScreen from '@/components/screens/RolesScreen';
import AssignScreen from '@/components/screens/AssignScreen';
import NightScreen from '@/components/screens/NightScreen';
import DayScreen from '@/components/screens/DayScreen';
import EndScreen from '@/components/screens/EndScreen';
import PublicScreenCard from '@/components/PublicScreenCard';
import { playChime, setSoundEnabled, soundEnabled } from '@/lib/client/chime.ts';
import { availablePages, routeByStatus, type Page } from '@/lib/client/nav.ts';

const LAST_GAME_KEY = 'uw_last_game_v2';
const RECENT_KEY = 'uw_recent_games_v1';
const RECENT_MAX = 8;

/**
 * Games this device has opened, kept locally. The server used to hand every
 * visitor the list of games in progress; a teacher's own device is the right
 * place for that convenience.
 */
function readRecent(): RecentGame[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function rememberRecent(game: { gameId: string; title: string }): RecentGame[] {
  const entry = { gameId: game.gameId, title: game.title, at: Date.now() };
  const next = [entry, ...readRecent().filter((g) => g.gameId !== entry.gameId)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

const NAV: { key: Page; label: string; icon: string }[] = [
  { key: 'players', label: 'ผู้เล่น', icon: '👥' },
  { key: 'roles', label: 'บทบาท', icon: '🃏' },
  { key: 'assign', label: 'แจกการ์ด', icon: '🪪' },
  { key: 'night', label: 'กลางคืน', icon: '🌙' },
  { key: 'day', label: 'กลางวัน', icon: '☀️' },
  { key: 'end', label: 'สรุป', icon: '🏆' }
];

export default function Page() {
  return (
    <UiProvider>
      <ModeratorConsole />
    </UiProvider>
  );
}

function ModeratorConsole() {
  const ui = useUi();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [vm, setVm] = useState<ModeratorViewModel | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [busy, setBusy] = useState(false);
  const [covered, setCovered] = useState(false);
  const [tools, setTools] = useState(false);
  const [log, setLog] = useState<{ type: string; at: string }[] | null>(null);
  const [showPublic, setShowPublic] = useState(false);
  const [sound, setSound] = useState(true);
  const [pinOnce, setPinOnce] = useState('');
  const [recent, setRecent] = useState<RecentGame[]>([]);
  /* Two commands can be sent back to back (save votes, then close the vote).
   * React has not re-rendered in between, so the version has to come from here
   * rather than from the render's copy — otherwise the second command carries a
   * stale expectedVersion and the server rejects it as a conflict. */
  const vmRef = useRef<ModeratorViewModel | null>(null);

  /* ---------------- boot ---------------- */

  useEffect(() => {
    api.getBootstrap().then(setBoot).catch((e) => ui.toast(e.message, 'bad'));
    setRecent(readRecent());
    setSound(soundEnabled());
    let last = '';
    try { last = localStorage.getItem(LAST_GAME_KEY) || ''; } catch { /* private mode */ }
    if (last) {
      /* The cookie may still be valid from an earlier session — try silently. */
      api.getGame(last).then(applyVm).catch(() => { /* fall through to the home screen */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyVm = useCallback((next: ModeratorViewModel) => {
    vmRef.current = next;
    setVm(next);
    try { localStorage.setItem(LAST_GAME_KEY, next.gameId); } catch { /* private mode */ }
    setRecent(rememberRecent({ gameId: next.gameId, title: next.title }));
    setPage(routeByStatus(next));
  }, []);

  const reload = useCallback(() => {
    if (!vm) return;
    api.getGame(vm.gameId)
      .then((next) => { vmRef.current = next; setVm(next); })
      .catch((e) => ui.toast(e.message, 'bad'));
  }, [vm, ui]);

  /* Another device (or the public screen) changed the game — pick it up. */
  useGameStream(vm ? vm.gameId : null, vm?.version || 0, () => {
    if (!vm) return;
    api.getGame(vm.gameId)
      .then((next) => { vmRef.current = next; setVm(next); })
      .catch(() => { /* transient */ });
  });

  /* ---------------- command plumbing ---------------- */

  const run = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const current = vmRef.current;
    if (!current) return;
    setBusy(true);
    try {
      const next = await api.sendCommand({
        action, gameId: current.gameId, expectedVersion: current.version, ...extra
      });
      applyVm(next);
      return next;
    } catch (e) {
      const err = e as ApiError;
      if (err.isConflict) {
        ui.toast('มีการเปลี่ยนแปลงจากหน้าจออื่น กำลังโหลดสถานะล่าสุด');
        reload();
      } else if (err.isAuth) {
        ui.toast('หมดเวลาเข้าสู่ระบบ กรุณากรอก PIN อีกครั้ง', 'bad');
        vmRef.current = null;
        setVm(null);
        setPage('home');
      } else {
        ui.toast(err.message, 'bad');
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [applyVm, reload, ui]);

  /**
   * ruleVariants.randomDelayMs: pause a random moment before a "nothing
   * happened" step so the table cannot tell real actions from skipped ones by
   * how long the moderator stays quiet.
   */
  const maskedDelay = useCallback(async () => {
    const max = vm?.ruleVariants.randomDelayMs || 0;
    if (!max) return;
    const wait = Math.floor(Math.random() * max) + Math.floor(max / 3);
    setBusy(true);
    await new Promise((r) => setTimeout(r, wait));
  }, [vm]);

  /* ---------------- entry points ---------------- */

  const createGame = async (names: string[], title: string) => {
    setBusy(true);
    try {
      const next = await api.createGame(names, title);
      setPinOnce(next.moderatorPin || '');
      applyVm(next);
    } catch (e) {
      ui.toast((e as Error).message, 'bad');
    } finally { setBusy(false); }
  };

  const openGame = async (gameId: string, pin: string) => {
    setBusy(true);
    try {
      applyVm(await api.login(gameId, pin));
    } catch (e) {
      ui.toast((e as Error).message, 'bad');
    } finally { setBusy(false); }
  };

  /* ---------------- top bar actions ---------------- */

  const undo = async () => {
    const res = await ui.confirm({
      title: 'ย้อนกลับหนึ่งขั้น', icon: '↩️',
      text: 'ย้อนคำสั่งล่าสุดกลับไปหนึ่งขั้น เช่น แตะเป้าหมายผิดคนกลางคืน (ย้อนได้ 25 ขั้น)',
      confirmText: 'ย้อนกลับ'
    });
    if (!res.confirmed) return;
    const next = await run('undo');
    if (next) ui.toast('ย้อนแล้ว: ' + (next.lastUndoneLabel || 'คำสั่งล่าสุด'), 'good');
  };

  const openLog = async () => {
    if (!vm) return;
    try {
      const rows = await api.getEvents(vm.gameId, 120);
      setLog(rows.map((r) => ({ type: r.type, at: r.at })));
    } catch (e) { ui.toast((e as Error).message, 'bad'); }
  };

  /* ---------------- tools ---------------- */

  const toolSwap = async () => {
    if (!vm) return;
    setTools(false);
    const options = vm.players.map((p) => ({
      value: p.playerId, label: p.seat + '. ' + p.name + (p.alive ? '' : ' (เสียชีวิต)')
    }));
    const res = await ui.confirm({
      title: 'สลับบทบาทระหว่างผู้เล่นสองคน', icon: '🔄',
      select: [{ label: 'คนที่หนึ่ง', options }, { label: 'คนที่สอง', options, initial: options[1]?.value }],
      confirmText: 'สลับ'
    });
    if (!res.confirmed) return;
    const [a, b] = res.choices || [];
    if (!a || !b || a === b) { ui.toast('ต้องเลือกคนละคน', 'bad'); return; }
    if (await run('swapRoles', { playerA: a, playerB: b })) ui.toast('สลับบทบาทแล้ว', 'good');
  };

  const toolReopen = async () => {
    setTools(false);
    const started = vm ? (vm.nightNumber > 0 || vm.dayNumber > 0) : false;
    const res = await ui.confirm({
      title: 'กลับไปแก้การแจกบทบาท', icon: '🔓', danger: started,
      text: started
        ? 'เกมเริ่มไปแล้ว ระบบจะกู้สถานะกลับไปก่อนคืนแรก — การตาย สถานะ และผลทุกอย่างที่เกิดขึ้นระหว่างเกมจะหายไปทั้งหมด'
        : 'ปลดล็อกให้แก้ว่าใครได้การ์ดใบไหน ยังไม่มีเหตุการณ์ใดในเกมให้ล้าง',
      input: { label: 'เหตุผล (ไม่บังคับ)' }
    });
    if (!res.confirmed) return;
    if (await run('reopenRoleAssignment', { reason: res.value || 'ผู้ดำเนินเกมสั่งแก้ไข' })) {
      ui.toast('กลับสู่หน้าแจกบทบาทแล้ว', 'good');
    }
  };

  const toolKill = async () => {
    if (!vm) return;
    setTools(false);
    const options = vm.players.filter((p) => p.alive)
      .map((p) => ({ value: p.playerId, label: p.seat + '. ' + p.name }));
    if (!options.length) { ui.toast('ไม่มีผู้เล่นที่ยังมีชีวิต', 'bad'); return; }
    const res = await ui.confirm({
      title: 'สั่งให้ผู้เล่นเสียชีวิต', icon: '☠️', danger: true,
      select: [{ label: 'ผู้เล่น', options }],
      input: { label: 'เหตุผล', placeholder: 'เช่น ออกจากเกมกลางคัน' }
    });
    if (!res.confirmed || !res.choices?.[0]) return;
    await run('moderatorKill', { playerId: res.choices[0], reason: res.value || 'ผู้ดำเนินเกมตัดสิน' });
  };

  const toolEnd = async () => {
    setTools(false);
    const res = await ui.confirm({
      title: 'จบเกมทันที', icon: '🏁', danger: true,
      text: 'ปิดเกมโดยไม่รอเงื่อนไขชนะ แล้วไปหน้าสรุปผล',
      input: { label: 'เหตุผล (ไม่บังคับ)' }
    });
    if (!res.confirmed) return;
    await run('endGame', { reason: res.value || 'ผู้ดำเนินเกมสั่งจบเกม' });
  };

  const rematch = async () => {
    const next = await run('rematch');
    if (next) {
      setPinOnce(next.moderatorPin || '');
      ui.toast('สร้างเกมใหม่ด้วยที่นั่งเดิมแล้ว', 'good');
    }
  };

  /* ---------------- render ---------------- */

  const catalog = boot?.catalog.roles || [];
  const impactVerified = boot?.catalog.impactVerified ?? false;

  const body = useMemo(() => {
    if (!vm || page === 'home') {
      return <HomeScreen boot={boot} recent={recent} onCreate={createGame} onOpen={openGame} />;
    }
    switch (page) {
      case 'players':
        return <PlayersScreen vm={vm} onSave={(names) => run('setPlayers', { playerNames: names })
          .then((next) => { if (next) setPage('roles'); })} />;
      case 'roles':
        return <RolesScreen vm={vm} catalog={catalog} impactVerified={impactVerified}
          onSave={(selectedRoles: SelectedRole[], ruleVariants: RuleVariants, title: string) =>
            run('configureGame', { selectedRoles, ruleVariants, title })
              .then((next) => { if (next) setPage('assign'); })} />;
      case 'assign':
        return <AssignScreen vm={vm} catalog={catalog}
          onSaveAssignments={async (assignments, silent) => {
            const next = await run('assignRoles', { assignments });
            if (next && !silent) ui.toast('บันทึกการแจกการ์ดแล้ว', 'good');
          }}
          onStartGame={() => run('startGame')} />;
      case 'night':
        return <NightScreen vm={vm}
          onSubmitStep={async (stepId, targetIds, meta) => {
            const before = vm;
            const next = await run('submitRoleAction', { stepId, targetIds, meta });
            /* The seer's nod, the P.I.'s reading, the masons' names — the answer
             * has to reach the moderator before they look away from the phone. */
            if (next) {
              const said = stepResultAnnouncement(before, next);
              if (said) await ui.announce(said);
            }
          }}
          onSkipStep={async (stepId) => { await maskedDelay(); run('skipStep', { stepId }); }}
          onResolveNight={async () => {
            const next = await run('resolveNight');
            if (next) await ui.announce(nightDeathAnnouncement(next));
          }}
          onResolvePrompt={(promptId, targetId) => run('resolvePrompt', { promptId, targetId })} />;
      case 'day':
        return <DayScreen vm={vm}
          onStartDiscussion={() => run('startDiscussion')}
          onOpenNomination={() => run('openNomination')}
          onCloseNomination={(nomineeIds) => run('startNomination', { nomineeIds })}
          onSubmitVotes={async (votes) => {
            const next = await run('submitVote', { votes });
            if (next) ui.toast('บันทึกคะแนนแล้ว', 'good');
            return !!next;
          }}
          onResolveVote={async (choice) => {
            const before = vm;
            const next = await run('resolveVote', { moderatorChoice: choice || null });
            if (next) await ui.announce(lynchAnnouncement(before, next));
          }}
          onForceEndDay={() => run('forceEndDay')}
          onModeratorKill={(playerId, reason) => run('moderatorKill', { playerId, reason })}
          onResolvePrompt={(promptId, targetId) => run('resolvePrompt', { promptId, targetId })} />;
      case 'end':
        return <EndScreen gameId={vm.gameId} version={vm.version} onRematch={rematch} />;
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm, page, boot, catalog, impactVerified, recent]);

  const openPages = availablePages(vm, page);

  const phase = [
    vm?.nightNumber ? 'คืนที่ ' + vm.nightNumber : '',
    vm?.dayNumber ? 'วันที่ ' + vm.dayNumber : ''
  ].filter(Boolean).join(' • ');

  return (
    <>
      <Loading show={busy} />
      <PrivacyCover show={covered} onHide={() => setCovered(false)} />

      <header id="topbar">
        <div className="tb-left">
          <span className="tb-title">{vm?.title || 'Ultimate Werewolf'}</span>
          <span className="tb-sub">{vm ? vm.gameId + ' • ' + vm.statusTh : 'ผู้ช่วยผู้ดำเนินเกม'}</span>
        </div>
        <div className="tb-right">
          <button className="ic" title="ซ่อนจอ" onClick={() => setCovered(true)}>👁️</button>
          <button className={'ic' + (sound ? ' on' : '')} title={sound ? 'เสียงเตือนเปิดอยู่' : 'เสียงเตือนปิดอยู่'}
                  onClick={() => {
                    const next = !sound;
                    setSound(next);
                    setSoundEnabled(next);
                    if (next) playChime('warn');   /* also unlocks audio on mobile */
                  }}>{sound ? '🔔' : '🔕'}</button>
          {vm && (
            <>
              <button className={'ic' + (vm.status === 'PAUSED' ? ' on' : '')} title="หยุดพัก"
                      onClick={() => run(vm.status === 'PAUSED' ? 'resumeGame' : 'pauseGame')}>⏸</button>
              <button className="ic" title="ย้อนคำสั่ง" onClick={undo}>↩️</button>
              <button className="ic" title="เครื่องมือผู้ดำเนินเกม" onClick={() => setTools(true)}>🔧</button>
            </>
          )}
        </div>
      </header>

      {vm && (
        <div id="statusbar" className="show">
          <span>{vm.statusTh}{phase ? ' — ' + phase : ''}</span>
          <span>มีชีวิต <b>{vm.aliveCount}</b> / {vm.totalCount}</span>
        </div>
      )}

      <main id="main">
        {vm?.paused && (
          <div className="paused-banner">
            <div>
              <b>⏸ เกมหยุดพักอยู่</b>
              <div className="hint">นาฬิกาอภิปรายและเสนอชื่อหยุดเดินแล้ว จะเดินต่อเมื่อกดเล่นต่อ</div>
            </div>
            <button className="btn-gold" onClick={() => run('resumeGame')}>เล่นต่อ</button>
          </div>
        )}
        {pinOnce && vm && (
          <div className="card2">
            <h5>🔐 PIN ผู้ดำเนินเกม</h5>
            <p className="hint">จดไว้ให้ดี ระบบจะไม่แสดงอีก ใช้คู่กับรหัสเกม {vm.gameId} เมื่อเปิดจากเครื่องอื่น</p>
            <div className="pin-row">
              <div className="pin-box">{pinOnce}</div>
              <button className="btn-ghost" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(vm.gameId + ' / ' + pinOnce);
                  ui.toast('คัดลอกรหัสเกมและ PIN แล้ว', 'good');
                } catch {
                  ui.toast('คัดลอกไม่สำเร็จ กรุณาจดด้วยมือ', 'bad');
                }
              }}>คัดลอก</button>
            </div>
            <div className="mt-3"><PublicScreenCard gameId={vm.gameId} compact /></div>
            <button className="btn-ghost w-100 mt-2" onClick={() => setPinOnce('')}>จดแล้ว ปิดข้อความนี้</button>
          </div>
        )}
        {body}
      </main>

      {vm && (
        <nav id="bottomNav" className="show">
          {NAV.map((n) => {
            const reachable = openPages.has(n.key);
            return (
              <button key={n.key} disabled={!reachable}
                      className={'nb' + (page === n.key ? ' active' : '')}
                      onClick={() => setPage(n.key)}>
                <span>{n.icon}</span>{n.label}
              </button>
            );
          })}
        </nav>
      )}

      {tools && vm && (
        <Modal title="เครื่องมือผู้ดำเนินเกม" onClose={() => setTools(false)}>
          <div className="toollist">
            <button className="toolbtn" onClick={toolSwap}>
              <span>🔄</span><span><b>สลับบทบาทระหว่างผู้เล่นสองคน</b>
                <small>ใช้เมื่อบันทึกการ์ดสลับคนกัน</small></span>
            </button>
            <button className="toolbtn" onClick={toolReopen}>
              <span>🔓</span><span><b>กลับไปแก้การแจกบทบาท</b>
                <small>ถ้าเกมเริ่มแล้วจะกู้สถานะกลับไปก่อนคืนแรก ใช้เมื่อแจกผิดตั้งแต่ต้น</small></span>
            </button>
            <button className="toolbtn" onClick={toolKill}>
              <span>☠️</span><span><b>สั่งให้ผู้เล่นเสียชีวิต</b>
                <small>ใช้เมื่อมีเหตุนอกกติกา เช่น ผู้เล่นออกกลางคัน</small></span>
            </button>
            <button className="toolbtn" onClick={() => { setTools(false); setShowPublic(true); }}>
              <span>📺</span><span><b>เปิดจอสาธารณะบนทีวี</b>
                <small>แสดง QR ให้สแกน ไม่ต้องพิมพ์รหัสเกม</small></span>
            </button>
            <a className="toolbtn" href={'/api/game/' + encodeURIComponent(vm.gameId) + '/players.csv'}>
              <span>📄</span><span><b>ส่งออกตารางผู้เล่น (CSV)</b>
                <small>เปิดใน Google Sheets หรือ Excel ได้ทันที</small></span>
            </a>
            <button className="toolbtn" onClick={() => { setTools(false); openLog(); }}>
              <span>📋</span><span><b>บันทึกเหตุการณ์</b>
                <small>ดูลำดับเหตุการณ์ทั้งหมดของเกมนี้</small></span>
            </button>
            <button className="toolbtn" onClick={toolEnd}>
              <span>🏁</span><span><b>จบเกมทันที</b>
                <small>ปิดเกมโดยไม่รอเงื่อนไขชนะ</small></span>
            </button>
          </div>
          <div className="hint mt-2">
            สถานะปัจจุบัน: {vm.statusTh} • ทุกคำสั่งสำคัญย้อนกลับได้ด้วยปุ่ม ↩️
          </div>
        </Modal>
      )}

      {showPublic && vm && (
        <Modal title="จอสาธารณะ" onClose={() => setShowPublic(false)}>
          <PublicScreenCard gameId={vm.gameId} compact />
        </Modal>
      )}

      {log && (
        <Modal title="บันทึกเหตุการณ์" onClose={() => setLog(null)}>
          <div className="reslist" style={{ maxHeight: '60vh', overflow: 'auto' }}>
            {!log.length && <div>ยังไม่มีเหตุการณ์</div>}
            {log.map((r, i) => (
              <div key={i}><b>{r.type}</b> <span className="hint">{r.at}</span></div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
