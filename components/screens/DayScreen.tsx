'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ModeratorViewModel } from '@/lib/types.ts';
import { useUi } from '@/components/ui';

interface Props {
  vm: ModeratorViewModel;
  onStartDiscussion: () => void;
  onOpenNomination: () => void;
  onCloseNomination: (nomineeIds: string[]) => void;
  onSubmitVotes: (votes: Record<string, string>) => void;
  onResolveVote: (choice?: string) => void;
  onForceEndDay: () => void;
  onModeratorKill: (playerId: string, reason: string) => void;
  onResolvePrompt: (promptId: string, targetId: string | null) => void;
}

export default function DayScreen(props: Props) {
  const { vm } = props;
  return (
    <section className="page active">
      <DawnBox vm={vm} />
      <DayBox {...props} />
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
  const [nominees, setNominees] = useState<string[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});

  /* A new day (or a re-opened nomination) must not inherit yesterday's picks. */
  useEffect(() => { setNominees([]); setVotes({}); }, [vm.dayNumber, vm.status]);

  const askTieChoice = async () => {
    const options = vm.day!.nominees.map((id) => ({
      value: id, label: vm.players.find((p) => p.playerId === id)?.name || id
    }));
    const res = await ui.confirm({
      title: 'คะแนนเสมอ', icon: '⚖️',
      text: 'กติกาที่เลือกไว้ให้ผู้ดำเนินเกมเป็นผู้ตัดสิน',
      select: [{ label: 'ผู้ถูกกำจัด', options }],
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

  if (vm.status === 'DAWN') {
    return (
      <div className="card2">
        <h6>ช่วงกลางวัน</h6>
        <p className="hint">ประกาศผลให้ทุกคนทราบ แล้วเริ่มช่วงอภิปราย</p>
        <button className="btn-p w-100" onClick={props.onStartDiscussion}>💬 เริ่มช่วงอภิปราย</button>
      </div>
    );
  }

  if (vm.status === 'DISCUSSION') {
    return (
      <div className="card2">
        <h6>ช่วงอภิปราย</h6>
        <Countdown endsAt={vm.day?.discussionEndsAt || 0} />
        <p className="hint">ให้ทุกคนถกกันจนหมดเวลา หรือกดเปิดการเสนอชื่อได้เลยเมื่อพร้อม</p>
        <button className="btn-p w-100" onClick={props.onOpenNomination}>☝️ เปิดการเสนอชื่อ</button>
        <button className="btn-ghost w-100 mt-2" onClick={confirmEndDay}>ข้ามการแขวนคอวันนี้</button>
      </div>
    );
  }

  if (vm.status === 'NOMINATION') {
    return (
      <div className="card2">
        <h6>ช่วงเสนอชื่อ</h6>
        <Countdown endsAt={vm.day?.nominationEndsAt || 0} />
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

  if (vm.status === 'VOTING') {
    const voters = vm.day?.eligibleVoters || [];
    const nomineeIds = vm.day?.nominees || [];
    return (
      <div className="card2">
        <h6>ลงคะแนน</h6>
        <p className="hint">บันทึกคะแนนของผู้มีสิทธิ์ทุกคน แล้วกดสรุปผล</p>
        {voters.map((v) => (
          <div className="vrow" key={v.playerId}>
            <div className="pname">
              {v.name}{v.weight > 1 && <span className="badge2">น้ำหนัก {v.weight}</span>}
            </div>
            <select className="inp vpick" value={votes[v.playerId] || ''}
                    onChange={(e) => setVotes({ ...votes, [v.playerId]: e.target.value })}>
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
        <button className="btn-p w-100 mt-3" onClick={() => {
          const clean: Record<string, string> = {};
          for (const [k, v] of Object.entries(votes)) if (v) clean[k] = v;
          if (!Object.keys(clean).length) { ui.toast('ยังไม่มีคะแนน', 'bad'); return; }
          props.onSubmitVotes(clean);
        }}>บันทึกคะแนนทั้งหมด</button>
        <button className="btn-gold w-100 mt-2" onClick={() => props.onResolveVote()}>
          สรุปผลการลงคะแนน
        </button>
        {vm.ruleVariants.tieVoteRule === 'MODERATOR_DECIDES' && (
          <button className="btn-ghost w-100 mt-2" onClick={askTieChoice}>
            เลือกผู้ถูกกำจัดเอง (กรณีคะแนนเสมอ)
          </button>
        )}
        <button className="btn-ghost w-100 mt-2" onClick={confirmEndDay}>ปิดวันโดยไม่แขวนคอ</button>
      </div>
    );
  }

  if (vm.status === 'RESOLVE_DAY') {
    return (
      <div className="card2">
        <h6>สรุปผลกลางวัน</h6>
        <button className="btn-p w-100" onClick={props.onForceEndDay}>🌙 เข้าสู่คืนถัดไป</button>
      </div>
    );
  }

  if (vm.status === 'DEATH_TRIGGER') {
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

function Countdown({ endsAt }: { endsAt: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return <div className={'timer' + (left <= 30 ? ' low' : '')}>{mm}:{ss}</div>;
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
