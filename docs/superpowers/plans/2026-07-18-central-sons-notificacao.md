# Central de Sons de Notificação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma central Owner-only nas Configurações que define, por-loja, qual som (de uma biblioteca de templates), volume e liga/desliga toca em cada evento sonoro da plataforma.

**Architecture:** Uma engine pura (`soundTemplates.ts`) vira a única fonte de síntese Web Audio; a config vive no `jsonb stores.settings` (`IPlatformSettings.sound`); um player central resolve `evento → template`; os 4 consumidores existentes (version-update, inbox×2, session-timeout) passam a ler a central. Os 3 sintetizadores atuais e o controle per-browser da Inbox são removidos.

**Tech Stack:** React 19, TypeScript strict, TanStack Router/Query, Zustand (removido deste fluxo), shadcn/ui, Web Audio API, Vitest. Gerenciador: `bun`.

## Global Constraints

- Comentários/código em inglês; UI/conteúdo em **português do Brasil com acentos corretos** (UTF-8).
- Tipos de domínio prefixados com `I`; `camelCase`/`PascalCase`/`kebab-case`; `strict: true`, evitar `any`.
- **Sem migration:** `IPlatformSettings` vive no `jsonb stores.settings`; adicionar `sound?` é só uma chave no blob. Consumidores usam `settings.sound ?? DEFAULT_SOUND_SETTINGS`.
- **Zona congelada (Realtime/cache do atendimento):** em `useInboxActivityMonitor.ts` mudar **somente a fonte do som** (player + settings via `ref`); **não** alterar subscriptions de canais, query keys, RPCs (`count`/`getLastInboundAt`), debounces ou a estrutura/deps do `useEffect` principal.
- Gate de CI: `bun run build` + `bun run test` verdes; `bunx tsc --noEmit` sem novos erros no delta.
- Commits Conventional Commits em inglês, atômicos, com trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001"` (fallback de loja, igual ao uso existente).

---

### Task 1: Modelo de dados + defaults (fundação)

**Files:**
- Create: `src/shared/types/sound.ts`
- Create: `src/shared/types/sound.test.ts`
- Modify: `src/shared/types/index.ts` (barrel — adicionar bloco de export de `./sound`)
- Modify: `src/shared/types/platform.ts` (adicionar `sound?: ISoundSettings` à interface `IPlatformSettings`, junto aos opcionais como `idleAlerts?`/`conversationRescue?`; importar o tipo)
- Modify: `src/providers/data/engine/buildDefaultSettings.ts` (adicionar `sound: clone(DEFAULT_SOUND_SETTINGS)`)

**Interfaces:**
- Produces: `SoundTemplateId`, `SoundEventId`, `ISoundEventConfig`, `ISoundSettings`, `DEFAULT_SOUND_SETTINGS`.

- [ ] **Step 1: Write the failing test**

`src/shared/types/sound.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SOUND_SETTINGS,
  type SoundEventId,
  type SoundTemplateId,
} from "./sound";

const EVENT_IDS: SoundEventId[] = [
  "updateAvailable",
  "inboxAssignedMine",
  "inboxNewInQueue",
  "sessionTimeout",
];
const TEMPLATE_IDS: SoundTemplateId[] = [
  "marimba", "diesel", "buzina", "sino", "powerup", "fanfarra",
  "classic-short", "classic-queue",
];

describe("DEFAULT_SOUND_SETTINGS", () => {
  it("covers exactly the four events", () => {
    expect(Object.keys(DEFAULT_SOUND_SETTINGS.events).sort()).toEqual([...EVENT_IDS].sort());
  });

  it("uses valid template ids and volumes in [0,1]", () => {
    for (const id of EVENT_IDS) {
      const cfg = DEFAULT_SOUND_SETTINGS.events[id];
      expect(TEMPLATE_IDS).toContain(cfg.templateId);
      expect(cfg.volume).toBeGreaterThanOrEqual(0);
      expect(cfg.volume).toBeLessThanOrEqual(1);
      expect(typeof cfg.enabled).toBe("boolean");
    }
  });

  it("defaults the update prompt to marimba", () => {
    expect(DEFAULT_SOUND_SETTINGS.events.updateAvailable.templateId).toBe("marimba");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/shared/types/sound.test.ts`
Expected: FAIL — `Cannot find module './sound'`.

- [ ] **Step 3: Create `src/shared/types/sound.ts`**

```ts
/**
 * Sound-center domain model (Configurações → Sons de notificação).
 *
 * Lives in `shared/types` (not in the feature) so `IPlatformSettings` can
 * reference it without shared/types depending on `features/`. The feature's
 * engine adds the synthesis + labels keyed by these ids.
 */

/** A synthesizable sound preset in the library. */
export type SoundTemplateId =
  | "marimba"
  | "diesel"
  | "buzina"
  | "sino"
  | "powerup"
  | "fanfarra"
  | "classic-short"
  | "classic-queue";

/** A platform event that can emit a sound. */
export type SoundEventId =
  | "updateAvailable"
  | "inboxAssignedMine"
  | "inboxNewInQueue"
  | "sessionTimeout";

/** Per-event sound config, stored per-store. */
export interface ISoundEventConfig {
  enabled: boolean;
  templateId: SoundTemplateId;
  /** 0..1 */
  volume: number;
}

/** The `sound` block of `IPlatformSettings`. */
export interface ISoundSettings {
  events: Record<SoundEventId, ISoundEventConfig>;
}

/** Applied when `IPlatformSettings.sound` is absent (existing stores). */
export const DEFAULT_SOUND_SETTINGS: ISoundSettings = {
  events: {
    updateAvailable: { enabled: true, templateId: "marimba", volume: 0.7 },
    inboxAssignedMine: { enabled: true, templateId: "classic-short", volume: 0.5 },
    inboxNewInQueue: { enabled: true, templateId: "classic-queue", volume: 0.6 },
    sessionTimeout: { enabled: true, templateId: "classic-short", volume: 0.6 },
  },
};
```

