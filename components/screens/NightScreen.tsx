'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModeratorViewModel, NightStep } from '@/lib/types.ts';
import { useUi } from '@/components/ui';

interface Props {
  vm: ModeratorViewModel;
  onSubmitStep: (stepId: string, targetIds: string[], meta: Record<string, unknown>) => void;
  onSkipStep: (stepId: string) => void;
  onResolveNight: () => void;
  onResolvePrompt: (promptId: string, targetId: string | null) => void;
}

export default function NightScreen(props: Props) {
  const { vm } = props;
  const prompt = vm.pendingPrompts[0];

  return (
    <section className="page active">
      {prompt
        ? <PromptBox vm={vm} prompt={prompt} onAnswer={props.onResolvePrompt} />
        : <StepCard {...props} />}
      <NightResults vm={vm} />
      <StepList vm={vm} />
    </section>
  );
}

function PromptBox({ vm, prompt, onAnswer }: {
  vm: ModeratorViewModel;
  prompt: ModeratorViewModel['pendingPrompts'][number];
  onAnswer: (promptId: string, targetId: string | null) => void;
}) {
  return (
    <>
      <div className="card2 warn-box">
        <span>⚠️</span>
        <div>
          <b>{prompt.titleTh}</b>
          <div className="hint">{String(prompt.hintTh || '')}</div>
        </div>
      </div>
      <div className="card2">
        <div className="targets">
          {vm.players.filter((p) => p.alive && p.playerId !== prompt.playerId).map((p) => (
            <button className="tgt" key={p.playerId}
                    onClick={() => onAnswer(prompt.promptId, p.playerId)}>
              {p.name}<small>ที่นั่ง {p.seat}</small>
            </button>
          ))}
        </div>
        <button className="btn-ghost w-100" onClick={() => onAnswer(prompt.promptId, 'SKY')}>
          ยิงขึ้นฟ้า (ไม่โดนใคร)
        </button>
      </div>
    </>
  );
}

function StepCard({ vm, onSubmitStep, onSkipStep, onResolveNight }: Props) {
  const ui = useUi();
  const step = vm.currentStep;
  const [targets, setTargets] = useState<string[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});

  useEffect(() => { setTargets([]); setMeta({}); }, [step?.stepId, vm.version]);

  if (!step) {
    const allDone = vm.night && vm.night.stepIndex >= vm.night.totalSteps;
    return (
      <div className="card2 step-card">
        {allDone && vm.night && !vm.night.resolved ? (
          <>
            <div className="step-role">ครบทุกขั้นตอนแล้ว</div>
            <p className="hint">กดเพื่อประมวลผลกลางคืนและเปิดรุ่งเช้า</p>
            <button className="btn-gold w-100" onClick={onResolveNight}>🌅 สรุปผลกลางคืน</button>
          </>
        ) : <div className="hint">ไม่มีขั้นตอนที่ต้องทำ</div>}
      </div>
    );
  }

  const actorNames = step.actorIds
    .map((id) => vm.players.find((p) => p.playerId === id)?.name || id)
    .join(', ');

  const pick = (playerId: string) => {
    setTargets((cur) => {
      if (cur.indexOf(playerId) >= 0) return cur.filter((t) => t !== playerId);
      const next = cur.slice();
      if (next.length >= step.maxTargets) next.shift();
      return next.concat(playerId);
    });
  };

  const submit = () => {
    if (step.maxTargets > 0 && targets.length < step.minTargets && !step.optional) {
      ui.toast('ต้องเลือกอย่างน้อย ' + step.minTargets + ' คน', 'bad');
      return;
    }
    onSubmitStep(step.stepId, targets, meta);
  };

  const speak = () => {
    if (!('speechSynthesis' in window)) { ui.toast('อุปกรณ์นี้ไม่รองรับการอ่านออกเสียง'); return; }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(step.titleTh + '. ' + (step.scriptTh || ''));
      utterance.lang = 'th-TH';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch { ui.toast('อ่านออกเสียงไม่สำเร็จ', 'bad'); }
  };

  return (
    <div className="card2 step-card">
      <div className="step-role">{step.titleTh}</div>
      <div className="step-meta">
        ขั้นที่ {(vm.night?.stepIndex ?? 0) + 1} / {vm.night?.totalSteps ?? 0}
        {actorNames ? ' • ผู้ใช้พลัง: ' + actorNames : ''}
      </div>
      <div className="step-script">{step.scriptTh}</div>
      {step.noteTh && <div className="step-note">ℹ️ {step.noteTh}</div>}

      {step.stepId === 'witch'
        ? <WitchUi vm={vm} meta={meta} setMeta={setMeta} />
        : step.stepId === 'alpha_wolf'
          ? <ToggleUi label="ใช้พลังเปลี่ยนเหยื่อคืนนี้ให้เป็นหมาป่า" k="convert" meta={meta} setMeta={setMeta} />
          : step.stepId === 'troublemaker'
            ? <ToggleUi label="ใช้พลัง ทำให้พรุ่งนี้แขวนคอสองครั้ง" k="use" meta={meta} setMeta={setMeta} />
            : step.maxTargets > 0
              ? <TargetGrid vm={vm} step={step} targets={targets} onPick={pick} />
              : <div className="hint">ขั้นตอนนี้ไม่ต้องเลือกเป้าหมาย</div>}

      <div className="row-gap mt-3">
        <button className="btn-p w-100" onClick={submit}>✔ บันทึก</button>
        {step.optional && <button className="btn-ghost" onClick={() => onSkipStep(step.stepId)}>ข้าม</button>}
      </div>
      <button className="btn-ghost w-100 mt-2" onClick={speak}>🔊 อ่านบทออกเสียง</button>
      <StepTimer stepId={step.stepId} seconds={vm.ruleVariants.nightActionSeconds} />
    </div>
  );
}

