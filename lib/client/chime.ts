/**
 * The discussion clock runs while the moderator is watching the table, not the
 * phone. A short tone and a buzz are the only way the deadline reaches them.
 */

const WARN_AT = 30;

/** Which alert, if any, this tick just crossed. Pure, so it can be tested. */
export function chimeFor(previousLeft: number, left: number): 'warn' | 'end' | null {
  if (previousLeft > 0 && left <= 0) return 'end';
  if (previousLeft > WARN_AT && left <= WARN_AT) return 'warn';
  return null;
}

const SOUND_KEY = 'uw_sound_v1';

export function soundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** Two beeps for time-up, one for the warning. Synthesised, so there is no asset to load. */
export function playChime(kind: 'warn' | 'end'): void {
  if (!soundEnabled()) return;

  try {
    if (navigator.vibrate) navigator.vibrate(kind === 'end' ? [180, 90, 180] : 120);
  } catch { /* unsupported, no harm */ }

  const ctx = audioContext();
  if (!ctx) return;
  /* Mobile browsers suspend the context until a gesture; by the time a clock is
   * running the moderator has tapped plenty, so this simply resumes it. */
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* stays silent */ });

  const beeps = kind === 'end' ? [0, 0.28] : [0];
  for (const offset of beeps) {
    const at = ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'end' ? 660 : 880, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.24);
  }
}
