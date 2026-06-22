# Tempo de Sessão por Inatividade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encerrar a sessão de usuários internos após inatividade, avisando com um modal de contagem regressiva acompanhado de beeps que escalam, parametrizável globalmente e por usuário.

**Architecture:** Feature dedicada `src/features/session-timeout/` espelhando a `access`. Lógica de negócio em `engine/` puro (testado com Vitest), runtime em `hooks/` + `lib/beep.ts` (Web Audio), montado como `<SessionTimeoutGuard/>` no `AppLayout`. Config global no `stores.settings` (jsonb) via tela Owner-only; override por usuário em nova coluna jsonb de `sellers`.

**Tech Stack:** React 19, TanStack Router/Query, Zustand (camada mock), react-hook-form + zod, shadcn/ui (Tailwind v4), Web Audio API, BroadcastChannel, Vitest, Supabase (Postgres + RLS).

**Spec:** `docs/superpowers/specs/2026-06-21-session-timeout-design.md`

## Global Constraints

- **Gerenciador/scripts:** `bun` — testes `bun run test` (Vitest), build `bun run build` (Vite, NÃO faz type-check), type-check à parte `bunx tsc --noEmit` (avaliar **só o delta**; há baseline de ~315 erros pré-existentes). Gate de CI prático = `bun run build` + `bun run test` verdes.
- **Commits:** Conventional Commits em inglês, atômicos (`feat:`, `test:`, `refactor:`, `docs:`).
- **Idioma:** código/identificadores/comentários em inglês; **toda string de UI em português do Brasil com acentos corretos** (UTF-8 — nunca `sessao`/`configuracao`).
- **Temas:** componentes consomem **apenas tokens semânticos** (`bg-background`, `text-foreground`, `text-severity-warning`, …). Nunca `--gallo-*` nem hex.
- **Fronteiras de import (ESLint):** features acessam dados só via `@/providers/data` (hooks `useXxxProvider`). Proibido importar `@/mocks`, `impl/*`, `contracts/*` individuais ou `factory` fora das camadas permitidas.
- **TypeScript:** `strict: true`. Evitar `any`. Interfaces de domínio prefixadas com `I`.
- **Engine puro:** sem React, sem timers, sem Web APIs; recebe `now`/timestamps por parâmetro (testável e determinístico).
- **Migrations:** toda mudança de schema é versionada em `supabase/migrations/` (espelho do remoto). **Aplicar em produção é passo separado, confirmado com o dono** — nunca aplicar sozinho.
- **Não é fronteira de segurança:** o recurso é client-side; RLS/Auth continuam sendo a segurança real.

---

## File Structure

**Criar:**
- `src/features/session-timeout/engine/resolveSessionTimeout.ts` + `.test.ts` — resolve config efetiva (global+override → enabled/idleMs/warningMs).
- `src/features/session-timeout/engine/idlePhases.ts` + `.test.ts` — fase active/warning/expired + restantes.
- `src/features/session-timeout/engine/beepSchedule.ts` + `.test.ts` — cadência/urgência dos beeps.
- `src/features/session-timeout/lib/beep.ts` + `.test.ts` — wrapper Web Audio (no-op gracioso).
- `src/features/session-timeout/hooks/useActivityTracker.ts` — listeners de atividade throttled.
- `src/features/session-timeout/hooks/useCrossTabActivity.ts` — sincronização entre abas.
- `src/features/session-timeout/hooks/useSessionTimeout.ts` — orquestrador (montado no AppLayout).
- `src/features/session-timeout/components/SessionTimeoutModal.tsx` — modal de contagem.
- `src/features/session-timeout/components/SessionTimeoutGuard.tsx` — usa o hook + renderiza o modal.
- `src/features/session-timeout/components/SessionOverrideSection.tsx` — subseção de override no cadastro de usuário.
- `src/features/session-timeout/index.ts` — barrel público.
- `src/features/admin-settings/pages/SessionSettingsPage.tsx` — tela de config global.
- `src/routes/app.configuracoes.sessao.tsx` — rota Owner-only.
- `supabase/migrations/20260621120000_seller_session_timeout_override.sql` — coluna jsonb.

**Modificar:**
- `src/shared/types/platform.ts` — `ISessionTimeoutSettings`, `DEFAULT_SESSION_TIMEOUT`, `IPlatformSettings.sessionTimeout`.
- `src/shared/types/people.ts` — `ISeller.sessionTimeoutOverride`.
- `src/features/shell/layouts/AppLayout.tsx` — montar `<SessionTimeoutGuard/>`.
- `src/features/shell/layouts/SettingsLayout.tsx` — entrada "Segurança da sessão".
- `src/providers/data/impl/supabase/sellers.ts` — mapear a coluna nova.
- `src/features/admin-settings/components/SellerFormDialog.tsx` — incluir o override no form.

---

## Task 1: Fundação de tipos

**Files:**
- Modify: `src/shared/types/platform.ts`
- Modify: `src/shared/types/people.ts`

**Interfaces:**
- Produces: `ISessionTimeoutSettings { enabled: boolean; idleMinutes: number; warningSeconds: number; soundEnabled: boolean; soundVolume: number }`; `DEFAULT_SESSION_TIMEOUT: ISessionTimeoutSettings`; `IPlatformSettings.sessionTimeout?: ISessionTimeoutSettings`; `ISeller.sessionTimeoutOverride?: ISessionTimeoutSettings | null`.

- [ ] **Step 1: Adicionar o tipo e o default em `platform.ts`**

No topo de `src/shared/types/platform.ts` (junto às demais interfaces do arquivo), adicione:

```ts
/** Configuração de encerramento de sessão por inatividade (idle timeout). */
export interface ISessionTimeoutSettings {
  /** Master switch — quando false, nenhum rastreamento ocorre. */
  enabled: boolean;
  /** Minutos de inatividade até encerrar (a janela de aviso está incluída neste total). */
  idleMinutes: number;
  /** Segundos do modal de contagem antes do logout. Deve ser < idleMinutes·60. */
  warningSeconds: number;
  /** Emite beeps audíveis durante o aviso. */
  soundEnabled: boolean;
  /** Intensidade do beep, 0..1 (ganho do oscilador). */
  soundVolume: number;
}

/** Default aplicado quando `IPlatformSettings.sessionTimeout` está ausente. */
export const DEFAULT_SESSION_TIMEOUT: ISessionTimeoutSettings = {
  enabled: true,
  idleMinutes: 30,
  warningSeconds: 60,
  soundEnabled: true,
  soundVolume: 0.5,
};
```

- [ ] **Step 2: Adicionar o campo em `IPlatformSettings`**