- [ ] **Step 4: Wire the barrel** — in `src/shared/types/index.ts`, after the `DEFAULT_SESSION_TIMEOUT` export (line ~50), add:

```ts
// Sound center (Configurações → Sons de notificação)
export type {
  SoundTemplateId,
  SoundEventId,
  ISoundEventConfig,
  ISoundSettings,
} from "./sound";
export { DEFAULT_SOUND_SETTINGS } from "./sound";
```

- [ ] **Step 5: Wire `IPlatformSettings`** — in `src/shared/types/platform.ts`, add the import near the other type imports (top of file):

```ts
import type { ISoundSettings } from "./sound";
```

Then, inside the `IPlatformSettings` interface, next to `conversationRescue?`, add:

```ts
  /** Notification sound center (per-store). Absent on legacy stores → DEFAULT_SOUND_SETTINGS. */
  sound?: ISoundSettings;
```

- [ ] **Step 6: Wire defaults** — in `src/providers/data/engine/buildDefaultSettings.ts`, add the import:

```ts
import { DEFAULT_SOUND_SETTINGS } from "@/shared/types";
```

and inside the returned object (next to `conversationRescue: clone(...)`), add:

```ts
    sound: clone(DEFAULT_SOUND_SETTINGS),
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bun run test -- src/shared/types/sound.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/sound.ts src/shared/types/sound.test.ts src/shared/types/index.ts src/shared/types/platform.ts src/providers/data/engine/buildDefaultSettings.ts
git commit -m "feat(sound): add ISoundSettings model + per-store defaults"
```

---

### Task 2: Template library engine

**Files:**
- Create: `src/features/sound-settings/engine/soundTemplates.ts`
- Create: `src/features/sound-settings/engine/soundTemplates.test.ts`

**Interfaces:**
- Consumes: `SoundTemplateId` (Task 1).
- Produces: `ISoundTemplate { id, label, description, synth(ctx, when, volume) }`, `SOUND_TEMPLATES: Record<SoundTemplateId, ISoundTemplate>`, `SOUND_TEMPLATE_LIST: ISoundTemplate[]`.

- [ ] **Step 1: Write the failing test**

`src/features/sound-settings/engine/soundTemplates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SOUND_TEMPLATES, SOUND_TEMPLATE_LIST } from "./soundTemplates";
import type { SoundTemplateId } from "@/shared/types";

const IDS: SoundTemplateId[] = [
  "marimba", "diesel", "buzina", "sino", "powerup", "fanfarra",
  "classic-short", "classic-queue",
];

describe("SOUND_TEMPLATES", () => {
  it("has an entry for every SoundTemplateId and no extras", () => {
    expect(Object.keys(SOUND_TEMPLATES).sort()).toEqual([...IDS].sort());
  });

  it("each template has matching id, non-empty label/description and a synth fn", () => {
    for (const id of IDS) {
      const t = SOUND_TEMPLATES[id];
      expect(t.id).toBe(id);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.synth).toBe("function");
    }
  });

  it("SOUND_TEMPLATE_LIST mirrors the map", () => {
    expect(SOUND_TEMPLATE_LIST.map((t) => t.id).sort()).toEqual([...IDS].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/sound-settings/engine/soundTemplates.test.ts`
Expected: FAIL — `Cannot find module './soundTemplates'`.

- [ ] **Step 3: Create `src/features/sound-settings/engine/soundTemplates.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/sound-settings/engine/soundTemplates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/sound-settings/engine/soundTemplates.ts src/features/sound-settings/engine/soundTemplates.test.ts
git commit -m "feat(sound): add template library engine (8 synthesized presets)"
```

---

### Task 3: Event catalog + config resolution

**Files:**
- Create: `src/features/sound-settings/engine/soundEvents.ts`
- Create: `src/features/sound-settings/engine/soundEvents.test.ts`

**Interfaces:**
- Consumes: `SoundEventId`, `ISoundSettings`, `ISoundEventConfig`, `DEFAULT_SOUND_SETTINGS` (Task 1); `SOUND_TEMPLATES` (Task 2).
- Produces: `ISoundEventMeta { id, label, description }`, `SOUND_EVENTS: ISoundEventMeta[]`, `resolveEventConfig(settings, eventId): ISoundEventConfig`.

- [ ] **Step 1: Write the failing test**

