export type ToneKind = "assigned-mine" | "new-in-queue";

export interface ITonePlayer {
  /** Resume the AudioContext on a user gesture (bypasses autoplay policy). Idempotent. */
  unlock(): void;
  /** Play a named tone pattern. `volume` 0..1. Best-effort — never throws. */
  play(kind: ToneKind, volume: number): void;
}

interface ITone {
  freq: number;
  durationMs: number;
}

/**
 * "assigned-mine": one short, discreet tone — a message landed on a
 * conversation of mine that's already being handled.
 * "new-in-queue": two ascending tones — more attention-grabbing, since a new
 * customer is waiting to be picked up (implies an SLA).
 */
const PATTERNS: Record<ToneKind, ITone[]> = {
  "assigned-mine": [{ freq: 520, durationMs: 140 }],
  "new-in-queue": [
    { freq: 660, durationMs: 110 },
    { freq: 880, durationMs: 110 },
  ],
};

type AudioContextCtor = typeof AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * Creates a tone player backed by the Web Audio API. Independent from
 * `session-timeout/lib/beep.ts` on purpose — that module is already tested
 * and shipped in production; this feature gets its own small, focused motor
 * instead of risking a shared-code regression there.
 * Degrades to a no-op when Web Audio is unavailable or blocked.
 */
export function createTonePlayer(): ITonePlayer {
  const Ctx = resolveAudioContextCtor();
  if (!Ctx) {
    return { unlock: () => {}, play: () => {} };
  }

  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    try {
      if (!ctx) ctx = new Ctx();
      return ctx;
    } catch {
      return null;
    }
  };

  function playTone(c: AudioContext, tone: ITone, startAt: number, volume: number): number {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const peak = Math.min(1, Math.max(0, volume)) * 0.2; // headroom cap
    osc.type = "sine";
    osc.frequency.value = tone.freq;
    const durationSec = tone.durationMs / 1000;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + 0.01);
    gain.gain.linearRampToValueAtTime(0, startAt + durationSec);
    osc.connect(gain).connect(c.destination);
    osc.start(startAt);
    osc.stop(startAt + durationSec + 0.02);
    return startAt + durationSec;
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") void c.resume();
    },
    play(kind, volume) {
      const c = ensure();
      if (!c) return;
      try {
        if (c.state === "suspended") void c.resume();
        let t = c.currentTime;
        for (const tone of PATTERNS[kind]) {
          t = playTone(c, tone, t, volume);
        }
      } catch {
        /* best-effort — ignore audio failures */
      }
    },
  };
}