function TargetGrid({ vm, step, targets, onPick }: {
  vm: ModeratorViewModel; step: NightStep; targets: string[]; onPick: (id: string) => void;
}) {
  /* The server says which names it would refuse and why, so the moderator finds
   * out before tapping instead of after a rejected command. */
  const hints = vm.targetHints || {};
  return (
    <>
      <div className="targets">
        {vm.players.map((p) => {
          const why = hints[p.playerId] || '';
          const disabled = !!why;
          const selected = targets.indexOf(p.playerId) >= 0;
          return (
            <button key={p.playerId} disabled={disabled}
                    className={'tgt' + (disabled ? ' dis' : '') + (selected ? ' sel' : '')}
                    onClick={() => onPick(p.playerId)}>
              {p.name}<small>ที่นั่ง {p.seat}</small>
              {why && <span className="why">{why}</span>}
            </button>
          );
        })}
      </div>
      <div className="hint">
        เลือกได้ {step.minTargets}–{step.maxTargets} คน
        {step.requireAdjacentSecond ? ' • เหยื่อคนที่สองต้องนั่งติดกับคนแรก' : ''}
      </div>
    </>
  );
}

function WitchUi({ vm, meta, setMeta }: {
  vm: ModeratorViewModel; meta: Record<string, unknown>; setMeta: (m: Record<string, unknown>) => void;
}) {
  const alive = vm.players.filter((p) => p.alive);
  return (
    <>
      <div>
        <label className="lbl">ใช้ยาชุบชีวิตกับเหยื่อคืนนี้</label>
        <select className="inp" value={String(meta.healTargetId || '')}
                onChange={(e) => setMeta({ ...meta, heal: !!e.target.value, healTargetId: e.target.value })}>
          <option value="">— ไม่เลือก —</option>
          {alive.map((p) => <option key={p.playerId} value={p.playerId}>{p.name} (ที่นั่ง {p.seat})</option>)}
        </select>
      </div>
      <div className="mt-2">
        <label className="lbl">ใช้ยาพิษกับ</label>
        <select className="inp" value={String(meta.killTargetId || '')}
                onChange={(e) => setMeta({ ...meta, killTargetId: e.target.value })}>
          <option value="">— ไม่เลือก —</option>
          {alive.map((p) => <option key={p.playerId} value={p.playerId}>{p.name} (ที่นั่ง {p.seat})</option>)}
        </select>
      </div>
      <div className="hint">เว้นว่างทั้งสองช่องหากคืนนี้ยังไม่ใช้พลัง</div>
    </>
  );
}

function ToggleUi({ label, k, meta, setMeta }: {
  label: string; k: string; meta: Record<string, unknown>; setMeta: (m: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <select className="inp" value={meta[k] ? '1' : '0'}
              onChange={(e) => setMeta({ ...meta, [k]: e.target.value === '1' })}>
        <option value="0">ไม่ใช้</option>
        <option value="1">ใช้</option>
      </select>
    </div>
  );
}

/** Advisory clock per night step — it never blocks, it just nudges. */
function StepTimer({ stepId, seconds }: { stepId: string; seconds: number }) {
  const [left, setLeft] = useState(seconds);
  const endsAt = useRef(0);
  const forStep = useRef('');

  useEffect(() => {
    if (!seconds) return;
    if (forStep.current !== stepId) {
      forStep.current = stepId;
      endsAt.current = Date.now() + seconds * 1000;
    }
    const tick = () => setLeft(Math.round((endsAt.current - Date.now()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stepId, seconds]);

  if (!seconds) return null;
  const over = left < 0;
  return (
    <div className={'steptimer' + (over ? ' over' : left <= 10 ? ' low' : '')}>
      {over ? '⌛ เกินเวลาแนะนำ ' + (-left) + ' วินาที — เร่งผู้เล่นได้แล้ว'
            : '⏳ เหลือเวลาแนะนำ ' + left + ' วินาที'}
    </div>
  );
}

function NightResults({ vm }: { vm: ModeratorViewModel }) {
  const results = (vm.night?.results || []) as { titleTh: string; infoTh: string }[];
  if (!results.length) return null;
  return (
    <div className="card2">
      <h6>📓 สิ่งที่บันทึกไว้คืนนี้</h6>
      <div className="reslist">
        {results.map((r, i) => <div key={i}><b>{r.titleTh}</b> — {r.infoTh}</div>)}
      </div>
    </div>
  );
}

function StepList({ vm }: { vm: ModeratorViewModel }) {
  if (!vm.night) return null;
  return (
    <div className="card2">
      <h6>🔢 ลำดับการปลุกคืนนี้</h6>
      {vm.night.steps.map((s, i) => {
        const cls = s.status === 'DONE' ? 'dot done'
          : s.status === 'SKIPPED' ? 'dot skip'
            : i === vm.night!.stepIndex ? 'dot now' : 'dot';
        return (
          <div className="steprow" key={s.stepId}>
            <span className={cls} /><span>{s.titleTh}</span>
          </div>
        );
      })}
    </div>
  );
}
