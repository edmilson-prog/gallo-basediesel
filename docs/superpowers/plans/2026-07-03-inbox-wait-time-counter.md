# Contador de tempo de espera na fila — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir um contador discreto de tempo de espera no canto superior direito de cada card "Em fila" do Atendimento, com semáforo de cor.

**Architecture:** Uma coluna `queued_at` em `conversations`, mantida por um trigger no banco, é a fonte da verdade. O frontend só lê o valor; um engine puro formata o texto e escolhe a severidade; o card renderiza o contador quando a conversa está em fila, atualizando a cada minuto pelo `useTimeTick` já existente.

**Tech Stack:** React 19 + TypeScript, Vitest (engine TDD), Tailwind v4 (tokens semânticos de severidade), Supabase (Postgres trigger + migration versionada).

**Spec:** `docs/superpowers/specs/2026-07-03-inbox-wait-time-counter-design.md`

## Global Constraints

- **Idioma:** código/comentários em inglês; conteúdo de UI em português do Brasil com acentos corretos.
- **TypeScript `strict`**; evitar `any`; interfaces de domínio prefixadas com `I`.
- **Gate de CI:** `bun run build` + `bun run test` (o `build` NÃO faz type-check; use `bunx tsc --noEmit` para checar tipos por delta).
- **Limites do semáforo (fixos):** âmbar a partir de **10 min**, vermelho a partir de **30 min**.
- **Escopo do contador:** somente cards "Em fila" (`isQueuedConversation`).
- **Não tocar:** webhook do WhatsApp, Edge Functions, cache do atendimento (signing em lote, Realtime, query keys, RPCs gated-once), RPCs de listagem/contagem, ordenação.
- **Migration:** versionada em `supabase/migrations/`; aplicação em produção é passo de rollout **gated no OK do dono** (não faz parte da execução de código).
- **Provider Pattern:** features leem dados só via `@/providers/data`; a coluna nova é derivada pelo trigger e nunca escrita pelo app.

---

### Task 1: Engine puro `waitTime.ts` (formatação + severidade)

**Files:**
- Create: `src/features/conversations/engine/waitTime.ts`
- Test: `src/features/conversations/engine/waitTime.test.ts`

**Interfaces:**
- Consumes: nada (funções puras sobre `number` de milissegundos).
- Produces:
  - `WAIT_WARNING_MS: number` (600_000), `WAIT_CRITICAL_MS: number` (1_800_000)
  - `type WaitSeverity = "neutral" | "warning" | "critical"`
  - `waitSeverity(ms: number): WaitSeverity`
  - `formatWaitTime(ms: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/waitTime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  formatWaitTime,
  waitSeverity,
  WAIT_WARNING_MS,
  WAIT_CRITICAL_MS,
} from "./waitTime";

const MIN = 60_000;

describe("formatWaitTime", () => {
  it("shows <1 min under a minute", () => {
    expect(formatWaitTime(0)).toBe("<1 min");
    expect(formatWaitTime(59_000)).toBe("<1 min");
  });

  it("shows whole minutes under an hour", () => {
    expect(formatWaitTime(1 * MIN)).toBe("1 min");
    expect(formatWaitTime(45 * MIN)).toBe("45 min");
    expect(formatWaitTime(59 * MIN)).toBe("59 min");
  });

  it("shows hours with zero-padded minutes under a day", () => {
    expect(formatWaitTime(60 * MIN)).toBe("1h 00");
    expect(formatWaitTime((2 * 60 + 5) * MIN)).toBe("2h 05");
    expect(formatWaitTime((23 * 60 + 59) * MIN)).toBe("23h 59");
  });

  it("shows whole days at or beyond 24h", () => {
    expect(formatWaitTime(24 * 60 * MIN)).toBe("1 d");
    expect(formatWaitTime(50 * 60 * MIN)).toBe("2 d");
  });
});

describe("waitSeverity", () => {
  it("is neutral below the warning threshold", () => {
    expect(waitSeverity(0)).toBe("neutral");
    expect(waitSeverity(WAIT_WARNING_MS - 1)).toBe("neutral");
  });

  it("is warning between the two thresholds (inclusive of warning)", () => {
    expect(waitSeverity(WAIT_WARNING_MS)).toBe("warning");
    expect(waitSeverity(WAIT_CRITICAL_MS - 1)).toBe("warning");
  });

  it("is critical at or above the critical threshold", () => {
    expect(waitSeverity(WAIT_CRITICAL_MS)).toBe("critical");
    expect(waitSeverity(10 * WAIT_CRITICAL_MS)).toBe("critical");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- waitTime`