`src/features/sound-settings/engine/soundEvents.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SOUND_EVENTS, resolveEventConfig } from "./soundEvents";
import { DEFAULT_SOUND_SETTINGS, type ISoundSettings } from "@/shared/types";

describe("SOUND_EVENTS", () => {
  it("describes exactly the four default events", () => {
    expect(SOUND_EVENTS.map((e) => e.id).sort()).toEqual(
      Object.keys(DEFAULT_SOUND_SETTINGS.events).sort(),
    );
  });
});

describe("resolveEventConfig", () => {
  it("falls back to the event default when settings is undefined", () => {
    expect(resolveEventConfig(undefined, "updateAvailable")).toEqual(
      DEFAULT_SOUND_SETTINGS.events.updateAvailable,
    );
  });

  it("falls back when the event key is missing", () => {
    const partial = { events: {} } as unknown as ISoundSettings;
    expect(resolveEventConfig(partial, "sessionTimeout")).toEqual(
      DEFAULT_SOUND_SETTINGS.events.sessionTimeout,
    );
  });

  it("replaces an invalid templateId with the event default template", () => {
    const bad: ISoundSettings = {
      events: {
        ...DEFAULT_SOUND_SETTINGS.events,
        updateAvailable: { enabled: true, templateId: "nope" as never, volume: 0.4 },
      },
    };
    const out = resolveEventConfig(bad, "updateAvailable");
    expect(out.templateId).toBe(DEFAULT_SOUND_SETTINGS.events.updateAvailable.templateId);
    expect(out.volume).toBe(0.4);
    expect(out.enabled).toBe(true);
  });

  it("clamps volume into [0,1]", () => {
    const hi: ISoundSettings = {
      events: {
        ...DEFAULT_SOUND_SETTINGS.events,
        inboxNewInQueue: { enabled: false, templateId: "buzina", volume: 5 },
      },
    };
    const out = resolveEventConfig(hi, "inboxNewInQueue");
    expect(out.volume).toBe(1);
    expect(out.enabled).toBe(false);
    expect(out.templateId).toBe("buzina");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/sound-settings/engine/soundEvents.test.ts`
Expected: FAIL — `Cannot find module './soundEvents'`.

- [ ] **Step 3: Create `src/features/sound-settings/engine/soundEvents.ts`**

```ts
import {
  DEFAULT_SOUND_SETTINGS,
  type ISoundEventConfig,
  type ISoundSettings,
  type SoundEventId,
} from "@/shared/types";
import { SOUND_TEMPLATES } from "./soundTemplates";

export interface ISoundEventMeta {
  id: SoundEventId;
  label: string;
  description: string;
}

/** UI catalog of the configurable events, in display order. */
export const SOUND_EVENTS: ISoundEventMeta[] = [
  {
    id: "updateAvailable",
    label: "Atualização disponível",
    description: "Quando uma nova versão da plataforma está pronta.",
  },
  {
    id: "inboxAssignedMine",
    label: "Mensagem na minha conversa",
    description: "Chegou mensagem numa conversa em que você já atende.",
  },
  {
    id: "inboxNewInQueue",
    label: "Novo cliente na fila",
    description: "Uma nova conversa sem dono entrou na fila.",
  },
  {
    id: "sessionTimeout",
    label: "Aviso de inatividade",
    description: "Durante a contagem regressiva antes do logout automático.",
  },
];

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/**
 * Resolves the effective config for an event, tolerating absent/legacy/corrupt
 * blobs: missing settings or event → the event default; an unknown templateId →
 * the event's default template; out-of-range volume → clamped.
 */
export function resolveEventConfig(
  settings: ISoundSettings | undefined,
  eventId: SoundEventId,
): ISoundEventConfig {
  const fallback = DEFAULT_SOUND_SETTINGS.events[eventId];
  const cfg = settings?.events?.[eventId];
  if (!cfg) return fallback;
  const templateId = cfg.templateId in SOUND_TEMPLATES ? cfg.templateId : fallback.templateId;
  return {
    enabled: Boolean(cfg.enabled),
    templateId,
    volume: clamp01(cfg.volume),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/sound-settings/engine/soundEvents.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/sound-settings/engine/soundEvents.ts src/features/sound-settings/engine/soundEvents.test.ts
git commit -m "feat(sound): add event catalog + config resolution with fallbacks"
```

---

### Task 4: Central sound player

**Files:**
- Create: `src/features/sound-settings/lib/soundPlayer.ts`
- Create: `src/features/sound-settings/lib/soundPlayer.test.ts`

**Interfaces:**
- Consumes: `SOUND_TEMPLATES` (Task 2), `resolveEventConfig` (Task 3), `SoundEventId`/`SoundTemplateId`/`ISoundSettings` (Task 1).
- Produces: `ISoundPlayer { unlock(): void; play(eventId, settings): void; playTemplate(templateId, volume): void; dispose(): void }`, `createSoundPlayer(): ISoundPlayer`.

- [ ] **Step 1: Write the failing test**

`src/features/sound-settings/lib/soundPlayer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createSoundPlayer } from "./soundPlayer";

// jsdom/node have no AudioContext → the player degrades to a safe no-op.
describe("createSoundPlayer (no Web Audio)", () => {
  it("never throws for any method", () => {
    const p = createSoundPlayer();
    expect(() => p.unlock()).not.toThrow();
    expect(() => p.play("updateAvailable", undefined)).not.toThrow();
    expect(() => p.playTemplate("marimba", 0.5)).not.toThrow();
    expect(() => p.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/sound-settings/lib/soundPlayer.test.ts`
Expected: FAIL — `Cannot find module './soundPlayer'`.

- [ ] **Step 3: Create `src/features/sound-settings/lib/soundPlayer.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/sound-settings/lib/soundPlayer.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/features/sound-settings/lib/soundPlayer.ts src/features/sound-settings/lib/soundPlayer.test.ts
git commit -m "feat(sound): add central Web Audio player (event → template)"
```

---

### Task 5: Move `useAudioUnlock` to shared

