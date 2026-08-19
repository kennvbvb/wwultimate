'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ModeratorViewModel } from '@/lib/types.ts';
import { useUi } from '@/components/ui';

interface Props {
  vm: ModeratorViewModel;
  onStartDiscussion: () => void;
  onOpenNomination: () => void;
  onCloseNomination: (nomineeIds: string[]) => void;
  onSubmitVotes: (votes: Record<string, string>) => Promise<boolean>;
  onResolveVote: (choice?: string) => void | Promise<void>;
  onForceEndDay: () => void;
  onModeratorKill: (playerId: string, reason: string) => void;
  onResolvePrompt: (promptId: string, targetId: string | null) => void;
}

export default function DayScreen(props: Props) {
  const { vm } = props;
  return (
    <section className="page active">
      <DawnBox vm={vm} />
      {/* While paused the phase stays on screen so the moderator keeps their
          place, but its controls are inert — the only way on is "เล่นต่อ". */}
      <div className={vm.paused ? 'paused-dim' : undefined}>
        <DayBox {...props} />
      </div>
      <PlayerStatus vm={vm} onModeratorKill={props.onModeratorKill} />
    </section>
  );
}

function DawnBox({ vm }: { vm: ModeratorViewModel }) {
  const deaths = (vm.night?.deaths || []) as (string | { playerId: string })[];
  const reveal = vm.ruleVariants.roleRevealMode;
  return (
    <div className="card2">
      <h6>🌅 รุ่งเช้าวันที่ {vm.dayNumber}</h6>
      {!deaths.length && <div className="hint">คืนที่ผ่านมาไม่มีผู้เสียชีวิต</div>}
      {deaths.map((d, i) => {
        const playerId = typeof d === 'string' ? d : d.playerId;
        const p = vm.players.find((x) => x.playerId === playerId);
        const roleText = !p ? '' : reveal === 'FULL' ? p.currentRoleTh : reveal === 'TEAM_ONLY' ? p.teamTh : '';
        return (
          <div className="deadrow" key={i}>
            <span>💀</span>
            <div>
              <b>{p ? p.name : playerId}</b>
              <div className="hint">
                {p?.deathInfo?.causeTh || ''}{roleText ? ' • ' + roleText : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayBox(props: Props) {
  const { vm } = props;
  const ui = useUi();
  /* A break must not blank the screen: keep rendering the phase it paused from. */
  const phase = vm.paused ? vm.paused.from : vm.status;
  const [nominees, setNominees] = useState<string[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  /* A new day (or a re-opened nomination) must not inherit yesterday's picks.
   * Votes already recorded on the server are loaded back, so a reload or a
   * second device picks up where the moderator left off. */
  useEffect(() => {
    setNominees([]);
    setVotes((vm.day?.votes as Record<string, string>) || {});
    setDirty(false);
  }, [vm.dayNumber, vm.status, vm.day?.votes]);

  /* Only the players who actually tied may be picked — the server enforces the
   * same list, so a stale screen cannot hang somebody who was never in the running. */
  const askTieChoice = async (candidates: { playerId: string; name: string }[]) => {
    const res = await ui.confirm({
      title: 'คะแนนเสมอ', icon: '⚖️',
      text: 'กติกาที่เลือกไว้ให้ผู้ดำเนินเกมเป็นผู้ตัดสิน เลือกได้เฉพาะผู้ที่คะแนนเท่ากัน',
      select: [{ label: 'ผู้ถูกกำจัด', options: candidates.map((c) => ({ value: c.playerId, label: c.name })) }],
      confirmText: 'ยืนยัน'
    });
    if (res.confirmed && res.choices?.[0]) props.onResolveVote(res.choices[0]);
  };

  const confirmEndDay = async () => {
    const res = await ui.confirm({
      title: 'ปิดวันโดยไม่แขวนคอ', icon: '🌙', confirmText: 'ปิดวัน'
    });
    if (res.confirmed) props.onForceEndDay();
  };

  if (phase === 'DAWN') {
    return (
      <div className="card2">
        <h6>ช่วงกลางวัน</h6>
        <p className="hint">ประกาศผลให้ทุกคนทราบ แล้วเริ่มช่วงอภิปราย</p>
        <button className="btn-p w-100" onClick={props.onStartDiscussion}>💬 เริ่มช่วงอภิปราย</button>
      </div>
    );
  }

  if (phase === 'DISCUSSION') {
    return (
      <div className="card2">
        <h6>ช่วงอภิปราย</h6>
        <Countdown endsAt={vm.day?.discussionEndsAt || 0} frozenAt={vm.paused?.at} />
        <p className="hint">ให้ทุกคนถกกันจนหมดเวลา หรือกดเปิดการเสนอชื่อได้เลยเมื่อพร้อม</p>
        <button className="btn-p w-100" onClick={props.onOpenNomination}>☝️ เปิดการเสนอชื่อ</button>
        <button className="btn-ghost w-100 mt-2" onClick={confirmEndDay}>ข้ามการแขวนคอวันนี้</button>
      </div>
    );
  }

  if (phase === 'NOMINATION') {
    return (
      <div className="card2">
        <h6>ช่วงเสนอชื่อ</h6>
        <Countdown endsAt={vm.day?.nominationEndsAt || 0} frozenAt={vm.paused?.at} />
        <p className="hint">แตะชื่อผู้ที่ถูกเสนอ แล้วปิดการเสนอชื่อเพื่อเข้าสู่การลงคะแนน</p>
        {vm.players.filter((p) => p.alive).map((p) => {
          const on = nominees.indexOf(p.playerId) >= 0;
          const exiled = p.statuses.some((s) => s.indexOf('ส่งออก') >= 0);
          return (
            <div className="vrow" key={p.playerId}>
              <div className="seatno">{p.seat}</div>
              <div className="pname">
                {p.name}{exiled && <span className="badge2 bad">ถูกส่งออก</span>}
              </div>
              <button className={on ? 'btn-gold' : 'btn-ghost'} disabled={exiled}
                      onClick={() => setNominees((cur) =>
                        on ? cur.filter((id) => id !== p.playerId) : cur.concat(p.playerId))}>
                {on ? 'ถูกเสนอชื่อ' : 'เสนอชื่อ'}
              </button>
            </div>
          );
        })}
        <button className="btn-p w-100 mt-3" disabled={!nominees.length}
                onClick={() => props.onCloseNomination(nominees)}>
          ✋ ปิดการเสนอชื่อและเริ่มลงคะแนน
        </button>
        <button className="btn-ghost w-100 mt-2" onClick={confirmEndDay}>ข้ามการแขวนคอวันนี้</button>
      </div>
    );
  }

  if (phase === 'VOTING') {
    const progress = vm.voteProgress;
    const voters = progress ? progress.eligible : (vm.day?.eligibleVoters || []);
    const nomineeIds = vm.day?.nominees || [];
    const missingLocally = voters.filter((v) => !votes[v.playerId]);
    const canClose = missingLocally.length === 0;

    const save = async () => {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(votes)) if (v) clean[k] = v;
      if (!Object.keys(clean).length) { ui.toast('ยังไม่มีคะแนน', 'bad'); return false; }
      const ok = await props.onSubmitVotes(clean);
      if (ok) setDirty(false);
      return ok;
    };

    const closeVote = async () => {
      if (!canClose) {
        ui.toast('ยังลงคะแนนไม่ครบ เหลือ ' + missingLocally.length + ' คน', 'bad');
        return;
      }
      /* Save first: if the close is rejected (tie needing a decision) the
       * recorded votes must survive, and a rolled-back command would lose them. */
      if (dirty && !(await save())) return;
      if (progress?.needsModeratorChoice) { await askTieChoice(progress.tieCandidates); return; }
      props.onResolveVote();
    };

    return (
      <div className="card2">
        <h6>ลงคะแนน</h6>
        <div className={'vote-progress' + (canClose ? ' done' : '')}>
          ลงแล้ว {voters.length - missingLocally.length} / {voters.length} คน
          {!canClose && <div className="hint">ยังไม่ได้ลง: {missingLocally.map((v) => v.name).join(', ')}</div>}
          {dirty && <div className="hint">มีคะแนนที่ยังไม่ได้บันทึกขึ้นเซิร์ฟเวอร์</div>}
        </div>
        <p className="hint">ผู้ที่ไม่ต้องการโหวตใคร ให้เลือก “งดโหวต / ไว้ชีวิต” เพื่อให้ครบทุกคน</p>

        {voters.map((v) => (
          <div className="vrow" key={v.playerId}>
            <div className="pname">
              {v.name}{v.weight > 1 && <span className="badge2">น้ำหนัก {v.weight}</span>}
            </div>
            <select className={'inp vpick' + (votes[v.playerId] ? '' : ' unset')}
                    value={votes[v.playerId] || ''}
                    onChange={(e) => { setVotes({ ...votes, [v.playerId]: e.target.value }); setDirty(true); }}>
              <option value="">— ยังไม่ลง —</option>
              {nomineeIds.map((id) => (
                <option key={id} value={id}>
                  {vm.players.find((p) => p.playerId === id)?.name || id}
                </option>
              ))}
              <option value="SPARE">งดโหวต / ไว้ชีวิต</option>
            </select>
          </div>
        ))}

        <button className="btn-p w-100 mt-3" disabled={!canClose} onClick={closeVote}>
          สรุปผลการลงคะแนน
        </button>
        <button className="btn-ghost w-100 mt-2" disabled={!dirty} onClick={save}>
          บันทึกคะแนนไว้ก่อน
        </button>
        <button className="btn-ghost w-100 mt-2" onClick={confirmEndDay}>ปิดวันโดยไม่แขวนคอ</button>
      </div>
    );
  }

  if (phase === 'RESOLVE_DAY') {
    return (
      <div className="card2">
        <h6>สรุปผลกลางวัน</h6>
        <button className="btn-p w-100" onClick={props.onForceEndDay}>🌙 เข้าสู่คืนถัดไป</button>
      </div>
    );
  }

  if (phase === 'DEATH_TRIGGER') {
    const prompt = vm.pendingPrompts[0];
    return (
      <div className="card2">
        <h6>รอผลกระทบจากการเสียชีวิต</h6>
        {prompt && (
          <>
            <div className="warn-box card2"><span>⚠️</span>
              <div><b>{prompt.titleTh}</b><div className="hint">{String(prompt.hintTh || '')}</div></div>
            </div>
            <div className="targets">
              {vm.players.filter((p) => p.alive && p.playerId !== prompt.playerId).map((p) => (
                <button className="tgt" key={p.playerId}
                        onClick={() => props.onResolvePrompt(prompt.promptId, p.playerId)}>
                  {p.name}<small>ที่นั่ง {p.seat}</small>
                </button>
              ))}
            </div>
            <button className="btn-ghost w-100"
                    onClick={() => props.onResolvePrompt(prompt.promptId, 'SKY')}>
              ยิงขึ้นฟ้า (ไม่โดนใคร)
            </button>
          </>
        )}
      </div>
    );
  }

  return <div className="card2"><div className="hint">{vm.statusTh}</div></div>;
}

/**
 * While the game is paused the clock is frozen at the moment the break started
 * — the deadline itself is shifted server-side on resume, so a ticking display
 * here would only be a lie the moderator has to explain.
 */
function Countdown({ endsAt, frozenAt }: { endsAt: number; frozenAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt || frozenAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, frozenAt]);

  if (!endsAt) return null;
  const reference = frozenAt || now;
  const left = Math.max(0, Math.floor((endsAt - reference) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={'timer' + (left <= 30 ? ' low' : '') + (frozenAt ? ' paused' : '')}>
      {mm}:{ss}
    </div>
  );
}

function PlayerStatus({ vm, onModeratorKill }: {
  vm: ModeratorViewModel; onModeratorKill: (playerId: string, reason: string) => void;
}) {
  const ui = useUi();
  const kill = async (playerId: string, name: string) => {
    const res = await ui.confirm({
      title: 'ให้ ' + name + ' เสียชีวิต', icon: '☠️', danger: true,
      input: { label: 'เหตุผล', placeholder: 'เช่น ออกจากเกม' }
    });
    if (res.confirmed) onModeratorKill(playerId, res.value || 'ผู้ดำเนินเกมตัดสิน');
  };

  return (
    <div className="card2">
      <h6>👥 สถานะผู้เล่น</h6>
      {vm.players.map((p) => (
        <div className={'prow' + (p.alive ? '' : ' dead')} key={p.playerId}>
          <div className="seatno">{p.seat}</div>
          <div className="pname">
            {p.name}
            <div className="hint">{p.currentRoleTh || '—'}{p.teamTh ? ' • ' + p.teamTh : ''}</div>
            {p.statuses.map((s) => <span className="badge2" key={s}>{s}</span>)}
            {p.changedTeam && <span className="badge2 bad">เปลี่ยนฝ่าย</span>}
          </div>
          {p.alive && (
            <button className="mini" title="สั่งให้เสียชีวิต"
                    onClick={() => kill(p.playerId, p.name)}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}