Expected: FAIL — `Failed to resolve import "./waitTime"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/conversations/engine/waitTime.ts`:

```ts
/**
 * Pure helpers for the Inbox "wait time" counter. They receive an already
 * computed elapsed duration in milliseconds (the caller subtracts `queuedAt`
 * from the shared `useTimeTick` clock) so they stay clock-free and testable.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Wait duration at/after which the counter turns amber (attention). */
export const WAIT_WARNING_MS = 10 * MINUTE;
/** Wait duration at/after which the counter turns red (urgent). */
export const WAIT_CRITICAL_MS = 30 * MINUTE;

export type WaitSeverity = "neutral" | "warning" | "critical";

/** Traffic-light severity for a wait duration. Thresholds are inclusive. */
export function waitSeverity(ms: number): WaitSeverity {
  if (ms >= WAIT_CRITICAL_MS) return "critical";
  if (ms >= WAIT_WARNING_MS) return "warning";
  return "neutral";
}

/**
 * Compact wait label: `<1 min` under a minute, `N min` under an hour,
 * `Hh MM` (zero-padded minutes) under a day, `N d` beyond a day.
 */
export function formatWaitTime(ms: number): string {
  if (ms < MINUTE) return "<1 min";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MINUTE);
    return `${h}h ${String(m).padStart(2, "0")}`;
  }
  return `${Math.floor(ms / DAY)} d`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- waitTime`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/waitTime.ts src/features/conversations/engine/waitTime.test.ts
git commit -m "feat(conversations): pure engine for inbox wait-time formatting and severity"
```

---

### Task 2: Modelo de domínio + providers + mock (o "cano" do `queuedAt`)

**Files:**
- Modify: `src/shared/types/conversation.ts` (interface `IConversation`, após `createdAt` na linha ~47)
- Modify: `src/providers/data/impl/supabase/conversations.ts` (`ConversationRow` ~L62-77, `COLUMNS` ~L95-96, `rowToConversation` ~L98-115)
- Modify: `src/mocks/generators/conversation.ts` (objeto retornado ~L59-73)

**Interfaces:**
- Consumes: nada.
- Produces: `IConversation.queuedAt?: ISO8601` — lido pela Task 3.

Este task é encanamento de campo puro (tipo + mapeamento + geração mock). Não há teste unitário novo — não existem testes co-localizados para os generators e um teste do generator exigiria montar `ISeededContext` + entidade válida sem valor proporcional. Verificação: `bunx tsc --noEmit` (delta) + `bun run test` (suíte existente segue verde) + `bun run build`.

- [ ] **Step 1: Adicionar o campo em `IConversation`**

Em `src/shared/types/conversation.ts`, logo após `createdAt: ISO8601;` (linha ~47), inserir:

```ts
  /**
   * Instant the conversation entered (or re-entered) the manual-distribution
   * queue. Set/cleared by a DB trigger (migration 20260703140000) mirroring
   * `isQueuedConversation`; absent/null when the conversation is not queued.
   * Drives the Inbox wait-time counter.
   */
  queuedAt?: ISO8601;
```

- [ ] **Step 2: Mapear no provider Supabase — `ConversationRow`**

Em `src/providers/data/impl/supabase/conversations.ts`, na interface `ConversationRow`, após `created_at: string;` (linha ~76), inserir:

```ts
  queued_at: string | null;
```

- [ ] **Step 3: Incluir a coluna no SELECT**

Na constante `COLUMNS` (linha ~95-96), acrescentar `queued_at` ao final da string:

```ts
const COLUMNS =
  "id, store_id, customer_id, lead_id, assigned_seller_id, channel, whatsapp_account_id, status, is_sdr_active, tags, linked_order_id, last_message_at, unread_count, created_at, queued_at";
```

- [ ] **Step 4: Ler a coluna em `rowToConversation`**

Na função `rowToConversation`, após `createdAt: row.created_at,` (linha ~113), inserir:

```ts
    queuedAt: row.queued_at ?? undefined,
