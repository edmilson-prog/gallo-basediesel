# Notificações Sonoras + Indicador de Não Lidas da Inbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tocar um beep discreto quando chega mensagem numa conversa própria já em atendimento, um beep diferente (mais chamativo) quando um cliente novo entra na fila, e acender um ponto vermelho num ícone dedicado do TopBar enquanto houver qualquer uma dessas duas coisas pendente — tudo funcionando em qualquer tela do app logado, não só com a Inbox aberta.

**Architecture:** Feature nova `src/features/inbox-alerts/`. Lógica pura em `engine/` (testada com Vitest): classificação de "conversa em fila", filtro de recência (guarda contra beep de import/backfill), dedupe de "mensagem já alertada" e throttle. Runtime: um motor de tom próprio via Web Audio (`lib/tonePlayer.ts`, independente do `session-timeout`), dois stores Zustand (`inboxActivityStore` — estado ao vivo hasUnreadMine/hasQueueWaiting; `soundAlertPreferencesStore` — liga/desliga+volume, persistido em localStorage) e um hook orquestrador (`useInboxActivityMonitor`) montado uma única vez, via `<InboxActivityGuard/>`, no `AppLayout` — reaproveitando os canais Realtime compartilhados já existentes (`subscribeToTable`, PRD-105) de `conversations`/`messages`. Dois ícones novos no `TopBar` (som + não lidas).

**Tech Stack:** React 19, TanStack Router/Query, Zustand (+ `zustand/middleware` persist), shadcn/ui (Tailwind v4), Web Audio API, Supabase Realtime (`postgres_changes`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-01-notificacoes-sonoras-inbox-design.md`

## Global Constraints

- **Gerenciador/scripts:** `bun` — testes `bun run test` (Vitest), build `bun run build` (Vite, NÃO faz type-check), type-check à parte `bunx tsc --noEmit` (avaliar **só o delta** — há baseline de erros pré-existentes). Gate de CI prático = `bun run build` + `bun run test` verdes.
- **Commits:** Conventional Commits em inglês, atômicos (`feat:`, `test:`, `refactor:`, `docs:`).
- **Idioma:** código/identificadores/comentários em inglês; **toda string de UI em português do Brasil com acentos corretos** (UTF-8 — nunca `nao`/`configuracao`).
- **Temas:** componentes consomem **apenas tokens semânticos** (`bg-destructive`, `text-muted-foreground`, `border-border`, …). Nunca `--gallo-*` nem hex.
- **Fronteiras de import:** dados só via `@/providers/data` (hooks `useXxxProvider`). Cross-feature import de um componente/hook **específico** de outra feature (por caminho direto, não pelo barrel) é padrão já aceito no projeto (ex.: `ConversationListItem.tsx` importa `EscalationBadge`/`EcommerceBadge` de outras features diretamente) — use esse padrão para reaproveitar `useAudioUnlock` do `session-timeout`. Proibido importar `@/mocks`, `impl/*`, `contracts/*` individuais ou `factory` fora das camadas permitidas.
- **TypeScript:** `strict: true`. Evitar `any`. Interfaces de domínio prefixadas com `I`.
- **Engine puro:** sem React, sem timers, sem Web APIs; recebe `now`/timestamps por parâmetro (testável e determinístico).
- **Realtime:** todo acesso a `conversations`/`messages` via `subscribeToTable` (canal compartilhado, ref-counted, `src/shared/lib/realtime.ts`) — nunca abra um `channel()` novo. Gate por `getActiveDataSource() === "supabase"` (mock não tem Realtime).
- **Sem migration nesta feature** — nenhuma mudança de schema. Toda a detecção usa métodos de provider já existentes.
- **Não é fronteira de segurança:** recurso 100% cosmético/client-side.

---

## File Structure

**Criar:**
- `src/features/inbox-alerts/engine/constants.ts` — limites de recência/throttle/debounce.
- `src/features/inbox-alerts/engine/isQueuedConversation.ts` + `.test.ts` — regra "conversa em fila" (extraída do badge existente).
- `src/features/inbox-alerts/engine/isRecentEvent.ts` + `.test.ts` — guarda contra evento antigo (import/backfill).
- `src/features/inbox-alerts/engine/isFreshInboundTimestamp.ts` + `.test.ts` — dedupe "mensagem já alertada".
- `src/features/inbox-alerts/engine/shouldThrottle.ts` + `.test.ts` — intervalo mínimo entre beeps do mesmo tipo.
- `src/features/inbox-alerts/lib/tonePlayer.ts` + `.test.ts` — motor de tom Web Audio (2 padrões).
- `src/features/inbox-alerts/store/inboxActivityStore.ts` — estado ao vivo `hasUnreadMine`/`hasQueueWaiting` (Zustand, em memória).
- `src/features/inbox-alerts/store/soundAlertPreferencesStore.ts` — liga/desliga + volume (Zustand + persist/localStorage).
- `src/features/inbox-alerts/hooks/useInboxActivity.ts` — seletor fino do `inboxActivityStore` para a UI.
- `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts` — orquestrador: seed + assinaturas Realtime + classificação + beep + escrita no store.
- `src/features/inbox-alerts/components/InboxActivityGuard.tsx` — monta o monitor (sem UI própria).
- `src/features/inbox-alerts/components/SoundAlertToggle.tsx` — ícone de som no TopBar (popover: liga/desliga, volume, testar).
- `src/features/inbox-alerts/components/InboxUnreadBadgeIcon.tsx` — ícone de não lidas no TopBar (ponto vermelho).
- `src/features/inbox-alerts/index.ts` — barrel público (cresce ao longo das tasks).
- `docs/dev/inbox-sound-notifications.md` — doc dev de fechamento.

**Modificar:**
- `src/features/conversations/components/ConversationListItem.tsx` — usa `isQueuedConversation` no lugar da regra inline.
- `src/features/conversations/pages/InboxPage.tsx` — espelha `unreadGlobal` no `inboxActivityStore`.
- `src/features/shell/layouts/AppLayout.tsx` — monta `<InboxActivityGuard/>`.
- `src/features/shell/components/TopBar.tsx` — monta `<InboxUnreadBadgeIcon/>` e `<SoundAlertToggle/>`.
- `CHANGELOG.md` — entrada de fechamento.

---

## Task 1: Engine — `isQueuedConversation` (+ refatorar o badge existente)

**Files:**
- Create: `src/features/inbox-alerts/engine/isQueuedConversation.ts`
- Test: `src/features/inbox-alerts/engine/isQueuedConversation.test.ts`
- Create: `src/features/inbox-alerts/index.ts`
- Modify: `src/features/conversations/components/ConversationListItem.tsx:10-11,276-288`

**Interfaces:**
- Produces: `isQueuedConversation(row: { assignedSellerId?: string | null; status: string; isSdrActive: boolean }) → boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/inbox-alerts/engine/isQueuedConversation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isQueuedConversation } from "./isQueuedConversation";

describe("isQueuedConversation", () => {
  it("is queued when unassigned, not SDR-driven and awaiting", () => {
    expect(
      isQueuedConversation({ assignedSellerId: null, status: "aguardando", isSdrActive: false }),
    ).toBe(true);
  });

  it("is not queued when assigned to a seller", () => {
    expect(
      isQueuedConversation({
        assignedSellerId: "seller-1",
        status: "aguardando",
        isSdrActive: false,
      }),
    ).toBe(false);
  });

  it("is not queued while the SDR is driving it", () => {
    expect(
      isQueuedConversation({ assignedSellerId: null, status: "aguardando", isSdrActive: true }),
    ).toBe(false);
  });

  it("is not queued outside the aguardando status", () => {
    expect(
      isQueuedConversation({ assignedSellerId: null, status: "em_andamento", isSdrActive: false }),
    ).toBe(false);
  });

  it("treats an empty-string assignedSellerId as unassigned", () => {
    expect(
      isQueuedConversation({ assignedSellerId: "", status: "aguardando", isSdrActive: false }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/inbox-alerts/engine/isQueuedConversation.test.ts`
Expected: FAIL — `Failed to resolve import "./isQueuedConversation"`.

- [ ] **Step 3: Implementar o mínimo**

Create `src/features/inbox-alerts/engine/isQueuedConversation.ts`:

```ts
export interface IQueueCheckInput {
  assignedSellerId?: string | null;
  status: string;
  isSdrActive: boolean;
}

/**
 * A conversation is "queued" (waiting for manual distribution) when nobody is
 * assigned, the SDR bot isn't driving it, and its status is still "aguardando".
 * Single source of truth shared by the Inbox "Em fila" badge and the
 * inbox-alerts "cliente novo na fila" beep — they must never drift apart.
 */
export function isQueuedConversation(row: IQueueCheckInput): boolean {
  return !row.assignedSellerId && !row.isSdrActive && row.status === "aguardando";
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/inbox-alerts/engine/isQueuedConversation.test.ts`
Expected: PASS (5 testes verdes).

- [ ] **Step 5: Criar o barrel público**

Create `src/features/inbox-alerts/index.ts`:

```ts
export { isQueuedConversation } from "./engine/isQueuedConversation";
```

- [ ] **Step 6: Refatorar `ConversationListItem.tsx` para usar a função extraída**

Em `src/features/conversations/components/ConversationListItem.tsx`, adicione o import logo após os outros imports de features (depois da linha `import { EcommerceBadge } from "@/features/ecommerce-integration/components/EcommerceBadge";`, linha 11):

```ts
import { isQueuedConversation } from "@/features/inbox-alerts";
```

Substitua o bloco (linhas 276-288):

```tsx
          {!conversation.assignedSellerId &&
            !conversation.isSdrActive &&
            conversation.status === "aguardando" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    <Icon icon="mdi:timer-sand" size={11} />
                    Em fila
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Conversa aguardando distribuição manual</TooltipContent>
              </Tooltip>
            )}
```

por:

```tsx
          {isQueuedConversation(conversation) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  <Icon icon="mdi:timer-sand" size={11} />
                  Em fila
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Conversa aguardando distribuição manual</TooltipContent>
            </Tooltip>
          )}