Dentro de `export interface IPlatformSettings { … }` em `src/shared/types/platform.ts`, adicione o campo (depois de `participantCrossInstance?`):

```ts
  /** Política de encerramento de sessão por inatividade. Ausente ⇒ DEFAULT_SESSION_TIMEOUT. */
  sessionTimeout?: ISessionTimeoutSettings;
```

- [ ] **Step 3: Adicionar o override em `ISeller`**

Em `src/shared/types/people.ts`, dentro de `export interface ISeller { … }` (logo após `accessGrant?: IAccessGrant | null;`), adicione:

```ts
  /**
   * Override completo da política de sessão para este usuário (idle timeout).
   * null/undefined ⇒ herda o global. Quando presente, é autoritativo (pode
   * inclusive ligar mesmo com o global desligado). É um snapshot: não acompanha
   * mudanças posteriores do global.
   */
  sessionTimeoutOverride?: ISessionTimeoutSettings | null;
```

Adicione o import do tipo no topo de `people.ts` (a linha de import de `./platform` já existe — estenda-a):

```ts
import type { ISessionTimeoutSettings, VehicleCadastroMode } from "./platform";
```

- [ ] **Step 4: Verificar que o barrel reexporta**

O barrel `src/shared/types/index.ts` usa `export * from "./platform"`, então `ISessionTimeoutSettings` e `DEFAULT_SESSION_TIMEOUT` já ficam disponíveis em `@/shared/types`. Confirme abrindo `src/shared/types/index.ts` e checando que há `export * from "./platform";` e `export * from "./people";`. Se algum estiver com export nomeado em vez de `export *`, acrescente os novos nomes.

- [ ] **Step 5: Type-check do delta + build**

Run: `bunx tsc --noEmit 2>&1 | grep -E "platform.ts|people.ts"`
Expected: nenhuma linha nova de erro nesses arquivos (apenas o baseline pré-existente, que não toca esses dois).

Run: `bun run build`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/platform.ts src/shared/types/people.ts
git commit -m "feat(types): add session timeout settings and per-user override"
```

---

## Task 2: Engine — `resolveSessionTimeout`

**Files:**
- Create: `src/features/session-timeout/engine/resolveSessionTimeout.ts`
- Test: `src/features/session-timeout/engine/resolveSessionTimeout.test.ts`

**Interfaces:**
- Consumes: `ISessionTimeoutSettings`, `DEFAULT_SESSION_TIMEOUT` de `@/shared/types`.
- Produces: `resolveSessionTimeout(global, override) → { enabled: boolean; idleMs: number; warningMs: number; soundEnabled: boolean; soundVolume: number }` (tipo `IResolvedSessionTimeout`). A precedência override→global→default vale para TODOS os campos (idle/aviso E som), eliminando duplicação no orquestrador.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/session-timeout/engine/resolveSessionTimeout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ISessionTimeoutSettings } from "@/shared/types";
import { resolveSessionTimeout } from "./resolveSessionTimeout";

const base: ISessionTimeoutSettings = {
  enabled: true,
  idleMinutes: 30,
  warningSeconds: 60,
  soundEnabled: true,
  soundVolume: 0.5,
};

describe("resolveSessionTimeout", () => {
  it("falls back to the default when nothing is configured", () => {
    expect(resolveSessionTimeout(undefined, undefined)).toEqual({
      enabled: true,
      idleMs: 30 * 60_000,
      warningMs: 60_000,
      soundEnabled: true,
      soundVolume: 0.5,
    });
  });

  it("is disabled when the global master switch is off", () => {
    expect(resolveSessionTimeout({ ...base, enabled: false }, undefined)).toEqual({
      enabled: false,
      idleMs: 0,
      warningMs: 0,
      soundEnabled: false,
      soundVolume: 0,
    });
  });

  it("lets the override win over the global (even enabling with global off)", () => {
    const override: ISessionTimeoutSettings = {
      ...base,
      idleMinutes: 5,
      warningSeconds: 30,
      soundEnabled: false,
      soundVolume: 0.8,
    };
    expect(resolveSessionTimeout({ ...base, enabled: false }, override)).toEqual({
      enabled: true,
      idleMs: 5 * 60_000,
      warningMs: 30_000,
      soundEnabled: false,
      soundVolume: 0.8,
    });
  });

  it("inherits the global when the override is null", () => {
    expect(resolveSessionTimeout(base, null)).toEqual({
      enabled: true,
      idleMs: 30 * 60_000,
      warningMs: 60_000,
      soundEnabled: true,
      soundVolume: 0.5,
    });
  });

  it("clamps the warning window to be strictly shorter than idle", () => {
    const cfg: ISessionTimeoutSettings = { ...base, idleMinutes: 1, warningSeconds: 120 };
    expect(resolveSessionTimeout(cfg, undefined)).toEqual({
      enabled: true,
      idleMs: 60_000,
      warningMs: 59_000,
      soundEnabled: true,
      soundVolume: 0.5,
    });
  });

  it("clamps the sound volume to 0..1", () => {
    expect(resolveSessionTimeout({ ...base, soundVolume: 5 }, undefined).soundVolume).toBe(1);
    expect(resolveSessionTimeout({ ...base, soundVolume: -1 }, undefined).soundVolume).toBe(0);
  });

  it("sanitizes non-positive/NaN values back to the default", () => {
    const cfg: ISessionTimeoutSettings = { ...base, idleMinutes: 0, warningSeconds: -5 };
    expect(resolveSessionTimeout(cfg, undefined)).toEqual({
      enabled: true,
      idleMs: 30 * 60_000,
      warningMs: 60_000,
      soundEnabled: true,
      soundVolume: 0.5,
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/session-timeout/engine/resolveSessionTimeout.test.ts`
Expected: FAIL — `Failed to resolve import "./resolveSessionTimeout"`.

- [ ] **Step 3: Implementar o mínimo**

Create `src/features/session-timeout/engine/resolveSessionTimeout.ts`:

```ts
import { DEFAULT_SESSION_TIMEOUT, type ISessionTimeoutSettings } from "@/shared/types";

/** Resolved, runtime-ready timeout values (milliseconds) + sound. */
export interface IResolvedSessionTimeout {
  enabled: boolean;
  idleMs: number;
  warningMs: number;
  soundEnabled: boolean;
  soundVolume: number;
}

/** Replaces non-positive/NaN numbers with the default. */
function sanitize(cfg: ISessionTimeoutSettings): { idleMinutes: number; warningSeconds: number } {
  const idleMinutes =
    Number.isFinite(cfg.idleMinutes) && cfg.idleMinutes > 0
      ? cfg.idleMinutes
      : DEFAULT_SESSION_TIMEOUT.idleMinutes;
  const warningSeconds =
    Number.isFinite(cfg.warningSeconds) && cfg.warningSeconds > 0
      ? cfg.warningSeconds
      : DEFAULT_SESSION_TIMEOUT.warningSeconds;
  return { idleMinutes, warningSeconds };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SESSION_TIMEOUT.soundVolume;
  return Math.min(1, Math.max(0, n));
}

/**
 * Resolves the effective idle-timeout config for a user. The same precedence
 * (per-user override, authoritative when present → global → default) applies to
 * every field, including sound — so the orchestrator reads one resolved object.
 */
export function resolveSessionTimeout(
  global: ISessionTimeoutSettings | undefined,
  override: ISessionTimeoutSettings | null | undefined,
): IResolvedSessionTimeout {
  const effective = override ?? global ?? DEFAULT_SESSION_TIMEOUT;
  if (!effective.enabled) {
    return { enabled: false, idleMs: 0, warningMs: 0, soundEnabled: false, soundVolume: 0 };
  }
  const { idleMinutes, warningSeconds } = sanitize(effective);
  const idleMs = idleMinutes * 60_000;
  let warningMs = warningSeconds * 1_000;
  if (warningMs >= idleMs) {
    warningMs = Math.max(1_000, idleMs - 1_000);
  }
  return {
    enabled: true,
    idleMs,
    warningMs,
    soundEnabled: effective.soundEnabled,
    soundVolume: clamp01(effective.soundVolume),
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/session-timeout/engine/resolveSessionTimeout.test.ts`
Expected: PASS (7 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/features/session-timeout/engine/resolveSessionTimeout.ts src/features/session-timeout/engine/resolveSessionTimeout.test.ts
git commit -m "feat(session-timeout): resolve effective idle config from global + override"
```

---

## Task 3: Engine — `idlePhases`

**Files:**
- Create: `src/features/session-timeout/engine/idlePhases.ts`
- Test: `src/features/session-timeout/engine/idlePhases.test.ts`

**Interfaces:**
- Produces: `computeIdlePhase(lastActivityAt, now, idleMs, warningMs) → IIdleStatus { phase: 'active' | 'warning' | 'expired'; msUntilWarning: number; msUntilLogout: number }`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/session-timeout/engine/idlePhases.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeIdlePhase } from "./idlePhases";

const IDLE = 30 * 60_000; // 1_800_000
const WARN = 60_000;
const WARN_AT = IDLE - WARN; // 1_740_000

describe("computeIdlePhase", () => {
  it("is active right after activity", () => {
    expect(computeIdlePhase(0, 0, IDLE, WARN)).toEqual({
      phase: "active",
      msUntilWarning: WARN_AT,
      msUntilLogout: IDLE,
    });
  });

  it("enters warning exactly at idle - warning", () => {
    const r = computeIdlePhase(0, WARN_AT, IDLE, WARN);
    expect(r.phase).toBe("warning");
    expect(r.msUntilWarning).toBe(0);
    expect(r.msUntilLogout).toBe(WARN);
  });

  it("is expired at the idle boundary", () => {
    const r = computeIdlePhase(0, IDLE, IDLE, WARN);
    expect(r.phase).toBe("expired");
    expect(r.msUntilLogout).toBe(0);
  });

  it("treats a future lastActivityAt (clock skew) as active", () => {
    const r = computeIdlePhase(10_000, 0, IDLE, WARN);
    expect(r.phase).toBe("active");
    expect(r.msUntilLogout).toBe(IDLE);
  });

  it("reports the remaining countdown mid-warning", () => {
    const r = computeIdlePhase(0, WARN_AT + 20_000, IDLE, WARN);
    expect(r.phase).toBe("warning");
    expect(r.msUntilLogout).toBe(40_000);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/session-timeout/engine/idlePhases.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar o mínimo**

Create `src/features/session-timeout/engine/idlePhases.ts`:

```ts
export type IdlePhase = "active" | "warning" | "expired";

export interface IIdleStatus {
  phase: IdlePhase;
  /** ms até abrir o aviso (0 quando já está em warning/expired). */
  msUntilWarning: number;
  /** ms até o logout (0 quando expirado). */
  msUntilLogout: number;
}

/**
 * Pure phase computation for the idle timer. `lastActivityAt`/`now` are epoch ms.
 * A future `lastActivityAt` (clock skew) is clamped to "no time elapsed".
 */
export function computeIdlePhase(
  lastActivityAt: number,
  now: number,
  idleMs: number,
  warningMs: number,
): IIdleStatus {
  const elapsed = Math.max(0, now - lastActivityAt);
  const warnAt = idleMs - warningMs;
  const msUntilWarning = Math.max(0, warnAt - elapsed);
  const msUntilLogout = Math.max(0, idleMs - elapsed);
  let phase: IdlePhase = "active";
  if (elapsed >= idleMs) phase = "expired";
  else if (elapsed >= warnAt) phase = "warning";
  return { phase, msUntilWarning, msUntilLogout };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/session-timeout/engine/idlePhases.test.ts`
Expected: PASS (5 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/features/session-timeout/engine/idlePhases.ts src/features/session-timeout/engine/idlePhases.test.ts
git commit -m "feat(session-timeout): compute idle phase and countdown"
```

---

## Task 4: Engine — `beepSchedule`

**Files:**
- Create: `src/features/session-timeout/engine/beepSchedule.ts`
- Test: `src/features/session-timeout/engine/beepSchedule.test.ts`

**Interfaces:**
- Produces: `shouldBeepAtTick(remainingMs, warningMs, lastBeepRemainingMs) → IBeepDecision { beep: boolean; urgency: number }`; constantes `BEEP_INTERVAL_MAX_MS`, `BEEP_INTERVAL_MIN_MS`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/session-timeout/engine/beepSchedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldBeepAtTick } from "./beepSchedule";

const WARN = 60_000;

describe("shouldBeepAtTick", () => {
  it("beeps on the first tick of the window", () => {
    const r = shouldBeepAtTick(WARN, WARN, null);
    expect(r.beep).toBe(true);
    expect(r.urgency).toBeCloseTo(0, 5);
  });

  it("does not beep again too soon after the last beep", () => {
    // last beep at remaining=60000, now remaining=57000 → 3s elapsed (< ~7.6s interval)
    expect(shouldBeepAtTick(57_000, WARN, 60_000).beep).toBe(false);
  });

  it("beeps again once enough time has elapsed", () => {
    // 10s elapsed since last beep, interval ~6.8s → beep
    expect(shouldBeepAtTick(50_000, WARN, 60_000).beep).toBe(true);
  });

  it("beeps densely near the end (urgency high)", () => {
    const r = shouldBeepAtTick(1_000, WARN, 3_000);
    expect(r.beep).toBe(true);
    expect(r.urgency).toBeGreaterThan(0.9);
  });

  it("does not beep once the countdown is over", () => {
    expect(shouldBeepAtTick(0, WARN, 5_000).beep).toBe(false);
  });

  it("does not beep outside the warning window", () => {
    expect(shouldBeepAtTick(WARN + 10_000, WARN, null).beep).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/session-timeout/engine/beepSchedule.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar o mínimo**

Create `src/features/session-timeout/engine/beepSchedule.ts`:

```ts
/** Intervalo entre beeps no início da janela (urgency 0). */
export const BEEP_INTERVAL_MAX_MS = 8_000;
/** Intervalo entre beeps no fim da janela (urgency 1). */
export const BEEP_INTERVAL_MIN_MS = 800;

export interface IBeepDecision {
  beep: boolean;
  /** 0..1 — cresce conforme o tempo se esgota; modula frequência/volume do beep. */
  urgency: number;
}

/**
 * Decide se este tick deve emitir um beep e com qual urgência.
 * `remainingMs` = ms até o logout; `lastBeepRemainingMs` = o `remainingMs`
 * registrado no beep anterior (null = ainda não tocou nenhum nesta janela).
 * Cadência decrescente: beeps mais espaçados no início, densos no fim.
 */
export function shouldBeepAtTick(
  remainingMs: number,
  warningMs: number,
  lastBeepRemainingMs: number | null,
): IBeepDecision {
  if (warningMs <= 0 || remainingMs <= 0 || remainingMs > warningMs) {
    return { beep: false, urgency: remainingMs <= 0 ? 1 : 0 };
  }
  const urgency = Math.min(1, Math.max(0, 1 - remainingMs / warningMs));
  if (lastBeepRemainingMs === null) {
    return { beep: true, urgency };
  }
  const interval =
    BEEP_INTERVAL_MAX_MS - urgency * (BEEP_INTERVAL_MAX_MS - BEEP_INTERVAL_MIN_MS);
  const elapsedSinceLastBeep = lastBeepRemainingMs - remainingMs;
  return { beep: elapsedSinceLastBeep >= interval, urgency };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/session-timeout/engine/beepSchedule.test.ts`
Expected: PASS (6 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/features/session-timeout/engine/beepSchedule.ts src/features/session-timeout/engine/beepSchedule.test.ts
git commit -m "feat(session-timeout): escalating beep schedule"
```

---

## Task 5: `lib/beep.ts` — wrapper Web Audio

**Files:**
- Create: `src/features/session-timeout/lib/beep.ts`
- Test: `src/features/session-timeout/lib/beep.test.ts`

**Interfaces:**
- Produces: `createBeeper() → IBeeper { unlock(): void; beep(volume: number, urgency: number): void }`.

- [ ] **Step 1: Escrever o teste de smoke (falha)**

Create `src/features/session-timeout/lib/beep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBeeper } from "./beep";

// jsdom não expõe AudioContext → o beeper deve virar no-op sem lançar.
describe("createBeeper", () => {
  it("returns a no-op beeper when Web Audio is unavailable", () => {
    const beeper = createBeeper();
    expect(() => beeper.unlock()).not.toThrow();
    expect(() => beeper.beep(0.5, 0.5)).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/session-timeout/lib/beep.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

Create `src/features/session-timeout/lib/beep.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/session-timeout/lib/beep.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/session-timeout/lib/beep.ts src/features/session-timeout/lib/beep.test.ts
git commit -m "feat(session-timeout): web audio beeper with graceful no-op"
```

---

## Task 6: Hooks de atividade (tracker + cross-tab)

**Files:**
- Create: `src/features/session-timeout/hooks/useActivityTracker.ts`
- Create: `src/features/session-timeout/hooks/useCrossTabActivity.ts`

**Interfaces:**
- Produces:
  - `useActivityTracker(onActivity: () => void, enabled: boolean, throttleMs?: number): void`
  - `useCrossTabActivity(onRemoteActivity: (ts: number) => void, enabled: boolean): { publish: (ts: number) => void }`

> Hooks de runtime tocam Web APIs/timers — validação é manual (não há teste unitário aqui; a lógica testável vive no `engine/`).

- [ ] **Step 1: Criar `useActivityTracker`**

Create `src/features/session-timeout/hooks/useActivityTracker.ts`:

```ts
import { useEffect } from "react";

/** User-input events that count as activity. All passive (no preventDefault). */
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

/**
 * Calls `onActivity` (throttled) on any real user interaction in this tab.
 * No-op while `enabled` is false. `onActivity` should be stable (useCallback).
 */
export function useActivityTracker(
  onActivity: () => void,
  enabled: boolean,
  throttleMs = 1_000,
): void {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const handler = () => {
      const now = Date.now();
      if (now - last < throttleMs) return;
      last = now;
      onActivity();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, handler);
    };
  }, [onActivity, enabled, throttleMs]);
}
```

- [ ] **Step 2: Criar `useCrossTabActivity`**

Create `src/features/session-timeout/hooks/useCrossTabActivity.ts`:

```ts
import { useCallback, useEffect, useRef } from "react";

const CHANNEL_NAME = "gallo-session-activity";
const LS_KEY = "gallo-session-activity-ts";

/**
 * Cross-tab activity sync. Publishes/receives the latest activity timestamp via
 * BroadcastChannel (fallback: localStorage `storage` event). Logout only fires
 * when every tab is idle — the orchestrator keeps the MAX timestamp seen.
 */
export function useCrossTabActivity(
  onRemoteActivity: (ts: number) => void,
  enabled: boolean,
): { publish: (ts: number) => void } {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e: MessageEvent) => {
        if (typeof e.data === "number") onRemoteActivity(e.data);
      };
      channelRef.current = channel;
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        const ts = Number(e.newValue);
        if (Number.isFinite(ts)) onRemoteActivity(ts);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      channelRef.current = null;
    };
  }, [onRemoteActivity, enabled]);

  const publish = useCallback((ts: number) => {
    channelRef.current?.postMessage(ts);
    try {
      window.localStorage.setItem(LS_KEY, String(ts));
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }, []);

  return { publish };
}
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/features/session-timeout/hooks/useActivityTracker.ts src/features/session-timeout/hooks/useCrossTabActivity.ts
git commit -m "feat(session-timeout): activity tracking and cross-tab sync hooks"
```

---

## Task 7: Orquestrador + Modal + Guard + barrel

**Files:**
- Create: `src/features/session-timeout/hooks/useSessionTimeout.ts`
- Create: `src/features/session-timeout/components/SessionTimeoutModal.tsx`
- Create: `src/features/session-timeout/components/SessionTimeoutGuard.tsx`
- Create: `src/features/session-timeout/index.ts`

**Interfaces:**
- Consumes: `resolveSessionTimeout`, `computeIdlePhase`, `shouldBeepAtTick`, `createBeeper`, `useActivityTracker`, `useCrossTabActivity`; `useSettingsProvider`/`useSellersProvider` de `@/providers/data`; `useAuth`; `useCurrentStore` de `@/features/multistore`.
- Produces: `useSessionTimeout() → { warningOpen: boolean; secondsLeft: number; stayConnected: () => void; logoutNow: () => void }`; `<SessionTimeoutModal …/>`; `<SessionTimeoutGuard/>`; barrel exporta `SessionTimeoutGuard` e `SessionOverrideSection`.

> Validação manual (runtime). Sem teste unitário — a lógica determinística está nos engines das Tasks 2–4.

- [ ] **Step 1: Criar o orquestrador `useSessionTimeout`**

Create `src/features/session-timeout/hooks/useSessionTimeout.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useSettingsProvider, useSellersProvider } from "@/providers/data";
import { resolveSessionTimeout } from "../engine/resolveSessionTimeout";
import { computeIdlePhase } from "../engine/idlePhases";
import { shouldBeepAtTick } from "../engine/beepSchedule";
import { createBeeper, type IBeeper } from "../lib/beep";
import { useActivityTracker } from "./useActivityTracker";
import { useCrossTabActivity } from "./useCrossTabActivity";

export interface ISessionTimeoutState {
  warningOpen: boolean;
  secondsLeft: number;
  soundEnabled: boolean;
  stayConnected: () => void;
  logoutNow: () => void;
}

const TICK_MS = 1_000;

/**
 * Idle-timeout orchestrator. Mounted once (via SessionTimeoutGuard) inside the
 * authenticated app layout. Tracks activity (this tab + others), opens a warning
 * with escalating beeps, and routes to /auth/logout on expiry.
 */
export function useSessionTimeout(): ISessionTimeoutState {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const settingsProvider = useSettingsProvider();
  const sellersProvider = useSellersProvider();

  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const sellerId = currentUser?.sellerId;

  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    enabled: Boolean(currentUser),
    staleTime: 5 * 60_000,
  });
  const sellerQuery = useQuery({
    queryKey: ["seller", sellerId],
    queryFn: () => sellersProvider.get(sellerId!),
    enabled: Boolean(sellerId),
    staleTime: 5 * 60_000,
  });

  const resolved = useMemo(
    () =>
      resolveSessionTimeout(
        settingsQuery.data?.sessionTimeout,
        sellerQuery.data?.sessionTimeoutOverride,
      ),
    [settingsQuery.data?.sessionTimeout, sellerQuery.data?.sessionTimeoutOverride],
  );

  // Active only when enabled AND a user is signed in.
  const active = resolved.enabled && Boolean(currentUser);

  const beeperRef = useRef<IBeeper | null>(null);
  if (!beeperRef.current) beeperRef.current = createBeeper();

  const lastActivityRef = useRef<number>(Date.now());
  const lastBeepRemainingRef = useRef<number | null>(null);
  const loggedOutRef = useRef(false);

  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const { publish } = useCrossTabActivity((ts) => {
    if (ts > lastActivityRef.current) lastActivityRef.current = ts;
  }, active);

  const markActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    publish(now);
    // Any activity unlocks audio and clears the warning state.
    // setWarningOpen(false) is a no-op when already closed (stable callback).
    beeperRef.current?.unlock();
    setWarningOpen(false);
    lastBeepRemainingRef.current = null;
  }, [publish]);

  useActivityTracker(markActivity, active);

  // Reset the clock whenever the feature (re)activates.
  useEffect(() => {
    if (active) {
      lastActivityRef.current = Date.now();
      loggedOutRef.current = false;
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      setWarningOpen(false);
      return;
    }
    const tick = () => {
      const status = computeIdlePhase(
        lastActivityRef.current,
        Date.now(),
        resolved.idleMs,
        resolved.warningMs,
      );
      if (status.phase === "expired") {
        if (!loggedOutRef.current) {
          loggedOutRef.current = true;
          void navigate({ to: "/auth/logout" });
        }
        return;
      }
      if (status.phase === "warning") {
        setWarningOpen(true);
        setSecondsLeft(Math.ceil(status.msUntilLogout / 1_000));
        if (resolved.soundEnabled) {
          const decision = shouldBeepAtTick(
            status.msUntilLogout,
            resolved.warningMs,
            lastBeepRemainingRef.current,
          );
          if (decision.beep) {
            beeperRef.current?.beep(resolved.soundVolume, decision.urgency);
            lastBeepRemainingRef.current = status.msUntilLogout;
          }
        }
      } else {
        setWarningOpen(false);
        lastBeepRemainingRef.current = null;
      }
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, resolved.idleMs, resolved.warningMs, resolved.soundEnabled, resolved.soundVolume]);

  const stayConnected = useCallback(() => {
    markActivity();
  }, [markActivity]);

  const logoutNow = useCallback(() => {
    if (loggedOutRef.current) return;
    loggedOutRef.current = true;
    void navigate({ to: "/auth/logout" });
  }, [navigate]);

  return {
    warningOpen: warningOpen && active,
    secondsLeft,
    soundEnabled: resolved.soundEnabled,
    stayConnected,
    logoutNow,
  };
}
```

- [ ] **Step 2: Criar o modal**

Create `src/features/session-timeout/components/SessionTimeoutModal.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

interface ISessionTimeoutModalProps {
  open: boolean;
  secondsLeft: number;
  /** Total da janela de aviso, em segundos — base da barra de progresso. */
  totalSeconds: number;
  onStayConnected: () => void;
  onLogoutNow: () => void;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Idle-timeout warning with a live countdown. Not dismissible by overlay/Esc. */
export function SessionTimeoutModal({
  open,
  secondsLeft,
  totalSeconds,
  onStayConnected,
  onLogoutNow,
}: ISessionTimeoutModalProps) {
  const critical = secondsLeft <= 10;
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100)) : 0;
  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon
              icon="mdi:clock-alert-outline"
              size={20}
              className={critical ? "text-severity-critical" : "text-severity-warning"}
            />
            Sua sessão será encerrada
          </AlertDialogTitle>
          <AlertDialogDescription>
            Detectamos inatividade. Por segurança, sua sessão será encerrada
            automaticamente. Clique em <strong>Continuar conectado</strong> para
            permanecer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <span
            aria-live="assertive"
            className={
              critical
                ? "text-5xl font-bold tabular-nums text-severity-critical"
                : "text-5xl font-bold tabular-nums text-foreground"
            }
          >
            {formatClock(secondsLeft)}
          </span>
          <Progress value={pct} className="w-full" />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onLogoutNow}>Sair agora</AlertDialogCancel>
          <AlertDialogAction onClick={onStayConnected}>Continuar conectado</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Criar o guard**

Create `src/features/session-timeout/components/SessionTimeoutGuard.tsx`:

```tsx
import { useSessionTimeout } from "../hooks/useSessionTimeout";
import { SessionTimeoutModal } from "./SessionTimeoutModal";

/**
 * Drives the idle-timeout orchestrator and renders the warning modal. Mount once
 * inside the authenticated app layout (AppLayout). Renders nothing while active.
 */
export function SessionTimeoutGuard() {
  const { warningOpen, secondsLeft, stayConnected, logoutNow } = useSessionTimeout();
  return (
    <SessionTimeoutModal
      open={warningOpen}
      secondsLeft={secondsLeft}
      totalSeconds={Math.max(secondsLeft, 1)}
      onStayConnected={stayConnected}
      onLogoutNow={logoutNow}
    />
  );
}
```

> The `totalSeconds` here uses `Math.max(secondsLeft, 1)` so the bar starts full on the first warning tick; it's a cosmetic baseline (the bar shrinks as `secondsLeft` drops within the same warning). Acceptable for v1.

- [ ] **Step 4: Criar o barrel**

Create `src/features/session-timeout/index.ts`:

```ts
export { SessionTimeoutGuard } from "./components/SessionTimeoutGuard";
export { SessionOverrideSection } from "./components/SessionOverrideSection";
```

> `SessionOverrideSection` é criada na Task 9. Se executar as tasks fora de ordem e o build reclamar do export ausente, comente essa linha temporariamente e restaure ao chegar na Task 9.

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: build conclui sem erro **após** a Task 9 (ou com a linha do `SessionOverrideSection` comentada, se ainda não existir).

Se executar em ordem, pule esta verificação até a Task 9. Caso contrário, comente o export de `SessionOverrideSection` no barrel e rode `bun run build` (deve passar).

- [ ] **Step 6: Commit**

```bash
git add src/features/session-timeout/hooks/useSessionTimeout.ts src/features/session-timeout/components/SessionTimeoutModal.tsx src/features/session-timeout/components/SessionTimeoutGuard.tsx src/features/session-timeout/index.ts
git commit -m "feat(session-timeout): idle orchestrator, warning modal and guard"
```

---

## Task 8: Montar o guard no AppLayout

**Files:**
- Modify: `src/features/shell/layouts/AppLayout.tsx`

**Interfaces:**
- Consumes: `SessionTimeoutGuard` de `@/features/session-timeout`.

> Validação manual e2e.

- [ ] **Step 1: Importar o guard**

Em `src/features/shell/layouts/AppLayout.tsx`, adicione o import junto aos demais imports de features:

```ts
import { SessionTimeoutGuard } from "@/features/session-timeout";
```

- [ ] **Step 2: Renderizar o guard**

Dentro do `return`, logo antes de `<UrgentBroadcastClaim />` (perto do fim, dentro do `<div className="flex h-screen …">`), adicione:

```tsx
        <SessionTimeoutGuard />
```

Resultado (trecho final):

```tsx
        <BottomNav />
        <UrgentBroadcastClaim />
        <SessionTimeoutGuard />
      </div>
```

- [ ] **Step 3: Build + testes**

Run: `bun run build`
Expected: build OK (com a Task 9 já feita, ou o export comentado).

Run: `bun run test`
Expected: toda a suíte verde (engines das Tasks 2–4 inclusos).

- [ ] **Step 4: Validação manual**

Suba `bun run dev`, faça login no `/app`, e confirme (com um `idleMinutes` pequeno via tela da Task 9, ou temporariamente editando o default) que: o modal abre ~`warningSeconds` antes; o countdown corre; beeps tocam e adensam; "Continuar conectado" fecha e rearma; ficar parado até o fim redireciona para `/auth/login`.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell/layouts/AppLayout.tsx
git commit -m "feat(session-timeout): mount guard in the app layout"
```

---

## Task 9: Override por usuário (migration + mapper + form)

**Files:**
- Create: `supabase/migrations/20260621120000_seller_session_timeout_override.sql`
- Create: `src/features/session-timeout/components/SessionOverrideSection.tsx`
- Modify: `src/providers/data/impl/supabase/sellers.ts`
- Modify: `src/features/admin-settings/components/SellerFormDialog.tsx`

**Interfaces:**
- Consumes: `ISessionTimeoutSettings`, `DEFAULT_SESSION_TIMEOUT`; `useSettingsProvider`; `useCurrentStore`.
- Produces: `<SessionOverrideSection value={…} onChange={…} />` controlando `ISessionTimeoutSettings | null`.

> ⚠️ **Esta task toca uma coluna do Supabase.** O `rowToSeller` passará a selecionar `session_timeout_override`. Se a coluna não existir no banco-alvo, **toda leitura de sellers falha**. Aplique a migration ao banco (confirmado com o dono) **antes** de usar/deployar o mapper. Em modo `mock` (Demonstração) nada disso se aplica.

- [ ] **Step 1: Criar a migration (versionada)**

Create `supabase/migrations/20260621120000_seller_session_timeout_override.sql`:

```sql
-- Per-user idle session-timeout override (snapshot of ISessionTimeoutSettings).
-- null = inherit the store-global policy. RLS unchanged: the column follows the
-- existing sellers policies (Owner/staff edit the user record).
alter table public.sellers
  add column if not exists session_timeout_override jsonb;

comment on column public.sellers.session_timeout_override is
  'Per-user idle session timeout override (ISessionTimeoutSettings snapshot). null = inherit global.';
```

> Aplicação em produção: passo separado via MCP `apply_migration` **com confirmação do dono** (ver memória `feedback_never_merge_pr_only`). NÃO aplicar dentro desta task automaticamente.

- [ ] **Step 2: Mapear a coluna no provider supabase**

Em `src/providers/data/impl/supabase/sellers.ts`:

(a) Adicione o campo à interface `SellerRow` (após `access_grant`):
```ts
  session_timeout_override: ISeller["sessionTimeoutOverride"] | null;
```

(b) Adicione a coluna à constante `COLUMNS` (acrescente `, session_timeout_override` antes de `, active`):
```ts
const COLUMNS =
  "id, store_id, full_name, attendant_name, email, phone, type, availability, divisions, theme_preference, region, commission_tier, parent_seller_id, commission_rule, vehicle_cadastro_mode, department_id, rotation, work_schedule, schedule_overrides, access_grant, session_timeout_override, active, created_at, deleted_at";
```

(c) Em `rowToSeller`, adicione (após `accessGrant`):
```ts
    sessionTimeoutOverride: row.session_timeout_override ?? null,
```

(d) Em `sellerPatchToRow`, adicione (após o bloco `accessGrant`):
```ts
  // Nullable: `null` clears the override; `undefined` leaves it untouched.
  if (patch.sessionTimeoutOverride !== undefined)
    row.session_timeout_override = patch.sessionTimeoutOverride ?? null;
```

> O mock (`impl/mock/sellers.ts`) delega a `sellersApi.update(id, patch)` com merge de objeto — aceita o novo campo sem alteração.

- [ ] **Step 3: Criar a subseção de override**

Create `src/features/session-timeout/components/SessionOverrideSection.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_SESSION_TIMEOUT, type ISessionTimeoutSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface ISessionOverrideSectionProps {
  /** null = herda o global; objeto = override completo. */
  value: ISessionTimeoutSettings | null;
  onChange: (next: ISessionTimeoutSettings | null) => void;
}

/**
 * Subseção do cadastro de usuário: override completo da política de sessão.
 * Quando ligado, parte do valor global atual (fallback no default) e edita uma
 * cópia local — o save acontece no botão único do formulário pai.
 */
export function SessionOverrideSection({ value, onChange }: ISessionOverrideSectionProps) {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const settingsProvider = useSettingsProvider();
  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    staleTime: 5 * 60_000,
  });
  const globalCfg = settingsQuery.data?.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT;

  const custom = value !== null;
  const cfg = value ?? globalCfg;

  const toggleCustom = (on: boolean) => {
    onChange(on ? { ...globalCfg } : null);
  };
  const patch = (p: Partial<ISessionTimeoutSettings>) => {
    onChange({ ...cfg, ...p });
  };

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Tempo de sessão (override)</p>
          <p className="text-xs text-muted-foreground">
            Por padrão, herda a configuração global. Ligue para definir uma
            política própria para este usuário.
          </p>
        </div>
        <Switch checked={custom} onCheckedChange={toggleCustom} aria-label="Usar configuração própria" />
      </div>

      {custom && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ov-enabled">Encerrar por inatividade</Label>
            <Switch
              id="ov-enabled"
              checked={cfg.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ov-idle">Inatividade (min)</Label>
              <Input
                id="ov-idle"
                type="number"
                min={1}
                max={480}
                value={cfg.idleMinutes}
                onChange={(e) => patch({ idleMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-warn">Aviso (s)</Label>
              <Input
                id="ov-warn"
                type="number"
                min={10}
                max={300}
                value={cfg.warningSeconds}
                onChange={(e) => patch({ warningSeconds: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ov-sound">Emitir beeps</Label>
            <Switch
              id="ov-sound"
              checked={cfg.soundEnabled}
              onCheckedChange={(v) => patch({ soundEnabled: v })}
            />
          </div>

          <div className="space-y-1">
            <Label>Intensidade do som</Label>
            <Slider
              value={[cfg.soundVolume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={(v) => patch({ soundVolume: v[0] ?? cfg.soundVolume })}
              aria-label="Intensidade do som"
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Restaurar o export no barrel (se comentado na Task 7)**

Confirme que `src/features/session-timeout/index.ts` contém:
```ts
export { SessionOverrideSection } from "./components/SessionOverrideSection";
```

- [ ] **Step 5: Integrar no `SellerFormDialog`**

Em `src/features/admin-settings/components/SellerFormDialog.tsx`:

(a) Importe a subseção e o tipo:
```ts
import { SessionOverrideSection } from "@/features/session-timeout";
import type { ISessionTimeoutSettings } from "@/shared/types";
```

(b) Adicione o estado controlado (junto aos demais `useState`, após `rotationEnabled`):
```ts
  const [sessionOverride, setSessionOverride] = useState<ISessionTimeoutSettings | null>(
    seller?.sessionTimeoutOverride ?? null,
  );
```

(c) Re-sincronize no `useEffect` de abertura (junto às outras chamadas de reset, após `setRotationEnabled(...)`):
```ts
    setSessionOverride(seller?.sessionTimeoutOverride ?? null);
```

(d) Inclua no patch do `update` (dentro do `if (isEdit && seller)`, no objeto passado a `provider.update`, após `rotation: { enabled: rotationEnabled },`):
```ts
          sessionTimeoutOverride: sessionOverride,
```

(e) Renderize a subseção ao final da aba Geral, **dentro** de `<TabsContent value="geral" …>`, logo após o bloco de `region` (apenas em modo edição, espelhando Horário/Rodízio):
```tsx
                    {isEdit && seller && (
                      <SessionOverrideSection
                        value={sessionOverride}
                        onChange={setSessionOverride}
                      />
                    )}
```

- [ ] **Step 6: Build + testes**

Run: `bun run build`
Expected: build OK.

Run: `bun run test`
Expected: suíte verde.

- [ ] **Step 7: Validação manual**

Em modo Demonstração (mock), abra Configurações → Usuários → editar um usuário → aba Geral: ligue "Usar configuração própria", ajuste os campos, salve no botão único. Reabra e confirme que persistiu. Desligue → salva como herdar (null).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260621120000_seller_session_timeout_override.sql src/providers/data/impl/supabase/sellers.ts src/features/session-timeout/components/SessionOverrideSection.tsx src/features/session-timeout/index.ts src/features/admin-settings/components/SellerFormDialog.tsx
git commit -m "feat(session-timeout): per-user override column, mapper and form section"
```

---

## Task 10: Tela de configuração global

**Files:**
- Create: `src/features/admin-settings/pages/SessionSettingsPage.tsx`
- Create: `src/routes/app.configuracoes.sessao.tsx`
- Modify: `src/features/shell/layouts/SettingsLayout.tsx`

**Interfaces:**
- Consumes: `usePlatformSettings(storeId)`; `useCurrentStore`; `createBeeper`; `DEFAULT_SESSION_TIMEOUT`.

> Validação manual.

- [ ] **Step 1: Criar a página**

Create `src/features/admin-settings/pages/SessionSettingsPage.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_SESSION_TIMEOUT, type ISessionTimeoutSettings } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { createBeeper } from "@/features/session-timeout/lib/beep";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

export function SessionSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);

  const [draft, setDraft] = useState<ISessionTimeoutSettings>(DEFAULT_SESSION_TIMEOUT);
  const beeperRef = useRef(createBeeper());

  useEffect(() => {
    if (settings) setDraft(settings.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    const current = settings.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT;
    return JSON.stringify(current) !== JSON.stringify(draft);
  }, [settings, draft]);

  const patch = (p: Partial<ISessionTimeoutSettings>) => setDraft((d) => ({ ...d, ...p }));

  const handleSave = async () => {
    if (draft.warningSeconds >= draft.idleMinutes * 60) {
      toast.error("O aviso precisa ser menor que o tempo total de inatividade.");
      return;
    }
    try {
      await update({ sessionTimeout: draft }, "settings.session_timeout.update");
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handleReset = () => {
    if (settings) setDraft(settings.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT);
  };

  const testBeep = () => {
    beeperRef.current.unlock();
    beeperRef.current.beep(draft.soundVolume, 0.6);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Segurança da sessão"
          description="Encerramento automático por inatividade."
        />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Segurança da sessão"
        description="Encerra automaticamente a sessão de usuários internos após um período de inatividade, avisando antes com uma contagem regressiva e beeps. Não substitui a segurança do servidor — é uma política de estação."
      />

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Ativar encerramento por inatividade</p>
            <p className="text-xs text-muted-foreground">
              Quando desligado, nenhuma sessão é encerrada por inatividade.
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
            aria-label="Ativar encerramento por inatividade"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="idle">Minutos de inatividade até encerrar</Label>
            <Input
              id="idle"
              type="number"
              min={1}
              max={480}
              value={draft.idleMinutes}
              onChange={(e) => patch({ idleMinutes: Number(e.target.value) })}
              disabled={!draft.enabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="warn">Segundos de aviso antes do logout</Label>
            <Input
              id="warn"
              type="number"
              min={10}
              max={300}
              value={draft.warningSeconds}
              onChange={(e) => patch({ warningSeconds: Number(e.target.value) })}
              disabled={!draft.enabled}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Emitir beeps no aviso</p>
            <p className="text-xs text-muted-foreground">
              Sons curtos que ficam mais frequentes conforme o tempo se esgota.
            </p>
          </div>
          <Switch
            checked={draft.soundEnabled}
            onCheckedChange={(v) => patch({ soundEnabled: v })}
            disabled={!draft.enabled}
            aria-label="Emitir beeps no aviso"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Intensidade do som</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testBeep}
              disabled={!draft.enabled || !draft.soundEnabled}
              className="gap-1"
            >
              <Icon icon="mdi:volume-high" size={14} />
              Testar beep
            </Button>
          </div>
          <Slider
            value={[draft.soundVolume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={(v) => patch({ soundVolume: v[0] ?? draft.soundVolume })}
            disabled={!draft.enabled || !draft.soundEnabled}
            aria-label="Intensidade do som"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar a rota**

Create `src/routes/app.configuracoes.sessao.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SessionSettingsPage } from "@/features/admin-settings/pages/SessionSettingsPage";

export const Route = createFileRoute("/app/configuracoes/sessao")({
  beforeLoad: ({ location }) => {
    requireAuth(location.pathname, ["Owner"]);
  },
  component: () => (
    <SettingsLayout>
      <SessionSettingsPage />
    </SettingsLayout>
  ),
});
```

> O `routeTree.gen.ts` é gerado automaticamente pelo plugin do Vite ao rodar `bun run dev`/`build` — não edite à mão.

- [ ] **Step 3: Adicionar a entrada no menu de Configurações**

Em `src/features/shell/layouts/SettingsLayout.tsx`, no grupo `"Avançado"` do array `SETTINGS_GROUPS`, adicione um item (logo após o item `"Ambiente & Dados"`):

```ts
      {
        label: "Segurança da sessão",
        icon: "mdi:timer-lock-outline",
        to: "/app/configuracoes/sessao",
        roles: ["Owner"],
      },
```

- [ ] **Step 4: Build + testes**

Run: `bun run build`
Expected: build OK, rota gerada.

Run: `bun run test`
Expected: suíte verde.

- [ ] **Step 5: Validação manual**

Como Owner, acesse Configurações → Avançado → "Segurança da sessão". Ajuste valores, use "Testar beep" (deve soar), salve (toast de sucesso), recarregue e confirme persistência. Desligue o master switch e confirme que os campos ficam desabilitados.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin-settings/pages/SessionSettingsPage.tsx src/routes/app.configuracoes.sessao.tsx src/features/shell/layouts/SettingsLayout.tsx
git commit -m "feat(session-timeout): owner-only global settings screen"
```

---

## Task 11: Documentação dev + changelog (fechamento)

**Files:**
- Create: `docs/dev/session-timeout.md`
- Modify: `CHANGELOG.md`

> Executar ao final, após validação do dono. O bump de versão (MINOR + codinome) segue o fluxo da skill `versionamento`/`commit-push` da casa — confirme o codinome com o dono.

- [ ] **Step 1: Doc dev**

Create `docs/dev/session-timeout.md` resumindo: objetivo, arquitetura (engines/hooks/guard), parâmetros (global + override, default ligado 30min/60s), pontos de integração (AppLayout, tela de config, cadastro de usuário), bordas (áudio, multi-aba, não é fronteira de segurança), e a nota operacional do **default ligado** (comunicar a equipe). Referencie o spec `docs/superpowers/specs/2026-06-21-session-timeout-design.md`.

- [ ] **Step 2: Changelog**

Em `CHANGELOG.md`, adicione uma entrada `Added` na próxima versão MINOR (Keep a Changelog), descrevendo o recurso em português. Exemplo:

```markdown
### Added
- Encerramento de sessão por inatividade: aviso com contagem regressiva e beeps,
  configurável globalmente (Configurações → Segurança da sessão) e por usuário.
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/session-timeout.md CHANGELOG.md
git commit -m "docs(session-timeout): dev guide and changelog entry"
```

---

## Notas de execução e riscos

1. **Default ligado (risco operacional):** ao deployar, todos os usuários internos passam a ter 30 min de timeout. Comunicar a equipe antes; considerar `warningSeconds` generoso na largada.
2. **Coluna do Supabase:** a Task 9 só funciona em modo `supabase` após a migration ser aplicada ao banco (passo confirmado com o dono). Em modo Demonstração (mock) funciona de imediato.
3. **Ordem das tasks:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → (9 antes do build final do 7 por causa do export do barrel) → 8 → 10 → 11. Se preferir build limpo a cada passo, faça a Task 9 antes de fechar o build da Task 7, ou comente temporariamente o export de `SessionOverrideSection`.
4. **Áudio:** beeps dependem de um gesto prévio do usuário (autoplay policy). O `unlock()` no primeiro gesto resolve na prática; se o navegador bloquear, o modal visual continua funcionando.
5. **Type-check:** avalie `bunx tsc --noEmit` **por delta** — o baseline pré-existente (~315 erros) não deve crescer por causa desta feature.
```