```

- [ ] **Step 5: Preencher no mock generator**

Em `src/mocks/generators/conversation.ts`, imediatamente antes do `return {` (linha ~59), inserir o cálculo (o mock não tem trigger; usa `lastMessageAt` como aproximação do instante de entrada na fila):

```ts
  // The mock has no DB trigger, so mirror `isQueuedConversation` here and
  // approximate the queue-entry instant with lastMessageAt for demo mode.
  const queuedAt =
    status === "aguardando" && !isSdrActive && assignedSellerId === undefined
      ? lastMessageAt
      : undefined;
```

E dentro do objeto retornado, após `createdAt,` (linha ~72), acrescentar:

```ts
    queuedAt,
```

- [ ] **Step 6: Verificar tipos e suíte**

Run: `bunx tsc --noEmit` — não deve introduzir erros novos nos 3 arquivos tocados (baseline pré-existente é aceitável; cheque o delta).
Run: `bun run test`
Expected: suíte existente PASS (nenhuma regressão).

- [ ] **Step 7: Build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/conversation.ts src/providers/data/impl/supabase/conversations.ts src/mocks/generators/conversation.ts
git commit -m "feat(conversations): plumb queuedAt through domain type, supabase provider and mock"
```

---

### Task 3: Contador no card `ConversationListItem`

**Files:**
- Modify: `src/features/conversations/components/ConversationListItem.tsx` (imports ~L18-19; corpo do componente ~L134-136 e o bloco da data ~L221-232)

**Interfaces:**
- Consumes: `formatWaitTime`, `waitSeverity`, `WaitSeverity` (Task 1); `IConversation.queuedAt` (Task 2); `isQueuedConversation` (já importado na L12); `now: Date` de `useTimeTick` (já na L115).
- Produces: nada (folha de UI).

Sem teste unitário de render (o projeto não configura testing-library para componentes; UI é validada no build + inspeção manual do dono — ver `docs/superpowers/specs/...`). Verificação: `bun run build` + checagem visual.

- [ ] **Step 1: Importar o engine**

Em `src/features/conversations/components/ConversationListItem.tsx`, junto aos imports de utils da feature (após a linha 19 `import { formatRelativeTime, isFresh } from "../utils/formatRelativeTime";`), adicionar:

```ts
import { formatWaitTime, waitSeverity, type WaitSeverity } from "../engine/waitTime";
```

- [ ] **Step 2: Mapa severidade → classe de tom**

No topo do módulo, junto às constantes existentes (ex.: após `const HIGHLIGHT_CLASS = ...` na linha ~60), adicionar:

```tsx
/** Traffic-light color for the queue wait counter, using severity tokens. */
const WAIT_TONE: Record<WaitSeverity, string> = {
  neutral: "text-muted-foreground",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};
```

- [ ] **Step 3: Calcular o tempo de espera no corpo do componente**

Logo após `const fresh = isFresh(conversation.lastMessageAt, now);` (linha ~136), adicionar:

```tsx
  // Wait counter — only while the conversation sits in the manual queue.
  // Falls back to lastMessageAt for rows created before the queued_at backfill.
  const isQueued = isQueuedConversation(conversation);
  const waitBase = conversation.queuedAt ?? conversation.lastMessageAt;
  const waitMs = isQueued ? now.getTime() - Date.parse(waitBase) : 0;
  const waitTone = WAIT_TONE[waitSeverity(waitMs)];
```

- [ ] **Step 4: Empilhar data + contador no canto superior direito**

Substituir o `<span>` da data (linhas ~231):

```tsx
          <span className="shrink-0 text-xs text-muted-foreground">{relative}</span>
```

por uma coluna que empilha a data e o contador:

```tsx
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-xs text-muted-foreground">{relative}</span>
            {isQueued && waitMs >= 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums",
                  waitTone,
                )}
                aria-label={`Aguardando há ${formatWaitTime(waitMs)}`}
              >
                <Icon icon="mdi:timer-outline" size={11} />
                {formatWaitTime(waitMs)}
              </span>
            )}
          </div>
```

(O `Icon` já está importado na linha 13; `cn` na linha 15.)

- [ ] **Step 5: Type-check e build**

Run: `bunx tsc --noEmit` — sem erros novos no arquivo.
Run: `bun run build`
Expected: build OK.

- [ ] **Step 6: Verificação visual (manual, pelo dono)**

No modo Demonstração (`bun run dev`), abrir o Atendimento e confirmar:
- cards "Em fila" mostram `⏱ N min` abaixo da data;
- a cor acompanha o semáforo (cinza < 10 min, âmbar 10–30, vermelho > 30);
- cards atribuídos/respondidos **não** mostram o contador.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/components/ConversationListItem.tsx
git commit -m "feat(conversations): show queue wait-time counter on inbox cards"
```

---

### Task 4: Migration versionada (coluna + backfill + trigger)

**Files:**
- Create: `supabase/migrations/20260703140000_conversation_queued_at.sql`

**Interfaces:**
- Consumes/Produces: cria a coluna `public.conversations.queued_at` lida pela Task 2.

A **aplicação em produção** (via MCP `apply_migration`) é passo de rollout gated no OK do dono — ver seção Rollout. Este task apenas versiona o arquivo no Git.

- [ ] **Step 1: Criar o arquivo de migration**

Create `supabase/migrations/20260703140000_conversation_queued_at.sql`:

```sql
-- Inbox wait-time counter: track when a conversation entered the manual queue.
-- The frontend only reads queued_at; a trigger keeps it in sync, mirroring the
-- app's isQueuedConversation rule. Order matters: backfill BEFORE the trigger
-- exists so the one-time UPDATE is not intercepted and reverted.

-- 1. Column
alter table public.conversations
  add column if not exists queued_at timestamptz;

-- 2. One-time backfill for conversations currently in the queue.
update public.conversations
set queued_at = coalesce(last_message_at, created_at)
where status = 'aguardando'
  and assigned_seller_id is null
  and coalesce(is_sdr_active, false) = false
  and queued_at is null;

-- 3. Trigger function: set on queue entry, clear on exit, keep while queued.
create or replace function public.set_conversation_queued_at()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_q boolean := (new.status = 'aguardando'
                    and new.assigned_seller_id is null
                    and coalesce(new.is_sdr_active, false) = false);
  old_q boolean;
begin
  if tg_op = 'INSERT' then
    new.queued_at := case when new_q then now() else null end;
    return new;
  end if;

  old_q := (old.status = 'aguardando'
            and old.assigned_seller_id is null
            and coalesce(old.is_sdr_active, false) = false);

  if new_q and not old_q then
    new.queued_at := now();      -- entered (or re-entered) the queue
  elsif not new_q then
    new.queued_at := null;       -- left the queue
  end if;
  -- stayed queued (e.g. another inbound message) -> keep new.queued_at (== old)

  return new;
end;
$$;

-- 4. Trigger
drop trigger if exists trg_set_conversation_queued_at on public.conversations;
create trigger trg_set_conversation_queued_at
before insert or update on public.conversations
for each row execute function public.set_conversation_queued_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260703140000_conversation_queued_at.sql
git commit -m "feat(db): add conversations.queued_at column + trigger for inbox wait time"
```

---

## Rollout (pós-implementação, com OK do dono)

1. Abrir PR da branch `feat/inbox-wait-time-counter` para revisão. **Sem merge sem OK.**
2. `bun run build` + `bun run test` verdes no PR.
3. Após aprovação, **aplicar a migration em produção** via MCP `apply_migration`
   (`version = 20260703140000`, name `conversation_queued_at`) — idempotente
   (`add column if not exists`, `create or replace`, `drop trigger if exists`).
   Confere: coluna presente, backfill populou a fila atual, trigger ativo.
4. Deploy do frontend (Vercel, automático no merge).
5. Smoke: contador visível nos cards em fila; some ao assumir/responder; reabertura
   reinicia o contador; rajada de mensagens do cliente **não** reinicia.

---

## Self-Review

**Spec coverage:**
- §2 fonte `queued_at` via trigger → Task 4. ✔
- §2 posição canto superior direito → Task 3 Step 4. ✔
- §2 semáforo + limites 10/30 fixos → Task 1 (`waitSeverity`) + Task 3 (`WAIT_TONE`). ✔
- §2 formato do texto → Task 1 (`formatWaitTime`). ✔
- §2 escopo só "Em fila" → Task 3 Step 3 (`isQueued`). ✔
- §2 atualização 60s → Task 3 reusa `useTimeTick` já no card. ✔
- §3 ordem coluna→backfill→função→trigger → Task 4 Step 1. ✔
- §4 tipo + provider + mock → Task 2. ✔
- §5 engine puro TDD → Task 1. ✔
- §6 tokens de severidade + fallback lastMessageAt + aria-label → Task 3. ✔
- §7 não mexer em ordenação/webhook/cache → respeitado (nenhum task os toca). ✔

**Placeholder scan:** nenhum TBD/TODO; todo passo de código traz o código completo. ✔

**Type consistency:** `WaitSeverity`, `waitSeverity`, `formatWaitTime`, `WAIT_WARNING_MS`, `WAIT_CRITICAL_MS`, `WAIT_TONE`, `queuedAt`/`queued_at` usados de forma consistente entre Task 1→2→3. ✔