```

- [ ] **Step 7: Build + testes**

Run: `bun run build`
Expected: build conclui sem erro.

Run: `bun run test`
Expected: suíte verde (inclui o novo teste + o resto do projeto inalterado).

- [ ] **Step 8: Commit**

```bash
git add src/features/inbox-alerts/engine/isQueuedConversation.ts src/features/inbox-alerts/engine/isQueuedConversation.test.ts src/features/inbox-alerts/index.ts src/features/conversations/components/ConversationListItem.tsx
git commit -m "feat(inbox-alerts): extract isQueuedConversation and reuse it in the queue badge"
```

---

## Task 2: Engine — `isRecentEvent`

**Files:**
- Create: `src/features/inbox-alerts/engine/isRecentEvent.ts`
- Test: `src/features/inbox-alerts/engine/isRecentEvent.test.ts`

**Interfaces:**
- Produces: `isRecentEvent(eventIso: string, nowIso: string, maxAgeMs: number) → boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/inbox-alerts/engine/isRecentEvent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isRecentEvent } from "./isRecentEvent";

describe("isRecentEvent", () => {
  const now = "2026-07-01T12:00:00.000Z";

  it("is recent exactly at the age limit", () => {
    const eventIso = "2026-07-01T11:59:00.000Z"; // 60s before now
    expect(isRecentEvent(eventIso, now, 60_000)).toBe(true);
  });

  it("is not recent just past the age limit", () => {
    const eventIso = "2026-07-01T11:58:59.000Z"; // 61s before now
    expect(isRecentEvent(eventIso, now, 60_000)).toBe(false);
  });

  it("treats a future timestamp (clock skew) as recent", () => {
    const eventIso = "2026-07-01T12:00:10.000Z"; // 10s after now
    expect(isRecentEvent(eventIso, now, 60_000)).toBe(true);
  });

  it("is not recent for an invalid timestamp", () => {
    expect(isRecentEvent("not-a-date", now, 60_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/inbox-alerts/engine/isRecentEvent.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar o mínimo**

Create `src/features/inbox-alerts/engine/isRecentEvent.ts`:

```ts
/**
 * True when `eventIso` happened at most `maxAgeMs` before `nowIso`. Guards
 * beeps against stale events replayed by an import/backfill job (which still
 * fire a normal INSERT on the table, but with an old timestamp). A future
 * `eventIso` (clock skew) is treated as recent, never rejected.
 */
export function isRecentEvent(eventIso: string, nowIso: string, maxAgeMs: number): boolean {
  const eventMs = Date.parse(eventIso);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(eventMs) || Number.isNaN(nowMs)) return false;
  return nowMs - eventMs <= maxAgeMs;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/inbox-alerts/engine/isRecentEvent.test.ts`
Expected: PASS (4 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/features/inbox-alerts/engine/isRecentEvent.ts src/features/inbox-alerts/engine/isRecentEvent.test.ts
git commit -m "feat(inbox-alerts): guard against stale (backfill) realtime events"
```

---

## Task 3: Engine — `isFreshInboundTimestamp`

**Files:**
- Create: `src/features/inbox-alerts/engine/isFreshInboundTimestamp.ts`
- Test: `src/features/inbox-alerts/engine/isFreshInboundTimestamp.test.ts`

**Interfaces:**
- Consumes: `isRecentEvent` (Task 2).
- Produces: `isFreshInboundTimestamp(candidateIso: string, lastAlertedIso: string | null, nowIso: string, maxAgeMs: number) → boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/inbox-alerts/engine/isFreshInboundTimestamp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isFreshInboundTimestamp } from "./isFreshInboundTimestamp";

describe("isFreshInboundTimestamp", () => {
  const now = "2026-07-01T12:00:00.000Z";
  const recent = "2026-07-01T11:59:50.000Z"; // 10s before now

  it("is fresh with no prior alert and a recent candidate", () => {
    expect(isFreshInboundTimestamp(recent, null, now, 60_000)).toBe(true);
  });

  it("is not fresh when older than the last alerted timestamp", () => {
    const lastAlerted = "2026-07-01T11:59:55.000Z";
    expect(isFreshInboundTimestamp(recent, lastAlerted, now, 60_000)).toBe(false);
  });

  it("is not fresh when equal to the last alerted timestamp", () => {
    expect(isFreshInboundTimestamp(recent, recent, now, 60_000)).toBe(false);
  });

  it("is fresh when newer than the last alerted timestamp", () => {
    const lastAlerted = "2026-07-01T11:59:40.000Z";
    expect(isFreshInboundTimestamp(recent, lastAlerted, now, 60_000)).toBe(true);
  });

  it("is not fresh when the candidate is too old, even if newer than the last alert", () => {
    const old = "2026-07-01T11:00:00.000Z"; // 1h before now
    expect(isFreshInboundTimestamp(old, null, now, 60_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/inbox-alerts/engine/isFreshInboundTimestamp.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar o mínimo**

Create `src/features/inbox-alerts/engine/isFreshInboundTimestamp.ts`:

```ts
import { isRecentEvent } from "./isRecentEvent";

/**
 * True when `candidateIso` is a recent (see `isRecentEvent`) inbound message
 * timestamp AND strictly newer than the last one already alerted for this
 * conversation. Backs the dedupe between the fast path (`messages` INSERT)
 * and the reliable fallback (`conversations` touch + `getLastInboundAt`) —
 * whichever detects a candidate first "wins" and the other sees it covered.
 */
export function isFreshInboundTimestamp(
  candidateIso: string,
  lastAlertedIso: string | null,
  nowIso: string,
  maxAgeMs: number,
): boolean {
  if (!isRecentEvent(candidateIso, nowIso, maxAgeMs)) return false;
  if (lastAlertedIso === null) return true;
  return Date.parse(candidateIso) > Date.parse(lastAlertedIso);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/inbox-alerts/engine/isFreshInboundTimestamp.test.ts`
Expected: PASS (5 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/features/inbox-alerts/engine/isFreshInboundTimestamp.ts src/features/inbox-alerts/engine/isFreshInboundTimestamp.test.ts
git commit -m "feat(inbox-alerts): dedupe fresh inbound messages across fast/fallback paths"
```

---

## Task 4: Engine — `shouldThrottle`

**Files:**
- Create: `src/features/inbox-alerts/engine/shouldThrottle.ts`
- Test: `src/features/inbox-alerts/engine/shouldThrottle.test.ts`

**Interfaces:**
- Produces: `shouldThrottle(lastBeepAtMs: number | null, nowMs: number, minIntervalMs: number) → boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/inbox-alerts/engine/shouldThrottle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldThrottle } from "./shouldThrottle";

describe("shouldThrottle", () => {
  it("never throttles the first beep", () => {
    expect(shouldThrottle(null, 1_000, 1_500)).toBe(false);
  });

  it("throttles within the minimum interval", () => {
    expect(shouldThrottle(1_000, 1_800, 1_500)).toBe(true);
  });

  it("releases once the interval has elapsed", () => {
    expect(shouldThrottle(1_000, 2_600, 1_500)).toBe(false);
  });

  it("releases exactly at the boundary", () => {
    expect(shouldThrottle(1_000, 2_500, 1_500)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/inbox-alerts/engine/shouldThrottle.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar o mínimo**

Create `src/features/inbox-alerts/engine/shouldThrottle.ts`:

```ts
/**
 * True when a beep of this kind fired less than `minIntervalMs` ago — caller
 * should skip playing it again. `lastBeepAtMs = null` (no beep yet this
 * session) is never throttled.
 */
export function shouldThrottle(
  lastBeepAtMs: number | null,
  nowMs: number,
  minIntervalMs: number,
): boolean {
  if (lastBeepAtMs === null) return false;
  return nowMs - lastBeepAtMs < minIntervalMs;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/inbox-alerts/engine/shouldThrottle.test.ts`
Expected: PASS (4 testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/features/inbox-alerts/engine/shouldThrottle.ts src/features/inbox-alerts/engine/shouldThrottle.test.ts
git commit -m "feat(inbox-alerts): throttle repeated beeps of the same kind"
```

---

## Task 5: `engine/constants.ts` + `lib/tonePlayer.ts`

**Files:**
- Create: `src/features/inbox-alerts/engine/constants.ts`
- Create: `src/features/inbox-alerts/lib/tonePlayer.ts`
- Test: `src/features/inbox-alerts/lib/tonePlayer.test.ts`

**Interfaces:**
- Produces: `MAX_EVENT_AGE_MS`, `MIN_BEEP_INTERVAL_MS`, `CONVERSATION_TOUCH_DEBOUNCE_MS`; `createTonePlayer() → ITonePlayer { unlock(): void; play(kind: "assigned-mine" | "new-in-queue", volume: number): void }`.

- [ ] **Step 1: Criar as constantes**

Create `src/features/inbox-alerts/engine/constants.ts`:

```ts
/** Ignore realtime events older than this — guards against import/backfill storms. */
export const MAX_EVENT_AGE_MS = 60_000;
/** Minimum gap between two beeps of the same kind. */
export const MIN_BEEP_INTERVAL_MS = 1_500;
/** Debounce window for the `conversations` touch fallback (mirrors useRealtimeMessages.ts). */
export const CONVERSATION_TOUCH_DEBOUNCE_MS = 250;
```

- [ ] **Step 2: Escrever o teste de smoke do tone player (falha)**

Create `src/features/inbox-alerts/lib/tonePlayer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTonePlayer } from "./tonePlayer";

// jsdom não expõe AudioContext → o player deve virar no-op sem lançar.
describe("createTonePlayer", () => {
  it("returns a no-op player when Web Audio is unavailable", () => {
    const player = createTonePlayer();
    expect(() => player.unlock()).not.toThrow();
    expect(() => player.play("assigned-mine", 0.5)).not.toThrow();
    expect(() => player.play("new-in-queue", 0.5)).not.toThrow();
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `bunx vitest run src/features/inbox-alerts/lib/tonePlayer.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 4: Implementar o motor de tom**

Create `src/features/inbox-alerts/lib/tonePlayer.ts`:

```ts
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
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `bunx vitest run src/features/inbox-alerts/lib/tonePlayer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/inbox-alerts/engine/constants.ts src/features/inbox-alerts/lib/tonePlayer.ts src/features/inbox-alerts/lib/tonePlayer.test.ts
git commit -m "feat(inbox-alerts): web audio tone player with two distinct patterns"
```

---

## Task 6: Stores Zustand — atividade + preferências de som

**Files:**
- Create: `src/features/inbox-alerts/store/inboxActivityStore.ts`
- Create: `src/features/inbox-alerts/store/soundAlertPreferencesStore.ts`
- Create: `src/features/inbox-alerts/hooks/useInboxActivity.ts`
- Modify: `src/features/inbox-alerts/index.ts`

**Interfaces:**
- Produces: `useInboxActivityStore` (Zustand hook, in-memory state `{ hasUnreadMine: boolean; hasQueueWaiting: boolean; setHasUnreadMine(v): void; setHasQueueWaiting(v): void }`); `useSoundAlertPreferencesStore` (Zustand hook + localStorage persist, `{ enabled: boolean; volume: number; setEnabled(v): void; setVolume(v): void }`); `useInboxActivity() → boolean`.

> Sem teste unitário para os stores/seletor — são glue de estado (mesmo padrão de `dismissalsStore.ts`/`useTourStore.ts`, sem `.test.ts` dedicado). A lógica testável já está no `engine/`.

- [ ] **Step 1: Criar o store de atividade (em memória, sem persist)**

Create `src/features/inbox-alerts/store/inboxActivityStore.ts`:

```ts
import { create } from "zustand";

interface IInboxActivityState {
  /** Há mensagem não lida numa conversa atribuída ao usuário logado. */
  hasUnreadMine: boolean;
  /** Há pelo menos um cliente esperando na fila (sem atendente). */
  hasQueueWaiting: boolean;
  setHasUnreadMine: (value: boolean) => void;
  setHasQueueWaiting: (value: boolean) => void;
}

/**
 * In-memory, app-wide signal of pending Inbox activity — written by
 * `useInboxActivityMonitor` (mounted once in AppLayout) and read by the
 * TopBar's unread badge icon. NOT persisted: rebuilt on every mount via the
 * monitor's seed queries, so a stale value never survives a reload.
 */
export const useInboxActivityStore = create<IInboxActivityState>((set) => ({
  hasUnreadMine: false,
  hasQueueWaiting: false,
  setHasUnreadMine: (value) => set({ hasUnreadMine: value }),
  setHasQueueWaiting: (value) => set({ hasQueueWaiting: value }),
}));
```

- [ ] **Step 2: Criar o store de preferências de som (persistido)**

Create `src/features/inbox-alerts/store/soundAlertPreferencesStore.ts`:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const STORAGE_KEY = "gallo-sound-alerts-preferences";
const DEFAULT_VOLUME = 0.5;

interface ISoundAlertPreferencesState {
  enabled: boolean;
  volume: number;
  setEnabled: (value: boolean) => void;
  setVolume: (value: number) => void;
}

/**
 * Personal (per-browser) sound-alert preference for the Inbox beeps. A
 * Zustand store — not a plain `localStorage` + `storage`-event hook — so
 * every consumer in the SAME tab (the TopBar toggle and the global monitor)
 * reads the exact same live value the instant it changes. A `storage` event
 * only fires for OTHER tabs, never same-tab siblings, which would leave the
 * monitor's copy stale after toggling the switch in the same tab.
 */
export const useSoundAlertPreferencesStore = create<ISoundAlertPreferencesState>()(
  persist(
    (set) => ({
      enabled: true,
      volume: DEFAULT_VOLUME,
      setEnabled: (value) => set({ enabled: value }),
      setVolume: (value) => set({ volume: Math.min(1, Math.max(0, value)) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
```

- [ ] **Step 3: Criar o seletor fino para a UI**

Create `src/features/inbox-alerts/hooks/useInboxActivity.ts`:

```ts
import { useInboxActivityStore } from "../store/inboxActivityStore";

/** True when there's pending Inbox activity (unread mine OR queue waiting). */
export function useInboxActivity(): boolean {
  return useInboxActivityStore((s) => s.hasUnreadMine || s.hasQueueWaiting);
}
```

- [ ] **Step 4: Adicionar ao barrel**

Em `src/features/inbox-alerts/index.ts`, adicione (mantendo a linha existente):

```ts
export { isQueuedConversation } from "./engine/isQueuedConversation";
export { useInboxActivityStore } from "./store/inboxActivityStore";
```

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/features/inbox-alerts/store/inboxActivityStore.ts src/features/inbox-alerts/store/soundAlertPreferencesStore.ts src/features/inbox-alerts/hooks/useInboxActivity.ts src/features/inbox-alerts/index.ts
git commit -m "feat(inbox-alerts): activity and sound-preference zustand stores"
```

---

## Task 7: `hooks/useInboxActivityMonitor.ts` — orquestrador

**Files:**
- Create: `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts`

**Interfaces:**
- Consumes: `isQueuedConversation` (Task 1), `isRecentEvent` (Task 2), `isFreshInboundTimestamp` (Task 3), `shouldThrottle` (Task 4), `MAX_EVENT_AGE_MS`/`MIN_BEEP_INTERVAL_MS`/`CONVERSATION_TOUCH_DEBOUNCE_MS` (Task 5), `createTonePlayer` (Task 5), `useInboxActivityStore` (Task 6), `useSoundAlertPreferencesStore` (Task 6); `useAuth` (`@/features/auth/useAuth`); `useCurrentStore` (`@/features/multistore`); `useConversationsProvider`/`useMessagesProvider`/`getActiveDataSource` (`@/providers/data`); `subscribeToTable` (`@/shared/lib/realtime`); `useAudioUnlock` (`@/features/session-timeout/hooks/useAudioUnlock`).
- Produces: `useInboxActivityMonitor(): void`.

> Validação manual (runtime, Realtime). Sem teste unitário aqui — a lógica determinística já está coberta nos engines das Tasks 1-4.

- [ ] **Step 1: Implementar o orquestrador**

Create `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts`:

```ts
import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useAudioUnlock } from "@/features/session-timeout/hooks/useAudioUnlock";
import { getActiveDataSource, useConversationsProvider, useMessagesProvider } from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";
import { isQueuedConversation } from "../engine/isQueuedConversation";
import { isRecentEvent } from "../engine/isRecentEvent";
import { isFreshInboundTimestamp } from "../engine/isFreshInboundTimestamp";
import { shouldThrottle } from "../engine/shouldThrottle";
import {
  MAX_EVENT_AGE_MS,
  MIN_BEEP_INTERVAL_MS,
  CONVERSATION_TOUCH_DEBOUNCE_MS,
} from "../engine/constants";
import { createTonePlayer } from "../lib/tonePlayer";
import { useInboxActivityStore } from "../store/inboxActivityStore";
import { useSoundAlertPreferencesStore } from "../store/soundAlertPreferencesStore";

const IS_SUPABASE = getActiveDataSource() === "supabase";

interface ICachedConversation {
  assignedSellerId: string | null;
  status: string;
  isSdrActive: boolean;
}

/** Raw `public.conversations` row as delivered by Realtime postgres_changes. */
interface IConversationRealtimeRow {
  id: string;
  store_id: string;
  assigned_seller_id: string | null;
  status: string;
  is_sdr_active: boolean;
  last_message_at: string;
  created_at: string;
}

/** Raw `public.messages` row — only the fields this monitor needs. */
interface IMessageRealtimeRow {
  conversation_id: string;
  direction: "in" | "out";
  sent_at: string;
}

/**
 * Global Inbox activity monitor — mounted ONCE (via InboxActivityGuard, in
 * AppLayout) for the whole authenticated session. Watches the shared
 * `conversations`/`messages` Realtime channels (PRD-105) app-wide and:
 *
 *  - Plays "new-in-queue" when a fresh unassigned conversation is created.
 *  - Plays "assigned-mine" when a fresh inbound message lands on a
 *    conversation assigned to the signed-in seller.
 *  - Keeps `inboxActivityStore` (hasQueueWaiting / hasUnreadMine) live for
 *    the TopBar badge icon.
 *
 * Reliability note: the `messages` Realtime channel alone can silently miss
 * INSERTs under RLS evaluation load (documented in
 * `conversations/hooks/useRealtimeMessages.ts`) — the `conversations` touch
 * (last_message_at UPDATE, always reliable) is used as a fallback via
 * `getLastInboundAt`, deduped against the same per-conversation "last
 * alerted" timestamp as the fast path so neither path double-beeps.
 */
export function useInboxActivityMonitor(): void {
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId ?? null;
  const { currentStoreId } = useCurrentStore();
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();

  const tonePlayerRef = useRef<ReturnType<typeof createTonePlayer> | null>(null);
  if (!tonePlayerRef.current) tonePlayerRef.current = createTonePlayer();

  useAudioUnlock(() => tonePlayerRef.current?.unlock(), true);

  const cacheRef = useRef(new Map<string, ICachedConversation>());
  const lastAlertedInboundRef = useRef(new Map<string, string>());
  const lastQueueBeepAtRef = useRef<number | null>(null);
  const lastMineBeepAtRef = useRef<number | null>(null);

  // Seed: initial state before any Realtime event lands (e.g. right after login).
  useEffect(() => {
    if (!IS_SUPABASE || !currentStoreId) return;
    let cancelled = false;

    void conversationsProvider
      .list({ storeId: currentStoreId, assignmentAny: { queue: true }, pageSize: 1 })
      .then((res) => {
        if (!cancelled) useInboxActivityStore.getState().setHasQueueWaiting(res.total > 0);
      })
      .catch(() => {
        /* best-effort seed — the live channel still catches up */
      });

    if (sellerId) {
      void conversationsProvider
        .list({ storeId: currentStoreId, assignedSellerId: sellerId, pageSize: 200 })
        .then((res) => {
          if (cancelled) return;
          for (const c of res.data) {
            cacheRef.current.set(c.id, {
              assignedSellerId: c.assignedSellerId ?? null,
              status: c.status,
              isSdrActive: c.isSdrActive,
            });
          }
          useInboxActivityStore.getState().setHasUnreadMine(res.data.some((c) => c.unreadCount > 0));
        })
        .catch(() => {
          /* best-effort seed — the live channel still catches up */
        });
    }

    return () => {
      cancelled = true;
    };
  }, [conversationsProvider, currentStoreId, sellerId]);

  // Live: Realtime subscriptions on the shared, ref-counted channels.
  useEffect(() => {
    if (!IS_SUPABASE || !currentStoreId) return;

    const cache = cacheRef.current;
    const lastAlertedInbound = lastAlertedInboundRef.current;
    let touchDebounceHandle: number | undefined;

    function recomputeQueueState() {
      let anyQueued = false;
      for (const entry of cache.values()) {
        if (isQueuedConversation(entry)) {
          anyQueued = true;
          break;
        }
      }
      useInboxActivityStore.getState().setHasQueueWaiting(anyQueued);
    }

    function maybeBeepMine(conversationId: string, candidateSentAt: string) {
      const nowIso = new Date().toISOString();
      const lastAlerted = lastAlertedInbound.get(conversationId) ?? null;
      if (!isFreshInboundTimestamp(candidateSentAt, lastAlerted, nowIso, MAX_EVENT_AGE_MS)) return;
      lastAlertedInbound.set(conversationId, candidateSentAt);
      useInboxActivityStore.getState().setHasUnreadMine(true);

      const nowMs = Date.now();
      if (shouldThrottle(lastMineBeepAtRef.current, nowMs, MIN_BEEP_INTERVAL_MS)) return;
      lastMineBeepAtRef.current = nowMs;
      const prefs = useSoundAlertPreferencesStore.getState();
      if (prefs.enabled) tonePlayerRef.current?.play("assigned-mine", prefs.volume);
    }

    const offConversations = subscribeToTable("conversations", (payload) => {
      const row = payload.new as Partial<IConversationRealtimeRow> | null;
      if (!row?.id || row.store_id !== currentStoreId) return;

      const entry: ICachedConversation = {
        assignedSellerId: row.assigned_seller_id ?? null,
        status: row.status ?? "aguardando",
        isSdrActive: row.is_sdr_active ?? false,
      };
      cache.set(row.id, entry);
      recomputeQueueState();

      // Fila: só dispara na criação (INSERT), nunca em devolução (UPDATE) — fora
      // de escopo por exigir REPLICA IDENTITY FULL para comparar o estado anterior.
      if (payload.eventType === "INSERT" && isQueuedConversation(entry)) {
        const nowIso = new Date().toISOString();
        const eventIso = row.last_message_at ?? row.created_at ?? nowIso;
        const nowMs = Date.now();
        if (
          isRecentEvent(eventIso, nowIso, MAX_EVENT_AGE_MS) &&
          !shouldThrottle(lastQueueBeepAtRef.current, nowMs, MIN_BEEP_INTERVAL_MS)
        ) {
          lastQueueBeepAtRef.current = nowMs;
          const prefs = useSoundAlertPreferencesStore.getState();
          if (prefs.enabled) tonePlayerRef.current?.play("new-in-queue", prefs.volume);
        }
      }

      // Fallback confiável (ver docstring do hook): todo touch de uma conversa
      // "minha" checa a última mensagem inbound via RPC — o canal `messages`
      // pode ter perdido o INSERT correspondente.
      if (sellerId && entry.assignedSellerId === sellerId) {
        if (touchDebounceHandle !== undefined) window.clearTimeout(touchDebounceHandle);
        const conversationId = row.id;
        touchDebounceHandle = window.setTimeout(() => {
          void messagesProvider
            .getLastInboundAt(conversationId)
            .then((iso) => {
              if (iso) maybeBeepMine(conversationId, iso);
            })
            .catch(() => {
              /* best-effort — a later touch retries */
            });
        }, CONVERSATION_TOUCH_DEBOUNCE_MS);
      }
    });

    const offMessages = subscribeToTable("messages", (payload) => {
      const row = payload.new as Partial<IMessageRealtimeRow> | null;
      if (!row?.conversation_id || row.direction !== "in" || !row.sent_at) return;
      const cached = cache.get(row.conversation_id);
      if (!sellerId || !cached || cached.assignedSellerId !== sellerId) return;
      maybeBeepMine(row.conversation_id, row.sent_at);
    });

    return () => {
      offConversations();
      offMessages();
      if (touchDebounceHandle !== undefined) window.clearTimeout(touchDebounceHandle);
    };
  }, [currentStoreId, sellerId, messagesProvider]);
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: build conclui sem erro.

Run: `bunx tsc --noEmit 2>&1 | grep "inbox-alerts"`
Expected: nenhuma linha (sem erro novo neste arquivo).

- [ ] **Step 3: Commit**

```bash
git add src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts
git commit -m "feat(inbox-alerts): orchestrate realtime detection, beeps and live state"
```

---

## Task 8: `InboxActivityGuard` + montagem no `AppLayout`

**Files:**
- Create: `src/features/inbox-alerts/components/InboxActivityGuard.tsx`
- Modify: `src/features/inbox-alerts/index.ts`
- Modify: `src/features/shell/layouts/AppLayout.tsx`

**Interfaces:**
- Consumes: `useInboxActivityMonitor` (Task 7).
- Produces: `<InboxActivityGuard/>`.

> Validação manual e2e (Realtime real só existe em modo `supabase`).

- [ ] **Step 1: Criar o guard**

Create `src/features/inbox-alerts/components/InboxActivityGuard.tsx`:

```tsx
import { useInboxActivityMonitor } from "../hooks/useInboxActivityMonitor";

/** Mounts the global Inbox activity monitor for the whole session. No UI of its own. */
export function InboxActivityGuard() {
  useInboxActivityMonitor();
  return null;
}
```

- [ ] **Step 2: Adicionar ao barrel**

Em `src/features/inbox-alerts/index.ts`, adicione:

```ts
export { InboxActivityGuard } from "./components/InboxActivityGuard";
```

- [ ] **Step 3: Montar no `AppLayout`**

Em `src/features/shell/layouts/AppLayout.tsx`, adicione o import junto aos demais imports de features (após `import { SessionTimeoutGuard } from "@/features/session-timeout";`):

```ts
import { InboxActivityGuard } from "@/features/inbox-alerts";
```

Dentro do `return`, logo após `<SessionTimeoutGuard />` (perto do fim, dentro do `<div className="flex h-screen …">`), adicione:

```tsx
        <InboxActivityGuard />
```

Resultado (trecho final):

```tsx
        <AuthSessionGuard />
        <SessionTimeoutGuard />
        <InboxActivityGuard />
        <UrgentBroadcastClaim />
        <WhatsNewModal />
      </div>
```

- [ ] **Step 4: Build + testes**

Run: `bun run build`
Expected: build OK.

Run: `bun run test`
Expected: suíte verde.

- [ ] **Step 5: Validação manual**

Em modo `supabase` (`bun run dev`), logado com um usuário que tem conversas atribuídas: (a) mande uma mensagem inbound de teste numa conversa sua (ex.: via simulação/webhook de teste) e confirme que toca o beep "assigned-mine"; (b) crie uma conversa nova sem atendente (ex.: número novo entrando) e confirme o beep "new-in-queue". Verifique que os dois tocam mesmo estando em outra tela do app (ex.: `/app/clientes`), não só na Inbox.

- [ ] **Step 6: Commit**

```bash
git add src/features/inbox-alerts/components/InboxActivityGuard.tsx src/features/inbox-alerts/index.ts src/features/shell/layouts/AppLayout.tsx
git commit -m "feat(inbox-alerts): mount the activity guard app-wide"
```

---

## Task 9: `SoundAlertToggle` — ícone de som no TopBar

**Files:**
- Create: `src/features/inbox-alerts/components/SoundAlertToggle.tsx`
- Modify: `src/features/inbox-alerts/index.ts`
- Modify: `src/features/shell/components/TopBar.tsx`

**Interfaces:**
- Consumes: `useSoundAlertPreferencesStore` (Task 6), `createTonePlayer` (Task 5).
- Produces: `<SoundAlertToggle/>`.

> Validação manual (áudio/UI).

- [ ] **Step 1: Criar o componente**

Create `src/features/inbox-alerts/components/SoundAlertToggle.tsx`:

```tsx
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Icon } from "@/components/Icon";
import { useSoundAlertPreferencesStore } from "../store/soundAlertPreferencesStore";
import { createTonePlayer, type ToneKind } from "../lib/tonePlayer";

/** TopBar control: liga/desliga os beeps da Inbox e ajusta o volume. */
export function SoundAlertToggle() {
  const [open, setOpen] = useState(false);
  const enabled = useSoundAlertPreferencesStore((s) => s.enabled);
  const volume = useSoundAlertPreferencesStore((s) => s.volume);
  const setEnabled = useSoundAlertPreferencesStore((s) => s.setEnabled);
  const setVolume = useSoundAlertPreferencesStore((s) => s.setVolume);

  const handleTest = (kind: ToneKind) => {
    const player = createTonePlayer();
    player.unlock();
    player.play(kind, volume);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={enabled ? "Sons da Inbox ligados" : "Sons da Inbox desligados"}
          title="Sons da Inbox"
        >
          <Icon icon={enabled ? "mdi:volume-high" : "mdi:volume-off"} size={20} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Sons da Inbox</p>
            <p className="text-xs text-muted-foreground">
              Beep ao chegar mensagem ou cliente novo na fila.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Ativar sons da Inbox" />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Volume</p>
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={(v) => setVolume(v[0] ?? volume)}
            disabled={!enabled}
            aria-label="Volume dos sons"
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={!enabled}
            onClick={() => handleTest("assigned-mine")}
          >
            <Icon icon="mdi:message-outline" size={14} />
            Testar som: mensagem
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            disabled={!enabled}
            onClick={() => handleTest("new-in-queue")}
          >
            <Icon icon="mdi:timer-sand" size={14} />
            Testar som: fila
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Adicionar ao barrel**

Em `src/features/inbox-alerts/index.ts`, adicione:

```ts
export { SoundAlertToggle } from "./components/SoundAlertToggle";
```

- [ ] **Step 3: Montar no `TopBar`**

Em `src/features/shell/components/TopBar.tsx`, adicione o import junto aos demais (após `import { WhatsAppStatusButton } from "@/features/shell/components/WhatsAppStatusButton";`):

```ts
import { SoundAlertToggle } from "@/features/inbox-alerts";
```

No JSX, logo após `<WhatsAppStatusButton />` (linha 71), adicione:

```tsx
        <SoundAlertToggle />
```

- [ ] **Step 4: Build + testes**

Run: `bun run build`
Expected: build OK.

Run: `bun run test`
Expected: suíte verde.

- [ ] **Step 5: Validação manual**

Abra o app, clique no novo ícone de alto-falante no TopBar. Confirme: popover abre, switch liga/desliga, slider de volume funciona, os dois botões "Testar som" tocam sons distintos. Recarregue a página e confirme que a preferência persiste (localStorage).

- [ ] **Step 6: Commit**

```bash
git add src/features/inbox-alerts/components/SoundAlertToggle.tsx src/features/inbox-alerts/index.ts src/features/shell/components/TopBar.tsx
git commit -m "feat(inbox-alerts): topbar sound toggle with volume and test buttons"
```

---

## Task 10: `InboxUnreadBadgeIcon` — ícone de não lidas no TopBar

**Files:**
- Create: `src/features/inbox-alerts/components/InboxUnreadBadgeIcon.tsx`
- Modify: `src/features/inbox-alerts/index.ts`
- Modify: `src/features/shell/components/TopBar.tsx`

**Interfaces:**
- Consumes: `useInboxActivity` (Task 6).
- Produces: `<InboxUnreadBadgeIcon/>`.

> Validação manual (UI).

- [ ] **Step 1: Criar o componente**

Create `src/features/inbox-alerts/components/InboxUnreadBadgeIcon.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useInboxActivity } from "../hooks/useInboxActivity";

/** TopBar icon: red dot when there's pending Inbox activity (mine or queue). Click navigates to the Inbox. */
export function InboxUnreadBadgeIcon() {
  const navigate = useNavigate();
  const hasActivity = useInboxActivity();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={hasActivity ? "Você tem mensagens novas na Inbox" : "Sem mensagens novas na Inbox"}
      title="Inbox"
      onClick={() => void navigate({ to: "/app/atendimento" })}
    >
      <Icon icon="mdi:inbox-arrow-down-outline" size={20} />
      {hasActivity && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive"
        />
      )}
    </Button>
  );
}
```

- [ ] **Step 2: Adicionar ao barrel**

Em `src/features/inbox-alerts/index.ts`, adicione:

```ts
export { InboxUnreadBadgeIcon } from "./components/InboxUnreadBadgeIcon";
```

- [ ] **Step 3: Montar no `TopBar`**

Em `src/features/shell/components/TopBar.tsx`, estenda o import já adicionado na Task 9:

```ts
import { InboxUnreadBadgeIcon, SoundAlertToggle } from "@/features/inbox-alerts";
```

No JSX, a Task 9 deixou `<WhatsAppStatusButton />` seguido direto de `<SoundAlertToggle />`. Insira `<InboxUnreadBadgeIcon />` **entre os dois** (ao lado do status do WhatsApp, conforme o desenho). Resultado (trecho final):

```tsx
        {/* WhatsApp connection indicator — online/offline status per store. */}
        <WhatsAppStatusButton />

        <InboxUnreadBadgeIcon />

        <SoundAlertToggle />
```

- [ ] **Step 4: Build + testes**

Run: `bun run build`
Expected: build OK.

Run: `bun run test`
Expected: suíte verde.

- [ ] **Step 5: Validação manual**

Confirme que o ícone novo aparece no TopBar sem ponto vermelho em estado limpo, e que clicar nele navega para `/app/atendimento`.

- [ ] **Step 6: Commit**

```bash
git add src/features/inbox-alerts/components/InboxUnreadBadgeIcon.tsx src/features/inbox-alerts/index.ts src/features/shell/components/TopBar.tsx
git commit -m "feat(inbox-alerts): topbar unread badge icon linking to the inbox"
```

---

## Task 11: Reconciliação em `InboxPage.tsx`

**Files:**
- Modify: `src/features/conversations/pages/InboxPage.tsx:319-322`

**Interfaces:**
- Consumes: `useInboxActivityStore` (Task 6).

> Validação manual (comportamento observável só com Realtime real, modo `supabase`).

- [ ] **Step 1: Importar o store**

Em `src/features/conversations/pages/InboxPage.tsx`, adicione o import junto aos demais (após `import { InboxStatusSummaryCard } from "@/features/service-volume";`):

```ts
import { useInboxActivityStore } from "@/features/inbox-alerts";
```

- [ ] **Step 2: Adicionar o efeito de reconciliação**

Logo após o bloco existente (linhas 319-322):

```tsx
  const unreadGlobal = useMemo(
    () => items.reduce((acc, c) => acc + (isUnread(c) ? c.unreadCount || 1 : 0), 0),
    [items, isUnread],
  );
```

adicione:

```tsx
  // Reconcile the TopBar's optimistic dot with ground truth every time the
  // Inbox recomputes its own (accurate) unread total — the global monitor
  // only ever turns the dot ON; visiting the Inbox is what turns it OFF.
  useEffect(() => {
    useInboxActivityStore.getState().setHasUnreadMine(unreadGlobal > 0);
  }, [unreadGlobal]);
```

- [ ] **Step 3: Build + testes**

Run: `bun run build`
Expected: build OK.

Run: `bun run test`
Expected: suíte verde.

- [ ] **Step 4: Validação manual**

Com o ponto vermelho aceso (mensagem não lida numa conversa sua), abra a Inbox e leia a conversa — confirme que o ponto no TopBar apaga. Feche a Inbox, deixe chegar uma nova mensagem numa conversa sua e confirme que o ponto acende de novo sem precisar reabrir a Inbox.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/pages/InboxPage.tsx
git commit -m "feat(inbox-alerts): reconcile the unread dot with the inbox's real count"
```

---

## Task 12: Documentação dev + changelog (fechamento)

**Files:**
- Create: `docs/dev/inbox-sound-notifications.md`
- Modify: `CHANGELOG.md`

> Executar ao final, após validação do dono. O bump de versão (MINOR + codinome) segue o fluxo da skill `versionamento`/`commit-push` da casa — confirme o codinome com o dono.

- [ ] **Step 1: Doc dev**

Create `docs/dev/inbox-sound-notifications.md` resumindo: objetivo (2 beeps + ícone de não lidas, app-wide), arquitetura (`engine/` puro, `lib/tonePlayer.ts`, dois stores Zustand, `useInboxActivityMonitor` montado no `AppLayout`), a nota de confiabilidade do canal `messages` (§3 do spec — fallback via `conversations` touch + `getLastInboundAt`), pontos de integração (`AppLayout`, `TopBar`, `ConversationListItem`, `InboxPage`), bordas conhecidas (áudio bloqueado sem gesto prévio, multi-aba sem supressão, `hasUnreadMine` é *best-effort*, "devolvida à fila" fora de escopo), e referencie `docs/superpowers/specs/2026-07-01-notificacoes-sonoras-inbox-design.md`.

- [ ] **Step 2: Changelog**

Em `CHANGELOG.md`, adicione uma entrada `Added` na próxima versão MINOR (Keep a Changelog):

```markdown
### Added
- Notificações sonoras da Inbox: beep discreto para mensagem nova em conversa
  própria e beep diferente para cliente novo na fila, funcionando em qualquer
  tela do app (Configurações via ícone de som no TopBar).
- Ícone de não lidas no TopBar: ponto vermelho enquanto houver mensagem não
  lida ou cliente esperando na fila; clique navega direto para a Inbox.
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/inbox-sound-notifications.md CHANGELOG.md
git commit -m "docs(inbox-alerts): dev guide and changelog entry"
```

---

## Notas de execução e riscos

1. **Ordem das tasks:** linear, 1 → 12 — cada task só depende de tasks anteriores já commitadas (sem necessidade de reordenar como no plano do `session-timeout`).
2. **Sem migration:** nenhuma mudança de schema nesta feature; funciona assim que deployado (modo `supabase`). Em modo mock (Demonstração), todo o feature é no-op silencioso (gate `IS_SUPABASE`) — nada quebra, só não há beep/badge.
3. **Confiabilidade do canal `messages`:** é um problema real e já documentado no projeto (`useRealtimeMessages.ts`), não uma hipótese — o fallback via `conversations` touch + `getLastInboundAt` (Task 7) não é opcional, é o que garante o beep "assigned-mine" funcionar de fato em produção sob carga.
4. **Áudio:** depende de um gesto prévio do usuário (autoplay policy). `useAudioUnlock` (reaproveitado do `session-timeout`) resolve na prática; se falhar, o ponto visual no TopBar continua funcionando independente do som.
5. **Multi-loja:** o filtro por `store_id === currentStoreId` (Task 7) evita beep/badge de conversas de uma loja que não é a ativa no momento; troca de loja não re-sincroniza o cache imediatamente — o próximo evento Realtime ou uma visita à Inbox corrige.
6. **Desvio pontual do spec (documentar, não é regressão):** o *seed* inicial de `hasUnreadMine` (Task 7) usa `conversation.unreadCount > 0` em vez da lógica completa de `isUnread`/`useUnreadTracking` mencionada no spec — evita um import cross-feature que o próprio barrel de `conversations/index.ts` desencoraja explicitamente ("not exported here on purpose"). Sem perda relevante: a Task 11 já reconcilia com o valor exato (`unreadGlobal`, que usa `isUnread` de verdade) assim que a Inbox é visitada.
7. **Outro desvio pontual do spec:** a preferência de som (§5.3 do spec) virou um **store Zustand persistido** (Task 6), não um hook cru de `localStorage` + evento `storage`. Motivo descoberto durante o planejamento: um evento `storage` só notifica OUTRAS abas, nunca instâncias do hook na MESMA aba — ligar/desligar no `SoundAlertToggle` não chegaria ao `useInboxActivityMonitor` na mesma aba até um reload. O Zustand resolve isso porque todo consumidor lê o mesmo estado em memória.
8. **Type-check:** avalie `bunx tsc --noEmit` **por delta** — o baseline pré-existente não deve crescer por causa desta feature.
