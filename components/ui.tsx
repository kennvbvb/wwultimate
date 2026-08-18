'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/* ---------------- loading veil ---------------- */

export function Loading({ show }: { show: boolean }) {
  return <div id="ld" className={show ? 'show' : ''}><div className="spinner" /></div>;
}

/* ---------------- privacy cover ---------------- */

/**
 * The single most-used control in a real game: someone walks past the phone and
 * the moderator needs the screen blank *now*, without losing their place.
 */
export function PrivacyCover({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <div id="cover" className={show ? 'show' : ''} onClick={onHide}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '4rem' }}>🙈</div>
        <h3 className="mt-3">ซ่อนข้อมูลลับอยู่</h3>
        <p className="muted">แตะเพื่อแสดงอีกครั้ง</p>
      </div>
    </div>
  );
}

/* ---------------- toasts ---------------- */

type ToastKind = 'info' | 'good' | 'bad';
interface ToastItem { id: number; text: string; kind: ToastKind }

interface UiApi {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<ConfirmResult>;
}

const UiContext = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi ต้องอยู่ภายใน <UiProvider>');
  return ctx;
}

/* ---------------- confirm / prompt dialog ---------------- */

export interface ConfirmOptions {
  title: string;
  text?: string;
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  /** Adds a free-text field; its value comes back in `value`. */
  input?: { label: string; placeholder?: string; initial?: string };
  /** Adds a dropdown; its value comes back in `choice`. */
  select?: { label: string; options: { value: string; label: string }[]; initial?: string }[];
  danger?: boolean;
}

export interface ConfirmResult {
  confirmed: boolean;
  value?: string;
  choices?: string[];
}

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((list) => list.concat({ id, text, kind }));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setDialog(opts);
    return new Promise<ConfirmResult>((resolve) => { resolver.current = resolve; });
  }, []);

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  const finish = (result: ConfirmResult) => {
    setDialog(null);
    resolver.current?.(result);
    resolver.current = null;
  };

  return (
    <UiContext.Provider value={api}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => <div key={t.id} className={'toast ' + (t.kind === 'info' ? '' : t.kind)}>{t.text}</div>)}
      </div>
      {dialog && <DialogBox options={dialog} onDone={finish} />}
    </UiContext.Provider>
  );
}

function DialogBox({ options, onDone }: { options: ConfirmOptions; onDone: (r: ConfirmResult) => void }) {
  const [value, setValue] = useState(options.input?.initial || '');
  const [choices, setChoices] = useState<string[]>(
    (options.select || []).map((s) => s.initial || s.options[0]?.value || ''));

  return (
    <div className="dlg-back" onClick={() => onDone({ confirmed: false })}>
      <div className="dlg" onClick={(e) => e.stopPropagation()}>
        {options.icon && <span className="dlg-icon">{options.icon}</span>}
        <h4>{options.title}</h4>
        {options.text && <p className="hint">{options.text}</p>}

        {(options.select || []).map((sel, i) => (
          <div key={sel.label} className="mt-2">
            <label className="lbl">{sel.label}</label>
            <select
              className="inp"
              value={choices[i]}
              onChange={(e) => setChoices((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
            >
              {sel.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}

        {options.input && (
          <div className="mt-2">
            <label className="lbl">{options.input.label}</label>
            <input
              className="inp"
              placeholder={options.input.placeholder || ''}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="dlg-actions">
          <button className="btn-ghost" onClick={() => onDone({ confirmed: false })}>
            {options.cancelText || 'ยกเลิก'}
          </button>
          <button
            className={options.danger ? 'btn-r' : 'btn-p'}
            onClick={() => onDone({ confirmed: true, value, choices })}
          >
            {options.confirmText || 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- plain modal (event log, summaries) ---------------- */

export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="dlg-back" onClick={onClose}>
      <div className="dlg" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        {children}
        <div className="dlg-actions">
          <button className="btn-ghost" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}
