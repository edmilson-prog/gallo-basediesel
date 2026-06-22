export interface IBeeper {
  /** Resume the AudioContext on a user gesture (bypasses autoplay policy). Idempotent. */
  unlock(): void;
  /** Play a short beep. `volume` 0..1, `urgency` 0..1 (raises pitch). Best-effort. */
  beep(volume: number, urgency: number): void;
}

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
 * Creates a beeper backed by the Web Audio API. Degrades to a no-op when Web
 * Audio is unavailable or blocked — the visual warning never depends on sound.
 */
export function createBeeper(): IBeeper {
  const Ctx = resolveAudioContextCtor();
  if (!Ctx) {
    return { unlock: () => {}, beep: () => {} };
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

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") void c.resume();
    },
    beep(volume, urgency) {
      const c = ensure();
      if (!c) return;
      try {
        if (c.state === "suspended") void c.resume();
        const osc = c.createOscillator();
        const gain = c.createGain();
        const freq = 660 + Math.min(1, Math.max(0, urgency)) * 440; // 660–1100 Hz
        const peak = Math.min(1, Math.max(0, volume)) * 0.2; // headroom cap
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = c.currentTime;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
        gain.gain.linearRampToValueAtTime(0, t0 + 0.16);
        osc.connect(gain).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + 0.18);
      } catch {
        /* best-effort — ignore audio failures */
      }
    },
  };
}
