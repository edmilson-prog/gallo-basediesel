import type { SoundTemplateId } from "@/shared/types";

export interface ISoundTemplate {
  id: SoundTemplateId;
  label: string;
  description: string;
  /** Synthesize into `ctx` starting at `when` (ctx time), scaled by `volume` 0..1. */
  synth: (ctx: AudioContext, when: number, volume: number) => void;
}

const clampVol = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** One enveloped oscillator note (attack → hold at peak → exponential release). */
function tone(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  when: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setValueAtTime(peak, when + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + release);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + attack + hold + release + 0.03);
}

/** Percussive mallet hit — instant attack, exponential decay (marimba). */
function mallet(ctx: AudioContext, freq: number, when: number, peak: number, decay: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(peak, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + decay + 0.03);
}

function synthMarimba(ctx: AudioContext, when: number, volume: number): void {
  const v = clampVol(volume);
  const notes: Array<[number, number]> = [
    [523.25, 0],
    [659.25, 0.12],
    [783.99, 0.24],
  ];
  for (const [f, dt] of notes) {
    mallet(ctx, f, when + dt, 0.5 * v, 0.35);
    mallet(ctx, f * 4, when + dt, 0.1 * v, 0.35);
  }
}

function synthDiesel(ctx: AudioContext, when: number, volume: number): void {
  const v = clampVol(volume);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(48, when);
  osc.frequency.exponentialRampToValueAtTime(130, when + 0.4);
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.type = "square";
  lfo.frequency.setValueAtTime(9, when);
  lfo.frequency.exponentialRampToValueAtTime(24, when + 0.4);
  lg.gain.value = 0.22 * v;
  lfo.connect(lg).connect(gain.gain);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(0.5 * v, when + 0.05);
  gain.gain.setValueAtTime(0.5 * v, when + 0.34);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.55);
  lfo.start(when);
  lfo.stop(when + 0.55);
  tone(ctx, "triangle", 1318.51, when + 0.46, 0.4 * v, 0.01, 0.03, 0.16);
  tone(ctx, "triangle", 1567.98, when + 0.56, 0.46 * v, 0.01, 0.09, 0.3);
}

function synthBuzina(ctx: AudioContext, when: number, volume: number): void {
  const v = clampVol(volume);
  for (const f of [146.83, 185.0]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f * 0.97, when);
    osc.frequency.linearRampToValueAtTime(f, when + 0.07);
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    vib.type = "sine";
    vib.frequency.value = 5;
    vg.gain.value = f * 0.008;
    vib.connect(vg).connect(osc.frequency);
    vib.start(when);
    vib.stop(when + 0.7);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.26 * v, when + 0.03);
    gain.gain.setValueAtTime(0.26 * v, when + 0.48);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.62);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.7);
  }
}

function synthSino(ctx: AudioContext, when: number, volume: number): void {
  const v = clampVol(volume);
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.18;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  delay.connect(fb).connect(delay);
  delay.connect(ctx.destination);
  for (const base of [880, 1174.66]) {
    const car = ctx.createOscillator();
    const cg = ctx.createGain();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.type = "sine";
    car.frequency.value = base;
    mod.type = "sine";
    mod.frequency.value = base * 1.41;
    mg.gain.setValueAtTime(base * 0.7, when);
    mg.gain.exponentialRampToValueAtTime(1, when + 0.6);
    mod.connect(mg).connect(car.frequency);
    cg.gain.setValueAtTime(0.45 * v, when);
    cg.gain.exponentialRampToValueAtTime(0.0001, when + 1.35);
    car.connect(cg);
    cg.connect(ctx.destination);
    cg.connect(delay);
    car.start(when);
    car.stop(when + 1.45);
    mod.start(when);
    mod.stop(when + 1.45);
  }
}

function synthPowerup(ctx: AudioContext, when: number, volume: number): void {
  const v = clampVol(volume);
  [523, 659, 784, 1046, 1318, 1568].forEach((f, i) =>
    tone(ctx, "square", f, when + i * 0.06, 0.2 * v, 0.005, 0.02, 0.05),
  );
  tone(ctx, "square", 2093, when + 0.36, 0.18 * v, 0.005, 0.05, 0.16);
}

function synthFanfarra(ctx: AudioContext, when: number, volume: number): void {
  const v = clampVol(volume);
  tone(ctx, "triangle", 392.0, when + 0.0, 0.38 * v, 0.01, 0.05, 0.1);
  tone(ctx, "triangle", 523.25, when + 0.14, 0.38 * v, 0.01, 0.05, 0.1);
  tone(ctx, "triangle", 659.25, when + 0.28, 0.38 * v, 0.01, 0.05, 0.1);
  for (const f of [783.99, 1046.5, 1318.51]) {
    tone(ctx, "triangle", f, when + 0.42, 0.26 * v, 0.01, 0.22, 0.5);
  }
}

/** Ported from the retired inbox tonePlayer "assigned-mine": one short 520 Hz sine. */
function synthClassicShort(ctx: AudioContext, when: number, volume: number): void {
  const peak = clampVol(volume) * 0.2;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 520;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.01);
  gain.gain.linearRampToValueAtTime(0, when + 0.14);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.16);
}

/** Ported from the retired inbox tonePlayer "new-in-queue": 660→880 Hz sines. */
function synthClassicQueue(ctx: AudioContext, when: number, volume: number): void {
  const peak = clampVol(volume) * 0.2;
  let t = when;
  for (const f of [660, 880]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.01);
    gain.gain.linearRampToValueAtTime(0, t + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
    t += 0.11;
  }
}

export const SOUND_TEMPLATES: Record<SoundTemplateId, ISoundTemplate> = {
  marimba: {
    id: "marimba",
    label: "Marimba",
    description: "Três notas alegres e leves.",
    synth: synthMarimba,
  },
  diesel: {
    id: "diesel",
    label: "Ignição Diesel",
    description: "Motor dando partida — a cara do GALLO.",
    synth: synthDiesel,
  },
  buzina: {
    id: "buzina",
    label: "Buzina de Estrada",
    description: "Buzina de caminhão, forte.",
    synth: synthBuzina,
  },
  sino: {
    id: "sino",
    label: "Sino Premium",
    description: "Sino cristalino com eco, elegante.",
    synth: synthSino,
  },
  powerup: {
    id: "powerup",
    label: "Power-Up",
    description: "Arpejo ascendente estilo videogame.",
    synth: synthPowerup,
  },
  fanfarra: {
    id: "fanfarra",
    label: "Fanfarra",
    description: "Mini fanfarra que fecha em acorde.",
    synth: synthFanfarra,
  },
  "classic-short": {
    id: "classic-short",
    label: "Clássico curto",
    description: "Um bip curto e discreto.",
    synth: synthClassicShort,
  },
  "classic-queue": {
    id: "classic-queue",
    label: "Clássico fila",
    description: "Dois tons ascendentes.",
    synth: synthClassicQueue,
  },
};

export const SOUND_TEMPLATE_LIST: ISoundTemplate[] = Object.values(SOUND_TEMPLATES);