**Files:**
- Create: `src/shared/hooks/useAudioUnlock.ts` (moved content)
- Delete: `src/features/session-timeout/hooks/useAudioUnlock.ts`
- Modify: `src/features/session-timeout/hooks/useSessionTimeout.ts:12` (import path)
- Modify: `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts:4` (import path)

**Interfaces:**
- Produces: `useAudioUnlock(unlock: () => void, enabled: boolean): void` at `@/shared/hooks/useAudioUnlock`.

- [ ] **Step 1: Create `src/shared/hooks/useAudioUnlock.ts`** with the exact content of the existing `src/features/session-timeout/hooks/useAudioUnlock.ts` (unchanged — the `useEffect`, `GESTURE_EVENTS`, docstring).

- [ ] **Step 2: Delete the old file**

```bash
git rm src/features/session-timeout/hooks/useAudioUnlock.ts
```

- [ ] **Step 3: Update the two importers**

In `src/features/session-timeout/hooks/useSessionTimeout.ts`, change:
```ts
import { useAudioUnlock } from "./useAudioUnlock";
```
to:
```ts
import { useAudioUnlock } from "@/shared/hooks/useAudioUnlock";
```

In `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts`, change:
```ts
import { useAudioUnlock } from "@/features/session-timeout/hooks/useAudioUnlock";
```
to:
```ts
import { useAudioUnlock } from "@/shared/hooks/useAudioUnlock";
```

- [ ] **Step 4: Verify build + existing tests**

Run: `bun run build`
Expected: builds with no error referencing `useAudioUnlock`.
Run: `bun run test`
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/shared/hooks/useAudioUnlock.ts src/features/session-timeout/hooks/useSessionTimeout.ts src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts
git commit -m "refactor(sound): move useAudioUnlock to shared/hooks (shared infra)"
```

---

### Task 6: React hook + feature barrel

**Files:**
- Create: `src/features/sound-settings/hooks/useSoundEventPlayer.ts`
- Create: `src/features/sound-settings/index.ts`

**Interfaces:**
- Consumes: `createSoundPlayer` (Task 4), `useAudioUnlock` (Task 5), `useSettingsProvider`, `useCurrentStore`, `useAuth`.
- Produces: `useSoundEventPlayer(): { play: (eventId: SoundEventId) => void }`. Barrel exports: `useSoundEventPlayer`, `createSoundPlayer`, `SOUND_TEMPLATES`, `SOUND_TEMPLATE_LIST`, `SOUND_EVENTS`, `resolveEventConfig`, and (later) `SoundSettingsPage`.

- [ ] **Step 1: Create `src/features/sound-settings/hooks/useSoundEventPlayer.ts`**

```ts
import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useSettingsProvider } from "@/providers/data";
import { useAudioUnlock } from "@/shared/hooks/useAudioUnlock";
import type { ISoundSettings, SoundEventId } from "@/shared/types";
import { createSoundPlayer, type ISoundPlayer } from "../lib/soundPlayer";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Returns a stable `play(eventId)` that synthesizes the sound configured for the
 * current store. Reads `["settings", storeId]` (shared React Query cache) and
 * keeps it in a ref, so `play` never changes identity — safe to call from
 * effects without adding it to their dependency array.
 */
export function useSoundEventPlayer(): { play: (eventId: SoundEventId) => void } {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? DEFAULT_STORE_ID;
  const settingsProvider = useSettingsProvider();

  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    enabled: Boolean(currentUser),
    staleTime: 5 * 60_000,
  });

  const soundRef = useRef<ISoundSettings | undefined>(undefined);
  soundRef.current = settingsQuery.data?.sound;

  const playerRef = useRef<ISoundPlayer | null>(null);
  if (!playerRef.current) playerRef.current = createSoundPlayer();
  useEffect(() => () => playerRef.current?.dispose(), []);

  const unlock = useCallback(() => playerRef.current?.unlock(), []);
  useAudioUnlock(unlock, true);

  const play = useCallback((eventId: SoundEventId) => {
    playerRef.current?.play(eventId, soundRef.current);
  }, []);

  return { play };
}
```

- [ ] **Step 2: Create `src/features/sound-settings/index.ts`**

```ts
export { useSoundEventPlayer } from "./hooks/useSoundEventPlayer";
export { createSoundPlayer, type ISoundPlayer } from "./lib/soundPlayer";
export { SOUND_TEMPLATES, SOUND_TEMPLATE_LIST, type ISoundTemplate } from "./engine/soundTemplates";
export { SOUND_EVENTS, resolveEventConfig, type ISoundEventMeta } from "./engine/soundEvents";
export { SoundSettingsPage } from "./pages/SoundSettingsPage";
```

> NOTE: the `SoundSettingsPage` export will not resolve until Task 7 creates it.
> Add that line in Task 7's step, OR create a placeholder now and fill it in
> Task 7. To keep each task independently buildable, **omit the last line here
> and add it in Task 7.**

- [ ] **Step 3: Verify build + type-check**

Run: `bun run build`
Expected: builds clean.
Run: `bunx tsc --noEmit 2>&1 | grep -i sound-settings || echo OK`
Expected: `OK` (no new type errors in the feature).

- [ ] **Step 4: Commit**

```bash
git add src/features/sound-settings/hooks/useSoundEventPlayer.ts src/features/sound-settings/index.ts
git commit -m "feat(sound): add useSoundEventPlayer hook + feature barrel"
```

---

### Task 7: Settings page + route + i18n + nav

**Files:**
- Create: `src/features/sound-settings/i18n/pt-BR.ts`
- Create: `src/features/sound-settings/pages/SoundSettingsPage.tsx`
- Create: `src/routes/app.configuracoes.sons.tsx`
- Modify: `src/features/sound-settings/index.ts` (add the `SoundSettingsPage` export)
- Modify: `src/features/shell/layouts/SettingsLayout.tsx` (register nav item in the "Operação" group)

**Interfaces:**
- Consumes: `usePlatformSettings` (`@/features/admin-settings/hooks/usePlatformSettings`), `useCurrentStore`, `SOUND_EVENTS`, `SOUND_TEMPLATE_LIST`, `createSoundPlayer`, `DEFAULT_SOUND_SETTINGS`.
- Produces: `SoundSettingsPage` component; route `/app/configuracoes/sons`.

- [ ] **Step 1: Create `src/features/sound-settings/i18n/pt-BR.ts`**

```ts
export const SOUND_SETTINGS_I18N = {
  title: "Sons de notificação",
  description:
    "Escolha o som, o volume e se está ligado para cada aviso sonoro da plataforma. Vale para toda a loja. Suba o volume ou use fones para testar.",
  templateLabel: "Som",
  volumeLabel: "Volume",
  test: "Testar",
  save: "Salvar alterações",
  saving: "Salvando…",
  discard: "Descartar",
  saved: "Configuração salva",
  saveError: "Não foi possível salvar.",
  enabledAria: (event: string) => `Ativar som: ${event}`,
} as const;
```

- [ ] **Step 2: Create `src/features/sound-settings/pages/SoundSettingsPage.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_SOUND_SETTINGS,
  type ISoundSettings,
  type SoundEventId,
  type SoundTemplateId,
} from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { SOUND_EVENTS } from "../engine/soundEvents";
import { SOUND_TEMPLATE_LIST } from "../engine/soundTemplates";
import { createSoundPlayer, type ISoundPlayer } from "../lib/soundPlayer";
import { SOUND_SETTINGS_I18N as T } from "../i18n/pt-BR";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

