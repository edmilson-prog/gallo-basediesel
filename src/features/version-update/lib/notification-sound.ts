type AudioContextConstructor = typeof AudioContext;

function resolveAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const target = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return target.AudioContext ?? target.webkitAudioContext;
}

/**
 * Plays a short two-tone chime for the update-available banner. Synthesized via
 * Web Audio API (no asset file to ship/cache). Best-effort: browsers may block
 * audio before any user gesture has occurred, so failures are swallowed — the
 * visual banner remains the source of truth regardless of sound.
 */
export function playUpdateAvailableSound(): void {
  const AudioContextCtor = resolveAudioContextConstructor();
  if (!AudioContextCtor) return;

  try {
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    const tones = [
      { frequency: 880, start: 0, duration: 0.12 },
      { frequency: 1108.73, start: 0.12, duration: 0.18 },
    ];
    const totalDuration = 0.3;

    for (const { frequency, start, duration } of tones) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration);
    }

    window.setTimeout(() => void ctx.close(), (totalDuration + 0.1) * 1000);
  } catch {
    // Autoplay/audio restrictions — fail silently.
  }
}
