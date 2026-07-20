import type { ISoundSettings, SoundEventId, SoundTemplateId } from "@/shared/types";
import { SOUND_TEMPLATES } from "../engine/soundTemplates";
import { resolveEventConfig } from "../engine/soundEvents";

export interface ISoundPlayer {
  /** Resume the AudioContext on a user gesture (bypasses autoplay policy). Idempotent. */
  unlock(): void;
  /** Play the template configured for `eventId`, honoring enabled/volume. Best-effort. */
  play(eventId: SoundEventId, settings: ISoundSettings | undefined): void;
  /** Play a template directly at `volume` 0..1 (Settings "test" button). Best-effort. */
  playTemplate(templateId: SoundTemplateId, volume: number): void;
  /** Close the AudioContext (call on unmount so mount/unmount cycles don't leak). */
  dispose(): void;
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
 * Central Web Audio player: the single place the whole app synthesizes
 * notification sounds. Reuses one AudioContext (not one per play). Degrades to a
 * no-op when Web Audio is unavailable or blocked — the visual UI never depends
 * on sound.
 */
export function createSoundPlayer(): ISoundPlayer {
  const Ctx = resolveAudioContextCtor();
  if (!Ctx) {
    return { unlock: () => {}, play: () => {}, playTemplate: () => {}, dispose: () => {} };
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

  const run = (templateId: SoundTemplateId, volume: number): void => {
    const c = ensure();
    if (!c) return;
    try {
      if (c.state === "suspended") void c.resume();
      SOUND_TEMPLATES[templateId].synth(c, c.currentTime, volume);
    } catch {
      /* best-effort — ignore audio failures */
    }
  };

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") void c.resume();
    },
    play(eventId, settings) {
      const cfg = resolveEventConfig(settings, eventId);
      if (!cfg.enabled) return;
      run(cfg.templateId, cfg.volume);
    },
    playTemplate(templateId, volume) {
      run(templateId, volume);
    },
    dispose() {
      if (!ctx) return;
      try {
        void ctx.close();
      } catch {
        /* best-effort */
      }
      ctx = null;
    },
  };
}