export function SoundSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? DEFAULT_STORE_ID;
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<ISoundSettings>(DEFAULT_SOUND_SETTINGS);

  const playerRef = useRef<ISoundPlayer | null>(null);
  if (!playerRef.current) playerRef.current = createSoundPlayer();
  useEffect(() => () => playerRef.current?.dispose(), []);

  useEffect(() => {
    if (settings) setDraft(settings.sound ?? DEFAULT_SOUND_SETTINGS);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    const current = settings.sound ?? DEFAULT_SOUND_SETTINGS;
    return JSON.stringify(current) !== JSON.stringify(draft);
  }, [settings, draft]);

  const patchEvent = (id: SoundEventId, p: Partial<ISoundSettings["events"][SoundEventId]>) =>
    setDraft((d) => ({ events: { ...d.events, [id]: { ...d.events[id], ...p } } }));

  const handleTest = (id: SoundEventId) => {
    const cfg = draft.events[id];
    playerRef.current?.unlock();
    playerRef.current?.playTemplate(cfg.templateId, cfg.volume);
  };

  const handleSave = async () => {
    try {
      await update({ sound: draft }, "settings.sound.update");
      await queryClient.invalidateQueries({ queryKey: ["settings", storeId] });
      toast.success(T.saved, { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error(T.saveError);
    }
  };

  const handleReset = () => {
    if (settings) setDraft(settings.sound ?? DEFAULT_SOUND_SETTINGS);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader title={T.title} description={T.description} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={T.title} description={T.description} />

      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        {SOUND_EVENTS.map((event) => {
          const cfg = draft.events[event.id];
          return (
            <div key={event.id} className="space-y-3 rounded-md border border-border/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{event.label}</p>
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                </div>
                <Switch
                  checked={cfg.enabled}
                  onCheckedChange={(v) => patchEvent(event.id, { enabled: v })}
                  aria-label={T.enabledAria(event.label)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{T.templateLabel}</Label>
                  <Select
                    value={cfg.templateId}
                    onValueChange={(v) => patchEvent(event.id, { templateId: v as SoundTemplateId })}
                    disabled={!cfg.enabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOUND_TEMPLATE_LIST.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(event.id)}
                  disabled={!cfg.enabled}
                  className="gap-1"
                >
                  <Icon icon="mdi:play" size={14} />
                  {T.test}
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{T.volumeLabel}</Label>
                <Slider
                  value={[cfg.volume]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={(v) => patchEvent(event.id, { volume: v[0] ?? cfg.volume })}
                  disabled={!cfg.enabled}
                  aria-label={`${T.volumeLabel}: ${event.label}`}
                />
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            {T.discard}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? T.saving : T.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

> Verify the shadcn `Select` import path matches the repo (`@/components/ui/select`).
> If the project's Select API differs, adapt to the same pattern used by an
> existing settings page that uses a dropdown.

- [ ] **Step 3: Add the barrel export** — in `src/features/sound-settings/index.ts`, add:

```ts
export { SoundSettingsPage } from "./pages/SoundSettingsPage";
```

- [ ] **Step 4: Create the route `src/routes/app.configuracoes.sons.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SoundSettingsPage } from "@/features/sound-settings";

export const Route = createFileRoute("/app/configuracoes/sons")({
  beforeLoad: ({ location }) => {
    requireAuth(location.pathname, ["Owner"]);
  },
  component: () => (
    <SettingsLayout>
      <SoundSettingsPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 5: Register the nav item** — in `src/features/shell/layouts/SettingsLayout.tsx`, inside the `SETTINGS_GROUPS` group with `label: "Operação"`, add an item (e.g. right after "Resgate de conversas"):

```ts
      {
        label: "Sons de notificação",
        icon: "mdi:music-note-outline",
        to: "/app/configuracoes/sons",
        roles: ["Owner"],
      },
```

- [ ] **Step 6: Verify build (route tree regenerates) + type-check**

Run: `bun run build`
Expected: builds clean; `routeTree.gen.ts` picks up the new route.
Run: `bunx tsc --noEmit 2>&1 | grep -iE "sound-settings|configuracoes.sons" || echo OK`
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add src/features/sound-settings/i18n/pt-BR.ts src/features/sound-settings/pages/SoundSettingsPage.tsx src/features/sound-settings/index.ts src/routes/app.configuracoes.sons.tsx src/features/shell/layouts/SettingsLayout.tsx src/routeTree.gen.ts
git commit -m "feat(sound): add Owner-only Sound Center settings page + route"
```

---

### Task 8: Migrate consumer — version-update (lowest risk)

**Files:**
- Modify: `src/features/version-update/components/VersionUpdatePrompt.tsx`
- Delete: `src/features/version-update/lib/notification-sound.ts`

**Interfaces:**
- Consumes: `useSoundEventPlayer` (Task 6).

- [ ] **Step 1: Rewire `VersionUpdatePrompt.tsx`**

Remove the import (line 6):
```ts
import { playUpdateAvailableSound } from "../lib/notification-sound";
```
Add:
```ts
import { useSoundEventPlayer } from "@/features/sound-settings";
```

Inside the component (after `const i18n = ...`), add:
```ts
  const { play } = useSoundEventPlayer();
```

Replace the sound effect (lines 37-39):
```ts
  useEffect(() => {
    if (isCardVisible) playUpdateAvailableSound();
  }, [isCardVisible]);
```
with:
```ts
  useEffect(() => {
    if (isCardVisible) play("updateAvailable");
  }, [isCardVisible, play]);
```

- [ ] **Step 2: Delete the retired synthesizer**

```bash
git rm src/features/version-update/lib/notification-sound.ts
```

- [ ] **Step 3: Verify no dangling references**

Run: `bun run test -- src/features/version-update`
Expected: PASS (existing 23 tests unaffected).
Run: `git grep -n "playUpdateAvailableSound\|notification-sound"`
Expected: no matches.
Run: `bun run build`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/version-update/components/VersionUpdatePrompt.tsx
git commit -m "feat(sound): route update-available prompt through the sound center"
```

---

### Task 9: Migrate consumer — Inbox monitor (frozen zone)

**Files:**
- Modify: `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts`
- Modify: `src/features/inbox-alerts/index.ts` (drop `SoundAlertToggle` export)
- Modify: `src/features/shell/components/TopBar.tsx` (remove `<SoundAlertToggle />` + its import)
- Delete: `src/features/inbox-alerts/components/SoundAlertToggle.tsx`
- Delete: `src/features/inbox-alerts/store/soundAlertPreferencesStore.ts`
- Delete: `src/features/inbox-alerts/lib/tonePlayer.ts`

**Interfaces:**
- Consumes: `createSoundPlayer` (Task 4), `useSettingsProvider`, `useQuery`.

> **Frozen-zone rule:** change ONLY the sound source. Do not touch the Realtime
> subscriptions, `count`/`getLastInboundAt` calls, debounces, generation guards,
> or the main `useEffect` dependency array. Settings are read via a `ref`, exactly
> as the old `prefs` were read via `useSoundAlertPreferencesStore.getState()`.

- [ ] **Step 1: Swap imports in `useInboxActivityMonitor.ts`**

Remove:
```ts
import { createTonePlayer } from "../lib/tonePlayer";
import { useSoundAlertPreferencesStore } from "../store/soundAlertPreferencesStore";
```
Add (near the other provider imports):
```ts
import { useQuery } from "@tanstack/react-query";
import { createSoundPlayer } from "@/features/sound-settings";
import type { ISoundSettings } from "@/shared/types";
```
Add `useSettingsProvider` to the existing `@/providers/data` import list (it already imports `getActiveDataSource`, `useConversationsProvider`, `useMessagesProvider`).

- [ ] **Step 2: Replace the tone player + prefs with the central player + a settings ref**

Replace (lines 94-98):
```ts
  const tonePlayerRef = useRef<ReturnType<typeof createTonePlayer> | null>(null);
  if (!tonePlayerRef.current) tonePlayerRef.current = createTonePlayer();

  const unlockTonePlayer = useCallback(() => tonePlayerRef.current?.unlock(), []);
  useAudioUnlock(unlockTonePlayer, true);
```
with:
```ts
  const settingsProvider = useSettingsProvider();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    enabled: Boolean(currentUser),
    staleTime: 5 * 60_000,
  });
  const soundRef = useRef<ISoundSettings | undefined>(undefined);
  soundRef.current = settingsQuery.data?.sound;

  const soundPlayerRef = useRef<ReturnType<typeof createSoundPlayer> | null>(null);
  if (!soundPlayerRef.current) soundPlayerRef.current = createSoundPlayer();

  const unlockSoundPlayer = useCallback(() => soundPlayerRef.current?.unlock(), []);
  useAudioUnlock(unlockSoundPlayer, true);
```

Update the dispose effect (line 103):
```ts
  useEffect(() => () => soundPlayerRef.current?.dispose(), []);
```

- [ ] **Step 3: Update the two beep call-sites**

In `maybeBeepMine` (lines 215-216), replace:
```ts
      const prefs = useSoundAlertPreferencesStore.getState();
      if (prefs.enabled) tonePlayerRef.current?.play("assigned-mine", prefs.volume);
```
with:
```ts
      soundPlayerRef.current?.play("inboxAssignedMine", soundRef.current);
```

In the queue-beep branch (lines 278-279), replace:
```ts
          const prefs = useSoundAlertPreferencesStore.getState();
          if (prefs.enabled) tonePlayerRef.current?.play("new-in-queue", prefs.volume);
```
with:
```ts
          soundPlayerRef.current?.play("inboxNewInQueue", soundRef.current);
```

> `play` already checks `enabled` internally via `resolveEventConfig`, so the
> `if (prefs.enabled)` guard is folded in. The main `useEffect` dependency array
> stays `[conversationsProvider, messagesProvider, currentStoreId, sellerId]` —
> `soundPlayerRef`/`soundRef` are refs and must NOT be added.

- [ ] **Step 4: Remove the TopBar toggle**

In `src/features/shell/components/TopBar.tsx`: change the import (line 26) from:
```ts
import { InboxUnreadBadgeIcon, SoundAlertToggle } from "@/features/inbox-alerts";
```
to:
```ts
import { InboxUnreadBadgeIcon } from "@/features/inbox-alerts";
```
and delete the `<SoundAlertToggle />` line (line 79).

- [ ] **Step 5: Drop the barrel export** — in `src/features/inbox-alerts/index.ts`, remove the `SoundAlertToggle` export line.

- [ ] **Step 6: Delete retired files**

```bash
git rm src/features/inbox-alerts/components/SoundAlertToggle.tsx src/features/inbox-alerts/store/soundAlertPreferencesStore.ts src/features/inbox-alerts/lib/tonePlayer.ts
```

- [ ] **Step 7: Verify no dangling references + build + tests**

Run: `git grep -n "SoundAlertToggle\|soundAlertPreferencesStore\|tonePlayer\|createTonePlayer"`
Expected: no matches.
Run: `bun run build`
Expected: builds clean.
Run: `bun run test -- src/features/inbox-alerts`
Expected: PASS (remaining engine tests unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts src/features/inbox-alerts/index.ts src/features/shell/components/TopBar.tsx
git commit -m "feat(sound): route Inbox alerts through the sound center; drop per-browser toggle"
```

---

### Task 10: Migrate consumer — session timeout

**Files:**
- Modify: `src/features/session-timeout/hooks/useSessionTimeout.ts`
- Modify: `src/features/session-timeout/engine/resolveSessionTimeout.ts`
- Modify: `src/features/session-timeout/engine/resolveSessionTimeout.test.ts` (drop sound assertions if present)
- Modify: `src/features/admin-settings/pages/SessionSettingsPage.tsx` (remove sound controls)
- Delete: `src/features/session-timeout/lib/beep.ts`

**Interfaces:**
- Consumes: `createSoundPlayer` (Task 4).

- [ ] **Step 1: Point the beep at the sound center in `useSessionTimeout.ts`**

Remove:
```ts
import { createBeeper, type IBeeper } from "../lib/beep";
```
Add:
```ts
import { createSoundPlayer, type ISoundPlayer } from "@/features/sound-settings";
```

Replace the beeper ref (lines 67-68):
```ts
  const beeperRef = useRef<IBeeper | null>(null);
  if (!beeperRef.current) beeperRef.current = createBeeper();
```
with:
```ts
  const soundPlayerRef = useRef<ISoundPlayer | null>(null);
  if (!soundPlayerRef.current) soundPlayerRef.current = createSoundPlayer();
  useEffect(() => () => soundPlayerRef.current?.dispose(), []);
```

Replace the unlock (line 108):
```ts
  const unlockAudio = useCallback(() => beeperRef.current?.unlock(), []);
```
with:
```ts
  const unlockAudio = useCallback(() => soundPlayerRef.current?.unlock(), []);
```

Replace the beep call (line 151):
```ts
            beeperRef.current?.beep(resolved.soundVolume, decision.urgency);
```
with (the sound now comes from the central config; `decision.urgency` no longer modulates timbre — cadence still conveys urgency):
```ts
            soundPlayerRef.current?.play("sessionTimeout", settingsQuery.data?.sound);
```

> The `if (resolved.soundEnabled)` guard on line 144 stays — it gates the beep
> branch on the session policy. `play` also checks the sound center's per-event
> `enabled`, so the sound plays only when BOTH allow it. `lastBeepRemainingRef`
> bookkeeping (line 152) is unchanged. Keep `decision` (still used for the
> `shouldBeepAtTick` cadence decision), just stop passing `decision.urgency` to a
> beeper.

- [ ] **Step 2: Stop resolving sound in `resolveSessionTimeout.ts`**

The session policy no longer owns sound volume/timbre. Simplify `IResolvedSessionTimeout` and the function so `soundEnabled` reflects only the policy switch and `soundVolume` is dropped. Change the interface:
```ts
export interface IResolvedSessionTimeout {
  enabled: boolean;
  idleMs: number;
  warningMs: number;
  /** Whether the warning plays a sound at all (session-policy switch). Which sound + volume come from the sound center. */
  soundEnabled: boolean;
}
```
Remove `clamp01` and the `soundVolume` field from both returns:
```ts
  if (!effective.enabled) {
    return { enabled: false, idleMs: 0, warningMs: 0, soundEnabled: false };
  }
```
and
```ts
  return {
    enabled: true,
    idleMs,
    warningMs,
    soundEnabled: effective.soundEnabled,
  };
```

> `effective.soundEnabled` still reads the legacy `ISessionTimeoutSettings.soundEnabled`
> field (kept in the type for blob compatibility). `useSessionTimeout` line 172's
> dependency array must drop `resolved.soundVolume` (now removed) — leave
> `resolved.soundEnabled`.

- [ ] **Step 3: Update `resolveSessionTimeout.test.ts`**

If the test asserts on `soundVolume`, remove those assertions/lines. Keep the `soundEnabled`, `idleMs`, `warningMs`, override-precedence assertions. Run to confirm the file still references only existing fields.

- [ ] **Step 4: Remove sound controls from `SessionSettingsPage.tsx`**

Delete the beeper ref (lines 26-27), the `testBeep` function (lines 59-62), the "Emitir beeps" switch block (lines 125-138), and the "Intensidade do som" block (lines 140-164). Remove now-unused imports (`createBeeper`, `IBeeper`, `Slider` if unused elsewhere on the page). Under the warning-seconds inputs, add a one-line pointer:

```tsx
        <p className="text-xs text-muted-foreground">
          O som do aviso é configurado em{" "}
          <a href="/app/configuracoes/sons" className="underline">
            Sons de notificação
          </a>
          .
        </p>
```

> `draft.soundEnabled`/`draft.soundVolume` are no longer edited here but remain
> on the object (loaded from and saved back unchanged), so `ISessionTimeoutSettings`
> is untouched and existing blobs are preserved.

- [ ] **Step 5: Delete the retired beeper**

```bash
git rm src/features/session-timeout/lib/beep.ts
```

- [ ] **Step 6: Verify no dangling references + build + tests**

Run: `git grep -n "createBeeper\|IBeeper\|lib/beep\|soundVolume"`
Expected: no matches in `src/features/session-timeout` or `SessionSettingsPage.tsx` (the `ISessionTimeoutSettings.soundVolume` *type field* may remain in `platform.ts` — that's expected).
Run: `bun run build`
Expected: builds clean.
Run: `bun run test -- src/features/session-timeout`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/session-timeout src/features/admin-settings/pages/SessionSettingsPage.tsx
git commit -m "feat(sound): route session-timeout warning through the sound center"
```

---

### Task 11: Final gate + docs

**Files:**
- Modify: `src/features/version-update/i18n/pt-BR.ts` (no change expected — verify only)
- Verify only; no new source.

- [ ] **Step 1: Full type-check (delta)**

Run: `bunx tsc --noEmit`
Expected: no NEW errors versus the pre-existing baseline. Cross-check new files (`git diff --name-status main...HEAD --diff-filter=A`) report clean.

- [ ] **Step 2: Full test suite**

Run: `bun run test`
Expected: all green (new: `sound.test.ts`, `soundTemplates.test.ts`, `soundEvents.test.ts`, `soundPlayer.test.ts`).

- [ ] **Step 3: Full build**

Run: `bun run build`
Expected: builds clean (chunk-size warning is pre-existing, unrelated).

- [ ] **Step 4: Manual smoke checklist (owner tests audio)**

Document for the owner to verify by ear (audio is not unit-testable):
- Configurações → Operação → **Sons de notificação** appears (Owner) and each event has switch/select/volume/Testar.
- "Testar" plays the selected template at the selected volume.
- Saving persists (reload keeps the choice); non-Owner cannot reach `/app/configuracoes/sons`.
- The TopBar sound icon is gone; the Session page no longer has sound controls and links to the sound center.

- [ ] **Step 5: Commit (if any verify-time doc tweaks)**

```bash
git add -A
git commit -m "chore(sound): finalize sound center (build/test/type-check green)"
```

---

## Self-Review — Spec Coverage

- Biblioteca de templates (spec §5) → Task 2 (8 templates, marimba padrão).
- Modelo de dados por-loja, sem migration (spec §4) → Task 1.
- Disparo unificado `play(eventId, settings)` (spec §3) → Task 4 + Task 6.
- version-update (spec §6a) → Task 8. inbox (spec §6b, frozen zone) → Task 9. session-timeout (spec §6c) → Task 10.
- `useAudioUnlock` para shared (spec §6d) → Task 5.
- Tela Owner-only + nav + i18n (spec §7) → Task 7.
- Remoções: `notification-sound.ts` (T8), `SoundAlertToggle`/`soundAlertPreferencesStore`/`tonePlayer.ts` (T9), `beep.ts` (T10).
- Testes da engine (spec §8) → Tasks 1–4.
- Ordem faseada (spec §9) → Tasks 1→11 (menor→maior risco).
- Fora de escopo (spec §10): per-user/override, upload de áudio, novos eventos, remoção física de `soundEnabled/soundVolume` — não implementados, por design.

Type consistency: `createSoundPlayer`/`ISoundPlayer`, `play(eventId, settings)`, `playTemplate(templateId, volume)`, `resolveEventConfig`, `SOUND_TEMPLATES`/`SOUND_TEMPLATE_LIST`, `SOUND_EVENTS`, `useSoundEventPlayer().play` — usados de forma idêntica entre tasks. `SoundEventId` values (`updateAvailable`/`inboxAssignedMine`/`inboxNewInQueue`/`sessionTimeout`) consistentes em todas as tasks.
