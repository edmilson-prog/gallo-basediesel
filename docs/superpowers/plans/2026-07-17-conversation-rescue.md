# Resgate de conversa com responsável ausente (Sub-projeto B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o cliente manda mensagem numa conversa atribuída a um atendente ausente, o sistema transmite a oferta para quem tem acesso àquele número e está online (primeiro a clicar assume), e força uma atribuição automática se ninguém aceitar dentro do prazo.

**Architecture:** Uma Edge Function (`conversation-rescue-tick`) agendada via `pg_cron` a cada 1 minuto detecta ausência (agenda de trabalho PRD-212 + `sellers.availability`), cria um registro de transmissão (`conversation_rescues`) e aplica o fallback forçado por timeout. O client lê/reclama via uma tabela com RLS gated por `can_access_conversation` e uma RPC `SECURITY DEFINER` de concorrência otimista, num painel flutuante que espelha o `UrgentBroadcastClaim` do SDR urgente (polling simples, sem Realtime).

**Tech Stack:** Supabase (Postgres, RLS, `pg_cron`+`pg_net`, Vault, Edge Functions/Deno), React + TanStack Query, Vitest.

## Global Constraints

- Reaproveita `conversations.awaiting_reply_since` do sub-projeto A — nunca duplicar essa coluna/trigger.
- Detecção de ausência: fora da agenda de trabalho (PRD-212, `isWithinWorkSchedule`) = ausência "schedule", dispara imediatamente; dentro da agenda com `sellers.availability !== 'online'` = ausência "temporary", dispara só quando `now - awaiting_reply_since >= temporaryAbsenceGraceMinutes`.
- Modelo de oferta: **transmissão simultânea, primeiro a clicar assume** (claim first-wins) — nunca sequencial com recusa explícita.
- Elegibilidade: só sellers com acesso ao `whatsapp_account_id` daquela conversa (via `whatsapp_account_access_rules`, com bypass para `owner`/`manager`), online, dentro da própria agenda, excluindo o ausente.
- Fallback forçado: depois de `forceAssignTimeoutMinutes` sem clique, sorteia entre `fallbackSellerIds` (config da loja) que estiverem online; se nenhum, sorteia entre todo o pool elegível online; se ninguém online em lugar nenhum, a linha permanece `broadcasting` (sem notificação extra — o sub-projeto A já cobre esse caso extremo via idle-alerts).
- Sorteio determinístico (hash do seed), **nunca `Math.random()`** — testável com seeds fixos.
- Só `conversations.assigned_seller_id` muda — a carteira (`customers.seller_id`) nunca é tocada por este sub-projeto.
- Settings por loja em `stores.settings->'conversationRescue'`, **`enabled: false` por padrão** em todas as lojas.
- Não altera o `whatsapp-webhook` real.
- Suíte de testes: `bun run test` (Vitest) + `bun run build`; toda migration precisa ser aplicada via MCP com OK do dono e espelhada em `supabase/migrations/` no mesmo PR.
- Fora de `src/mocks/**` e `src/providers/data/**`, o acesso a dados passa **só** pelo barrel `@/providers/data` (ESLint `no-restricted-imports`).

---

### Task 1: Tipos de domínio e defaults de configuração

**Files:**
- Modify: `src/shared/types/conversation.ts` (adicionar ao final do arquivo, depois de `IIdleSummary`)
- Modify: `src/shared/types/platform.ts` (adicionar `IConversationRescueSettings` perto de `IIdleAlertsSettings`, e o campo em `IPlatformSettings`)
- Modify: `src/shared/types/index.ts` (exportar os novos tipos)
- Create: `src/features/conversation-rescue/config/defaults.ts`
- Create: `src/features/conversation-rescue/index.ts` (barrel, começa só com o que existe até aqui)

**Interfaces:**
- Produces: `IConversationRescue`, `AbsenceKind`, `ConversationRescueStatus`, `IConversationRescueBroadcastEntry`, `IConversationRescueSettings`, `DEFAULT_CONVERSATION_RESCUE_SETTINGS`.

- [ ] **Step 1: Adicionar os tipos de domínio em `conversation.ts`**

Ao final do arquivo `src/shared/types/conversation.ts` (depois de `export interface IIdleSummary { ... }`), adicionar:

```ts
/** Absence classification driving the rescue broadcast (spec 2026-07-17). */
export type AbsenceKind = "schedule" | "temporary";

/** Lifecycle of a rescue broadcast row. */
export type ConversationRescueStatus = "broadcasting" | "claimed" | "forced" | "cancelled";

/** Rescue-broadcast record — one row per absence event needing coverage. */
export interface IConversationRescue {
  id: ID;
  conversationId: ID;
  storeId: ID;
  whatsappAccountId: ID | null;
  absentSellerId: ID;
  absenceKind: AbsenceKind;
  contactName: string;
  lastInboundPreview: string | null;
  status: ConversationRescueStatus;
  broadcastAt: ISO8601;
  claimedBySellerId?: ID;
  claimedAt?: ISO8601;
  forcedSellerId?: ID;
  forcedAt?: ISO8601;
  cancelledReason?: string;
  createdAt: ISO8601;
}
```

- [ ] **Step 2: Adicionar `IConversationRescueSettings` em `platform.ts`**

Em `src/shared/types/platform.ts`, logo depois do bloco `export interface IIdleAlertsSettings { ... }` (linhas 168-177), adicionar:

```ts
/**
 * Offline-rescue thresholds (spec 2026-07-17). Broadcasts a stalled,
 * assigned conversation to every eligible online seller when its assignee
 * is absent; forces a random fallback assignment if nobody claims it in
 * time. Stored at `stores.settings->'conversationRescue'`.
 */
export interface IConversationRescueSettings {
  enabled: boolean;
  /** Minutes the client must have waited (past `awaiting_reply_since`) before a
   * within-schedule-but-away seller counts as "temporarily absent". */
  temporaryAbsenceGraceMinutes: number;
  /** Minutes after the broadcast starts before a forced fallback assignment kicks in. */
  forceAssignTimeoutMinutes: number;
  /** Reserve sellers considered first for the forced fallback assignment. */
  fallbackSellerIds: ID[];
}
```

Depois, no bloco `IPlatformSettings` (logo após o campo `idleAlerts?`), adicionar:

```ts
  /** Offline-rescue broadcast (spec 2026-07-17). Undefined → DEFAULT_CONVERSATION_RESCUE_SETTINGS. */
  conversationRescue?: IConversationRescueSettings;
```

- [ ] **Step 3: Exportar os novos tipos no barrel `index.ts`**

Em `src/shared/types/index.ts`, no bloco `// Conversation, messaging, WhatsApp` (linhas 139-171), adicionar aos nomes exportados de `"./conversation"`:

```ts
  IConversationRescue,
  AbsenceKind,
  ConversationRescueStatus,
```

(inserir logo após `IIdleSummary,` na lista, antes do `} from "./conversation";`).

E localizar o bloco que exporta `IIdleAlertsSettings` a partir de `"./platform"` (mesmo arquivo `index.ts` — buscar por `IIdleAlertsSettings`) e adicionar `IConversationRescueSettings,` na mesma lista.

- [ ] **Step 4: Criar os defaults**

Criar `src/features/conversation-rescue/config/defaults.ts`:

```ts
import type { IConversationRescueSettings } from "@/shared/types";

/** Off by default in every store — mirrors DEFAULT_IDLE_ALERTS_SETTINGS discipline. */
export const DEFAULT_CONVERSATION_RESCUE_SETTINGS: IConversationRescueSettings = {
  enabled: false,
  temporaryAbsenceGraceMinutes: 15,
  forceAssignTimeoutMinutes: 5,
  fallbackSellerIds: [],
};
```

- [ ] **Step 5: Criar o barrel inicial da feature**

Criar `src/features/conversation-rescue/index.ts`:

```ts
export { DEFAULT_CONVERSATION_RESCUE_SETTINGS } from "./config/defaults";
```

- [ ] **Step 6: Rodar o type-check e a suíte**

Run: `bunx tsc --noEmit 2>&1 | grep -i "conversation-rescue\|conversationRescue\|IConversationRescue" || echo "no new errors"`
Expected: `no new errors` (ou nenhum erro referenciando os arquivos/tipos novos).

Run: `bun run test`
Expected: suíte inteira continua verde (nenhum teste novo ainda, apenas tipos).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/conversation.ts src/shared/types/platform.ts src/shared/types/index.ts src/features/conversation-rescue/config/defaults.ts src/features/conversation-rescue/index.ts
git commit -m "feat(conversation-rescue): domain types and default settings"
```

---

### Task 2: Engine — `determineAbsence` (TDD)

**Files:**
- Create: `src/features/conversation-rescue/engine/determineAbsence.ts`
- Test: `src/features/conversation-rescue/engine/determineAbsence.test.ts`

**Interfaces:**
- Consumes: `AbsenceKind` (Task 1), `SellerAvailability` (`@/shared/types`, já existente: `"online" | "ausente" | "ocupado" | "offline"`).
- Produces: `determineAbsence(input: IDetermineAbsenceInput): AbsenceKind | null` — **puro**, recebe `isWithinSchedule` já calculado (injeção de dependência — quem chama decide como calcular a agenda; o client usa `isWithinWorkSchedule` de `@/features/access/engine/workSchedule`, a Edge Function usa a cópia espelhada em `_shared/access/workSchedule.ts`). Isso mantém este arquivo livre de imports cross-feature, então o script de sync (Task 6) pode espelhá-lo sem quebrar.

- [ ] **Step 1: Escrever os testes**

Criar `src/features/conversation-rescue/engine/determineAbsence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { determineAbsence } from "./determineAbsence";

const NOW = new Date("2026-07-17T15:00:00-03:00");

describe("determineAbsence", () => {
  it("returns null when the seller is online and within schedule", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "online",
      awaitingReplySince: "2026-07-17T14:50:00-03:00",
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBeNull();
  });

  it("returns 'schedule' immediately when outside the work schedule, regardless of availability", () => {
    const result = determineAbsence({
      isWithinSchedule: false,
      availability: "online",
      awaitingReplySince: "2026-07-17T14:59:30-03:00",
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBe("schedule");
  });

  it("returns null when within schedule, away, but the grace period has not elapsed", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "ausente",
      awaitingReplySince: "2026-07-17T14:50:00-03:00", // 10 min ago
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBeNull();
  });

  it("returns 'temporary' when within schedule, away, and the grace period elapsed", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "ausente",
      awaitingReplySince: "2026-07-17T14:44:00-03:00", // 16 min ago
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBe("temporary");
  });

  it("treats 'ocupado' and 'offline' the same as 'ausente' for the temporary case", () => {
    const base = {
      isWithinSchedule: true,
      awaitingReplySince: "2026-07-17T14:44:00-03:00",
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    };
    expect(determineAbsence({ ...base, availability: "ocupado" })).toBe("temporary");
    expect(determineAbsence({ ...base, availability: "offline" })).toBe("temporary");
  });

  it("is exact at the boundary — elapsed === grace minutes counts as elapsed", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "ausente",
      awaitingReplySince: "2026-07-17T14:45:00-03:00", // exactly 15 min ago
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBe("temporary");
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test src/features/conversation-rescue/engine/determineAbsence.test.ts`
Expected: FAIL — `Cannot find module './determineAbsence'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar**

Criar `src/features/conversation-rescue/engine/determineAbsence.ts`:

```ts
import type { AbsenceKind, SellerAvailability } from "@/shared/types";

export interface IDetermineAbsenceInput {
  /** Whether the assigned seller is within their own work schedule right now. */
  isWithinSchedule: boolean;
  availability: SellerAvailability;
  /** ISO8601 — `conversations.awaiting_reply_since`. */
  awaitingReplySince: string;
  now: Date;
  temporaryAbsenceGraceMinutes: number;
}

/**
 * Pure absence classification (spec 2026-07-17). Out-of-schedule always wins
 * immediately ("day-to-day" absence — no grace period, they aren't coming
 * back today). Within schedule but not `online` only counts once the client
 * has waited at least `temporaryAbsenceGraceMinutes` — reuses the same clock
 * as `awaiting_reply_since` (sub-project A) instead of a new "since when
 * away" timestamp.
 */
export function determineAbsence(input: IDetermineAbsenceInput): AbsenceKind | null {
  if (!input.isWithinSchedule) return "schedule";
  if (input.availability === "online") return null;

  const elapsedMs = input.now.getTime() - new Date(input.awaitingReplySince).getTime();
  const graceMs = input.temporaryAbsenceGraceMinutes * 60_000;
  return elapsedMs >= graceMs ? "temporary" : null;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test src/features/conversation-rescue/engine/determineAbsence.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Exportar no barrel**

Em `src/features/conversation-rescue/index.ts`, adicionar:

```ts
export { determineAbsence } from "./engine/determineAbsence";
export type { IDetermineAbsenceInput } from "./engine/determineAbsence";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/conversation-rescue/engine/determineAbsence.ts src/features/conversation-rescue/engine/determineAbsence.test.ts src/features/conversation-rescue/index.ts
git commit -m "feat(conversation-rescue): determineAbsence engine (TDD)"
```

---

### Task 3: Engine — `pickFallbackSeller` (TDD)

**Files:**
- Create: `src/features/conversation-rescue/engine/pickFallbackSeller.ts`
- Test: `src/features/conversation-rescue/engine/pickFallbackSeller.test.ts`

**Interfaces:**
- Consumes: `ID` (`@/shared/types`).
- Produces: `pickFallbackSeller(candidateIds: ID[], seed: string): ID | null`.

- [ ] **Step 1: Escrever os testes**

Criar `src/features/conversation-rescue/engine/pickFallbackSeller.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickFallbackSeller } from "./pickFallbackSeller";

describe("pickFallbackSeller", () => {
  it("returns null for an empty candidate list", () => {
    expect(pickFallbackSeller([], "seed-1")).toBeNull();
  });

  it("returns the only candidate when there is exactly one", () => {
    expect(pickFallbackSeller(["seller-a"], "seed-1")).toBe("seller-a");
  });

  it("is deterministic — same candidates + same seed always picks the same seller", () => {
    const candidates = ["seller-a", "seller-b", "seller-c"];
    const first = pickFallbackSeller(candidates, "conv-123-2026-07-17T15:00:00Z");
    const second = pickFallbackSeller(candidates, "conv-123-2026-07-17T15:00:00Z");
    expect(first).toBe(second);
    expect(candidates).toContain(first);
  });

  it("varies the pick across different seeds (not always the first candidate)", () => {
    const candidates = ["seller-a", "seller-b", "seller-c", "seller-d"];
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) => pickFallbackSeller(candidates, `seed-${i}`)),
    );
    // With 4 candidates and 20 distinct seeds, a real distribution hits more than one.
    expect(picks.size).toBeGreaterThan(1);
  });

  it("order of candidates does not change who a given seed picks by identity — picks an id present in the list", () => {
    const candidates = ["seller-x", "seller-y"];
    const pick = pickFallbackSeller(candidates, "fixed-seed");
    expect(candidates).toContain(pick);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test src/features/conversation-rescue/engine/pickFallbackSeller.test.ts`
Expected: FAIL — `Cannot find module './pickFallbackSeller'`.

- [ ] **Step 3: Implementar**

Criar `src/features/conversation-rescue/engine/pickFallbackSeller.ts`:

```ts
import type { ID } from "@/shared/types";

/**
 * FNV-1a string hash — small, dependency-free, deterministic. Used only to
 * turn a seed string into a pseudo-random but reproducible index; not a
 * cryptographic hash.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic pseudo-random pick among candidates (spec 2026-07-17). Never
 * uses `Math.random()` — the same `(candidateIds, seed)` pair always yields
 * the same result, so callers can seed with e.g. `rescueId + tickTimestamp`
 * to get a fresh-looking distribution in production while staying testable.
 */
export function pickFallbackSeller(candidateIds: ID[], seed: string): ID | null {
  if (candidateIds.length === 0) return null;
  const index = fnv1a(seed) % candidateIds.length;
  return candidateIds[index] ?? null;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test src/features/conversation-rescue/engine/pickFallbackSeller.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Exportar no barrel**

Em `src/features/conversation-rescue/index.ts`, adicionar:

```ts
export { pickFallbackSeller } from "./engine/pickFallbackSeller";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/conversation-rescue/engine/pickFallbackSeller.ts src/features/conversation-rescue/engine/pickFallbackSeller.test.ts src/features/conversation-rescue/index.ts
git commit -m "feat(conversation-rescue): pickFallbackSeller engine (TDD)"
```

---

### Task 4: Migration — tabela, RLS, RPC de claim, trigger de notificação

**Files:**
- Create: `supabase/migrations/20260717170000_conversation_rescues.sql`

**Interfaces:**
- Consumes: `public.can_access_conversation(uuid)`, `public.current_seller_id()` (já existentes).
- Produces: tabela `public.conversation_rescues`, RPC `public.claim_conversation_rescue(uuid) returns public.conversation_rescues`, trigger `conversation_rescues_notify_resolved`. A Task 5 (provider) e a Task 7 (Edge Function) dependem desta tabela/RPC existirem.

- [ ] **Step 1: Escrever a migration completa**

Criar `supabase/migrations/20260717170000_conversation_rescues.sql`:

```sql
-- Sub-projeto B (spec 2026-07-17): resgate de conversa com responsável ausente.
-- Tabela + RLS + RPC de claim (concorrência otimista) + notificação ao ausente.
-- A criação dos registros (broadcast) e o fallback forçado são feitos pela
-- Edge Function conversation-rescue-tick (Task 7), via service_role — que
-- bypassa RLS, então não precisa de policy de INSERT/UPDATE para ela.

create table public.conversation_rescues (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  store_id uuid not null references public.stores(id),
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  absent_seller_id uuid not null references public.sellers(id),
  absence_kind text not null check (absence_kind in ('schedule', 'temporary')),
  contact_name text not null,
  last_inbound_preview text,
  status text not null default 'broadcasting'
    check (status in ('broadcasting', 'claimed', 'forced', 'cancelled')),
  broadcast_at timestamptz not null default now(),
  claimed_by_seller_id uuid references public.sellers(id),
  claimed_at timestamptz,
  forced_seller_id uuid references public.sellers(id),
  forced_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now()
);

-- Só 1 resgate ativo por conversa (a Edge Function também confia nisso para
-- não duplicar broadcasts a cada tick).
create unique index conversation_rescues_active_idx
  on public.conversation_rescues (conversation_id)
  where status = 'broadcasting';

create index conversation_rescues_store_id_idx on public.conversation_rescues (store_id);
create index conversation_rescues_absent_seller_id_idx on public.conversation_rescues (absent_seller_id);

alter table public.conversation_rescues enable row level security;

-- Leitura: mesmo portão da instância usado em toda a Inbox — se o seller pode
-- ver a conversa, pode ver (e potencialmente reclamar) o resgate dela.
create policy conversation_rescues_select on public.conversation_rescues
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

-- Sem policy de INSERT/UPDATE/DELETE para `authenticated` — escrita só via
-- service_role (a Edge Function) ou a RPC SECURITY DEFINER abaixo.

-- ---------------------------------------------------------------------------
-- claim_conversation_rescue: primeiro a clicar assume (concorrência otimista).
-- ---------------------------------------------------------------------------
create or replace function public.claim_conversation_rescue(p_rescue_id uuid)
returns public.conversation_rescues
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.conversation_rescues;
  v_seller uuid := public.current_seller_id();
begin
  if v_seller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from public.conversation_rescues where id = p_rescue_id;
  if not found then
    raise exception 'rescue not found' using errcode = 'P0002';
  end if;

  if not public.can_access_conversation(v_row.conversation_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  update public.conversation_rescues
     set status = 'claimed',
         claimed_by_seller_id = v_seller,
         claimed_at = now()
   where id = p_rescue_id
     and status = 'broadcasting'
  returning * into v_row;

  if not found then
    raise exception 'already claimed' using errcode = 'P0004';
  end if;

  update public.conversations
     set assigned_seller_id = v_seller
   where id = v_row.conversation_id;

  insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, after)
  values (gen_random_uuid(), v_row.store_id, v_seller, 'conversation_rescue_claim', 'conversation',
          v_row.conversation_id::text, jsonb_build_object('rescueId', p_rescue_id));

  return v_row;
end;
$function$;

revoke all on function public.claim_conversation_rescue(uuid) from public, anon;
grant execute on function public.claim_conversation_rescue(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notificação in-app ao ausente quando o resgate resolve (claim ou forced).
-- Mesmo padrão direto-via-trigger de notify_conversation_participant_added
-- (20260704120100) — evento pontual, não passa pelo reconciler.
-- ---------------------------------------------------------------------------
create or replace function public.notify_conversation_rescue_resolved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_new_seller_id uuid;
  v_new_seller_name text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status not in ('claimed', 'forced') then
    return new;
  end if;

  v_new_seller_id := coalesce(new.claimed_by_seller_id, new.forced_seller_id);

  select coalesce(nullif(s.attendant_name, ''), s.full_name)
    into v_new_seller_name
  from public.sellers s
  where s.id = v_new_seller_id;

  insert into public.notifications
    (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
     store_id, title, body, entity_ref, status, channels, source, created_at)
  values (
    'conv-rescue-' || new.id::text,
    'event',
    'conversa.resgatada',
    'operational',
    'info',
    new.absent_seller_id::text,
    'seller',
    new.store_id,
    coalesce(new.contact_name, 'Cliente') || ' — conversa assumida por ' ||
      coalesce(v_new_seller_name, 'outro atendente'),
    'Você estava ausente quando o cliente entrou em contato.',
    jsonb_build_object('type', 'conversation', 'id', new.conversation_id::text),
    'unread',
    array['inApp']::text[],
    'rule',
    now()
  );

  return new;
end;
$function$;

drop trigger if exists conversation_rescues_notify_resolved on public.conversation_rescues;
create trigger conversation_rescues_notify_resolved
  after update on public.conversation_rescues
  for each row
  execute function public.notify_conversation_rescue_resolved();
```

- [ ] **Step 2: Aplicar a migration via MCP (com OK do dono)**

Chamar `mcp__supabase__apply_migration` com `name: "conversation_rescues"` e o SQL acima. **Pedir confirmação explícita do dono antes de aplicar em produção** (regra durável do projeto).

- [ ] **Step 3: Confirmar que a tabela e a RPC existem**

Run (via `mcp__supabase__execute_sql`): `select count(*) from public.conversation_rescues;`
Expected: `0` (tabela vazia, criada com sucesso).

Run: `select proname from pg_proc where proname = 'claim_conversation_rescue';`
Expected: 1 linha.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717170000_conversation_rescues.sql
git commit -m "feat(conversation-rescue): migration — table, RLS, claim RPC, notify trigger"
```

---

### Task 5: Provider Pattern — `conversationRescues` (mock + supabase)

**Files:**
- Create: `src/providers/data/contracts/conversationRescues.ts`
- Create: `src/providers/data/impl/mock/conversationRescues.ts`
- Create: `src/providers/data/impl/supabase/conversationRescues.ts`
- Create: `src/providers/data/hooks/useConversationRescuesProvider.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/contracts/index.ts` (se existir um barrel de contracts — checar; senão, `src/providers/data/index.ts`)

**Interfaces:**
- Consumes: `IConversationRescue` (Task 1), tabela `conversation_rescues` + RPC `claim_conversation_rescue` (Task 4).
- Produces: `IConversationRescuesProvider { list(): Promise<IConversationRescue[]>; claim(rescueId: ID): Promise<IConversationRescue>; }`, hook `useConversationRescuesProvider()`.

- [ ] **Step 1: Contrato**

Criar `src/providers/data/contracts/conversationRescues.ts`:

```ts
import type { ID, IConversationRescue } from "@/shared/types";

/**
 * Contract for the offline-rescue broadcast queue (spec 2026-07-17). Only
 * `broadcasting` rows are ever returned by `list()` — resolved/cancelled
 * rows are audit trail, not something the client needs to poll.
 */
export interface IConversationRescuesProvider {
  list(): Promise<IConversationRescue[]>;
  claim(rescueId: ID): Promise<IConversationRescue>;
}
```

- [ ] **Step 2: Impl mock**

Criar `src/providers/data/impl/mock/conversationRescues.ts`:

```ts
import type { IConversationRescuesProvider } from "../../contracts/conversationRescues";

/**
 * Mock impl (spec 2026-07-17, "Fora de escopo"): there is no `pg_cron` tick in
 * Demonstração mode, so no rescue ever gets created organically. `list()`
 * always returns empty; `claim()` is unreachable from the UI (the broadcast
 * panel never renders without entries) but still throws a clear error if
 * ever called directly, instead of silently no-op'ing.
 */
export const mockConversationRescuesProvider: IConversationRescuesProvider = {
  async list() {
    return [];
  },
  async claim(rescueId) {
    throw new Error(
      `[mock] claim(${rescueId}) failed: no rescue broadcasts exist in Demonstração mode.`,
    );
  },
};
```

- [ ] **Step 3: Impl supabase**

Criar `src/providers/data/impl/supabase/conversationRescues.ts`:

```ts
import type { ID, IConversationRescue } from "@/shared/types";
import type { IConversationRescuesProvider } from "../../contracts/conversationRescues";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface IConversationRescueRow {
  id: string;
  conversation_id: string;
  store_id: string;
  whatsapp_account_id: string | null;
  absent_seller_id: string;
  absence_kind: "schedule" | "temporary";
  contact_name: string;
  last_inbound_preview: string | null;
  status: "broadcasting" | "claimed" | "forced" | "cancelled";
  broadcast_at: string;
  claimed_by_seller_id: string | null;
  claimed_at: string | null;
  forced_seller_id: string | null;
  forced_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
}

function fromRow(row: IConversationRescueRow): IConversationRescue {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    storeId: row.store_id,
    whatsappAccountId: row.whatsapp_account_id,
    absentSellerId: row.absent_seller_id,
    absenceKind: row.absence_kind,
    contactName: row.contact_name,
    lastInboundPreview: row.last_inbound_preview,
    status: row.status,
    broadcastAt: row.broadcast_at,
    claimedBySellerId: row.claimed_by_seller_id ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    forcedSellerId: row.forced_seller_id ?? undefined,
    forcedAt: row.forced_at ?? undefined,
    cancelledReason: row.cancelled_reason ?? undefined,
    createdAt: row.created_at,
  };
}

export const supabaseConversationRescuesProvider: IConversationRescuesProvider = {
  async list(): Promise<IConversationRescue[]> {
    const { data, error } = await getSupabaseClient()
      .from("conversation_rescues")
      .select("*")
      .eq("status", "broadcasting")
      .order("broadcast_at", { ascending: true });
    if (error) throw new Error(`[supabase] conversationRescues.list() failed: ${error.message}`);
    return (data as IConversationRescueRow[]).map(fromRow);
  },

  async claim(rescueId: ID): Promise<IConversationRescue> {
    const { data, error } = await getSupabaseClient().rpc("claim_conversation_rescue", {
      p_rescue_id: rescueId,
    });
    if (error) throw new Error(`[supabase] conversationRescues.claim(${rescueId}) failed: ${error.message}`);
    return fromRow(data as IConversationRescueRow);
  },
};
```

- [ ] **Step 4: Hook**

Criar `src/providers/data/hooks/useConversationRescuesProvider.ts`:

```ts
import type { IConversationRescuesProvider } from "../contracts/conversationRescues";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationRescuesProvider(): IConversationRescuesProvider {
  return useDataProviderSlice("conversationRescues", "useConversationRescuesProvider");
}
```

- [ ] **Step 5: Ligar no factory**

Em `src/providers/data/factory.ts`:
1. Adicionar aos imports (junto aos outros `mock*`/`supabase*`):
```ts
import { mockConversationRescuesProvider } from "./impl/mock/conversationRescues";
```
```ts
import { supabaseConversationRescuesProvider } from "./impl/supabase/conversationRescues";
```
2. No objeto `mockProviders` (mesmo bloco de `sdrEscalations: mockSdrEscalationsProvider,`), adicionar:
```ts
  conversationRescues: mockConversationRescuesProvider,
```
3. No objeto `supabaseProviders` (mesmo bloco de `sdrEscalations: supabaseSdrEscalationsProvider,`), adicionar:
```ts
  conversationRescues: supabaseConversationRescuesProvider,
```

- [ ] **Step 6: Exportar o hook e o contrato no barrel público**

Localizar onde `useSdrEscalationsProvider` é exportado no barrel público de `src/providers/data/index.ts` (ou arquivo equivalente que re-exporta os hooks) e adicionar `useConversationRescuesProvider` na mesma lista. Localizar onde `ISdrEscalationsProvider` é exportado como tipo e adicionar `IConversationRescuesProvider` do mesmo jeito.

- [ ] **Step 7: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "conversationRescues\|conversation-rescue" || echo "no new errors"`
Expected: `no new errors`.

- [ ] **Step 8: Commit**

```bash
git add src/providers/data/contracts/conversationRescues.ts src/providers/data/impl/mock/conversationRescues.ts src/providers/data/impl/supabase/conversationRescues.ts src/providers/data/hooks/useConversationRescuesProvider.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(conversation-rescue): conversationRescues provider (mock + supabase)"
```

---

### Task 6: Espelhamento server-side (script de sync + arquivos gerados)

**Files:**
- Create: `scripts/sync-conversation-rescue-shared.ts`
- Create (gerados pelo script — não editar à mão): `supabase/functions/_shared/conversation-rescue/engine/determineAbsence.ts`, `supabase/functions/_shared/conversation-rescue/engine/pickFallbackSeller.ts`, `supabase/functions/_shared/access/workSchedule.ts`, `supabase/functions/_shared/access/accessRecipients.ts`

**Interfaces:**
- Consumes: `src/features/conversation-rescue/engine/{determineAbsence,pickFallbackSeller}.ts` (Tasks 2-3), `src/features/access/engine/workSchedule.ts` (PRD-212, já existente), `src/features/admin-settings/utils/accessRecipients.ts` (já existente).
- Produces: cópias Deno-prontas em `supabase/functions/_shared/` que a Task 7 importa.

- [ ] **Step 1: Escrever o script de sync**

Criar `scripts/sync-conversation-rescue-shared.ts`:

```ts
/**
 * Mirrors the pure engines the offline-rescue tick needs into the Edge
 * Functions tree, so conversation-rescue-tick (Deno) can reuse them without
 * duplicating them by hand. Same discipline as scripts/sync-sdr-shared.ts.
 *
 *   src/features/conversation-rescue/engine/**  →  supabase/functions/_shared/conversation-rescue/engine/**
 *   src/features/access/engine/workSchedule.ts  →  supabase/functions/_shared/access/workSchedule.ts
 *   src/features/admin-settings/utils/accessRecipients.ts  →  supabase/functions/_shared/access/accessRecipients.ts
 *
 * Source files only use `import type` from "@/shared/types" (erased at
 * transpile time — harmless for Deno) plus relative imports between
 * themselves. Excluded: tests.
 *
 * Run after ANY change to those source files:
 *   bun run scripts/sync-conversation-rescue-shared.ts
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");

function addTsExtensions(source: string): string {
  return source.replace(
    /(from\s+")(\.{1,2}\/[^"]+)(")/g,
    (whole, prefix: string, specifier: string, suffix: string) =>
      specifier.endsWith(".ts") ? whole : `${prefix}${specifier}.ts${suffix}`,
  );
}

function banner(sourceRelPath: string): string {
  return `// AUTO-GENERATED MIRROR — DO NOT EDIT.\n// Source: ${sourceRelPath} (sync: bun run scripts/sync-conversation-rescue-shared.ts)\n\n`;
}

function writeMirrored(srcAbs: string, destAbs: string, sourceRelPath: string): void {
  mkdirSync(dirname(destAbs), { recursive: true });
  writeFileSync(destAbs, banner(sourceRelPath) + addTsExtensions(readFileSync(srcAbs, "utf8")));
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    out.push(full);
  }
  return out;
}

let count = 0;

// 1) whole engine directory
const ENGINE_SRC = join(ROOT, "src", "features", "conversation-rescue", "engine");
const ENGINE_DEST = join(ROOT, "supabase", "functions", "_shared", "conversation-rescue", "engine");
rmSync(ENGINE_DEST, { recursive: true, force: true });
for (const file of collectTsFiles(ENGINE_SRC)) {
  const rel = relative(ENGINE_SRC, file);
  const dest = join(ENGINE_DEST, rel);
  writeMirrored(file, dest, `src/features/conversation-rescue/engine/${rel.replace(/\\/g, "/")}`);
  count++;
}

// 2) single-file mirrors
const SINGLE_FILES: Array<[string, string]> = [
  [
    join(ROOT, "src", "features", "access", "engine", "workSchedule.ts"),
    join(ROOT, "supabase", "functions", "_shared", "access", "workSchedule.ts"),
  ],
  [
    join(ROOT, "src", "features", "admin-settings", "utils", "accessRecipients.ts"),
    join(ROOT, "supabase", "functions", "_shared", "access", "accessRecipients.ts"),
  ],
];
for (const [srcAbs, destAbs] of SINGLE_FILES) {
  const rel = relative(ROOT, srcAbs).replace(/\\/g, "/");
  writeMirrored(srcAbs, destAbs, rel);
  count++;
}

console.log(`synced ${count} files → supabase/functions/_shared/{conversation-rescue,access}/`);
```

- [ ] **Step 2: Rodar o script**

Run: `bun run scripts/sync-conversation-rescue-shared.ts`
Expected: `synced 4 files → supabase/functions/_shared/{conversation-rescue,access}/`

- [ ] **Step 3: Confirmar os arquivos gerados**

Run: `ls supabase/functions/_shared/conversation-rescue/engine/ supabase/functions/_shared/access/`
Expected: `determineAbsence.ts`, `pickFallbackSeller.ts` na primeira pasta; `workSchedule.ts`, `accessRecipients.ts` na segunda.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-conversation-rescue-shared.ts supabase/functions/_shared/conversation-rescue supabase/functions/_shared/access
git commit -m "chore(conversation-rescue): sync script + Deno mirrors of the pure engines"
```

---

### Task 7: Edge Function `conversation-rescue-tick` + agendamento `pg_cron`

**Files:**
- Create: `supabase/functions/conversation-rescue-tick/index.ts`
- Create: `supabase/migrations/20260717180000_conversation_rescue_worker_secret.sql`
- Create: `supabase/migrations/20260717190000_conversation_rescue_cron_trigger.sql`

**Interfaces:**
- Consumes: `determineAbsence`, `pickFallbackSeller` (mirrors da Task 6), `isWithinWorkSchedule` (mirror), `resolveAccessRecipients` (mirror), `_shared/serve.ts`, `_shared/http.ts`, `_shared/env.ts`, `_shared/workerAuth.ts` (já existentes).
- Produces: linhas em `conversation_rescues` (broadcast + fallback forçado).

- [ ] **Step 1: Escrever a Edge Function**

Criar `supabase/functions/conversation-rescue-tick/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * conversation-rescue-tick — agendada via pg_cron a cada 1 minuto (spec
 * 2026-07-17, mesmo padrão de sdr-backstop-tick). Duas fases por execução:
 *
 *  1) broadcastNewRescues — varre conversas com awaiting_reply_since setado
 *     cujo responsável está ausente (fora da agenda, ou dentro da agenda mas
 *     availability≠online há mais de temporaryAbsenceGraceMinutes) e ainda
 *     sem resgate ativo; cria a linha de broadcast.
 *  2) resolveTimeouts — varre resgates `broadcasting` mais velhos que
 *     forceAssignTimeoutMinutes e força uma atribuição (fallback list online
 *     primeiro, senão qualquer elegível online; se ninguém, mantém
 *     broadcasting — o sub-projeto A cobre esse extremo via idle-alerts).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import { isWithinWorkSchedule } from "../_shared/access/workSchedule.ts";
import { resolveAccessRecipients } from "../_shared/access/accessRecipients.ts";
import { determineAbsence } from "../_shared/conversation-rescue/engine/determineAbsence.ts";
import { pickFallbackSeller } from "../_shared/conversation-rescue/engine/pickFallbackSeller.ts";

const WORKER_SECRET_NAME = "CONVERSATION_RESCUE_WORKER_SECRET";

interface ISellerRow {
  id: string;
  store_id: string;
  auth_user_id: string | null;
  availability: "online" | "ausente" | "ocupado" | "offline";
  active: boolean;
  work_schedule: unknown;
  schedule_overrides: unknown;
}

interface IConversationRow {
  id: string;
  store_id: string;
  whatsapp_account_id: string | null;
  assigned_seller_id: string;
  awaiting_reply_since: string;
  customer_id: string | null;
  lead_id: string | null;
}

async function fetchProfileRolesByAuthUserId(
  admin: ReturnType<typeof createClient>,
  authUserIds: string[],
): Promise<Map<string, string>> {
  if (authUserIds.length === 0) return new Map();
  const { data } = await admin
    .from("profiles")
    .select("auth_user_id, role")
    .in("auth_user_id", authUserIds);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ auth_user_id: string; role: string }>) {
    map.set(row.auth_user_id, row.role);
  }
  return map;
}

/** Sellers eligible to receive the broadcast for `accountId`, excluding `excludeSellerId`. */
async function resolveEligiblePool(
  admin: ReturnType<typeof createClient>,
  storeId: string,
  accountId: string,
  excludeSellerId: string,
  now: Date,
): Promise<string[]> {
  const { data: rulesData } = await admin
    .from("whatsapp_account_access_rules")
    .select("kind, target_value")
    .eq("whatsapp_account_id", accountId);
  // resolveAccessRecipients expects camelCase `targetValue` — the DB row is
  // snake_case `target_value`; map explicitly, never cast-and-hope.
  const rules = ((rulesData ?? []) as Array<{ kind: string; target_value: string }>).map((r) => ({
    kind: r.kind,
    targetValue: r.target_value,
  }));

  const { data: sellersData } = await admin
    .from("sellers")
    .select("id, store_id, auth_user_id, availability, active, work_schedule, schedule_overrides")
    .eq("store_id", storeId)
    .eq("active", true);
  const sellers = (sellersData ?? []) as ISellerRow[];

  const authUserIds = sellers.map((s) => s.auth_user_id).filter((id): id is string => id !== null);
  const rolesByAuthUserId = await fetchProfileRolesByAuthUserId(admin, authUserIds);

  const sellersLike = sellers.map((s) => ({
    id: s.id,
    role: s.auth_user_id ? (rolesByAuthUserId.get(s.auth_user_id) ?? "") : "",
    storeId: s.store_id,
  }));
  const ruleRecipients = resolveAccessRecipients(rules, sellersLike);

  const eligibleIds = new Set<string>();
  for (const s of sellers) {
    if (s.id === excludeSellerId) continue;
    const role = s.auth_user_id ? rolesByAuthUserId.get(s.auth_user_id) : undefined;
    const isStaffBypass = role === "owner" || role === "manager";
    if (!isStaffBypass && !ruleRecipients.has(s.id)) continue;
    if (s.availability !== "online") continue;
    const scheduleSource = {
      workSchedule: (s.work_schedule ?? []) as never,
      scheduleOverrides: (s.schedule_overrides ?? []) as never,
    };
    if (!isWithinWorkSchedule(scheduleSource, now)) continue;
    eligibleIds.add(s.id);
  }
  return [...eligibleIds];
}

async function broadcastNewRescues(admin: ReturnType<typeof createClient>, now: Date): Promise<number> {
  const { data: stores } = await admin
    .from("stores")
    .select("id, settings")
    .not("settings->conversationRescue->>enabled", "is", null)
    .eq("settings->conversationRescue->>enabled", "true");
  let created = 0;

  for (const store of (stores ?? []) as Array<{ id: string; settings: Record<string, unknown> }>) {
    const cfg = (store.settings.conversationRescue ?? {}) as {
      temporaryAbsenceGraceMinutes?: number;
    };
    const graceMinutes = cfg.temporaryAbsenceGraceMinutes ?? 15;

    const { data: activeRescues } = await admin
      .from("conversation_rescues")
      .select("conversation_id")
      .eq("store_id", store.id)
      .eq("status", "broadcasting");
    const alreadyBroadcasting = new Set(
      ((activeRescues ?? []) as Array<{ conversation_id: string }>).map((r) => r.conversation_id),
    );

    const { data: convData } = await admin
      .from("conversations")
      .select("id, store_id, whatsapp_account_id, assigned_seller_id, awaiting_reply_since, customer_id, lead_id")
      .eq("store_id", store.id)
      .not("assigned_seller_id", "is", null)
      .not("awaiting_reply_since", "is", null)
      .in("status", ["aguardando", "em_andamento", "aguardando_cliente"]);
    const conversations = (convData ?? []) as IConversationRow[];

    for (const conv of conversations) {
      if (alreadyBroadcasting.has(conv.id)) continue;
      if (!conv.whatsapp_account_id) continue;

      const { data: sellerData } = await admin
        .from("sellers")
        .select("id, store_id, auth_user_id, availability, active, work_schedule, schedule_overrides")
        .eq("id", conv.assigned_seller_id)
        .maybeSingle();
      const seller = sellerData as ISellerRow | null;
      if (!seller) continue;

      const scheduleSource = {
        workSchedule: (seller.work_schedule ?? []) as never,
        scheduleOverrides: (seller.schedule_overrides ?? []) as never,
      };
      const isWithinSchedule = isWithinWorkSchedule(scheduleSource, now);
      const absenceKind = determineAbsence({
        isWithinSchedule,
        availability: seller.availability,
        awaitingReplySince: conv.awaiting_reply_since,
        now,
        temporaryAbsenceGraceMinutes: graceMinutes,
      });
      if (!absenceKind) continue;

      let contactName = "Contato";
      if (conv.customer_id) {
        const { data: customer } = await admin
          .from("customers")
          .select("nome_fantasia, full_name")
          .eq("id", conv.customer_id)
          .maybeSingle();
        const c = customer as { nome_fantasia: string | null; full_name: string | null } | null;
        contactName = c?.nome_fantasia || c?.full_name || contactName;
      } else if (conv.lead_id) {
        const { data: lead } = await admin
          .from("leads")
          .select("name")
          .eq("id", conv.lead_id)
          .maybeSingle();
        contactName = (lead as { name: string } | null)?.name ?? contactName;
      }

      const { data: lastInbound } = await admin
        .from("messages")
        .select("text")
        .eq("conversation_id", conv.id)
        .eq("direction", "in")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: insertError } = await admin.from("conversation_rescues").insert({
        conversation_id: conv.id,
        store_id: conv.store_id,
        whatsapp_account_id: conv.whatsapp_account_id,
        absent_seller_id: conv.assigned_seller_id,
        absence_kind: absenceKind,
        contact_name: contactName,
        last_inbound_preview: (lastInbound as { text: string } | null)?.text ?? null,
      });
      if (!insertError) created++;
    }
  }
  return created;
}

async function resolveTimeouts(admin: ReturnType<typeof createClient>, now: Date): Promise<number> {
  const { data: stores } = await admin
    .from("stores")
    .select("id, settings")
    .not("settings->conversationRescue->>enabled", "is", null)
    .eq("settings->conversationRescue->>enabled", "true");
  let forced = 0;

  for (const store of (stores ?? []) as Array<{ id: string; settings: Record<string, unknown> }>) {
    const cfg = (store.settings.conversationRescue ?? {}) as {
      forceAssignTimeoutMinutes?: number;
      fallbackSellerIds?: string[];
    };
    const timeoutMinutes = cfg.forceAssignTimeoutMinutes ?? 5;
    const fallbackSellerIds = cfg.fallbackSellerIds ?? [];
    const cutoff = new Date(now.getTime() - timeoutMinutes * 60_000).toISOString();

    const { data: stale } = await admin
      .from("conversation_rescues")
      .select("id, conversation_id, store_id, whatsapp_account_id, absent_seller_id, broadcast_at")
      .eq("store_id", store.id)
      .eq("status", "broadcasting")
      .lte("broadcast_at", cutoff);

    for (const rescue of (stale ?? []) as Array<{
      id: string;
      conversation_id: string;
      store_id: string;
      whatsapp_account_id: string | null;
      absent_seller_id: string;
      broadcast_at: string;
    }>) {
      if (!rescue.whatsapp_account_id) continue;
      const eligible = await resolveEligiblePool(
        admin,
        rescue.store_id,
        rescue.whatsapp_account_id,
        rescue.absent_seller_id,
        now,
      );
      const fallbackOnline = fallbackSellerIds.filter((id) => eligible.includes(id));
      const pool = fallbackOnline.length > 0 ? fallbackOnline : eligible;
      if (pool.length === 0) continue; // nobody online anywhere — stays broadcasting

      const seed = `${rescue.id}-${rescue.broadcast_at}`;
      const chosen = pickFallbackSeller(pool, seed);
      if (!chosen) continue;

      const { error: updErr } = await admin
        .from("conversation_rescues")
        .update({ status: "forced", forced_seller_id: chosen, forced_at: now.toISOString() })
        .eq("id", rescue.id)
        .eq("status", "broadcasting"); // idempotency guard against a concurrent tick
      if (updErr) continue;

      await admin
        .from("conversations")
        .update({ assigned_seller_id: chosen })
        .eq("id", rescue.conversation_id);

      await admin.from("audit_logs").insert({
        store_id: rescue.store_id,
        actor_id: chosen,
        action: "conversation_rescue_forced",
        resource: "conversation",
        resource_id: rescue.conversation_id,
        after: { rescueId: rescue.id },
      });
      forced++;
    }
  }
  return forced;
}

servePost(async (req, ctx) => {
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const expected = await createSecretResolver(admin)(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!verifyWorkerSecret(provided, expected)) throw new HttpError(401, "unauthorized");

  const now = new Date();
  const created = await broadcastNewRescues(admin, now);
  const forced = await resolveTimeouts(admin, now);
  ctx.log.info("conversation-rescue-tick done", { created, forced });
  return json({ created, forced }, 200);
});
```

- [ ] **Step 2: Deploy da Edge Function**

Chamar `mcp__supabase__deploy_edge_function` para `conversation-rescue-tick`. **Confirmar com o dono antes do deploy em produção.**

- [ ] **Step 3: Migration do secret do worker**

Criar `supabase/migrations/20260717180000_conversation_rescue_worker_secret.sql`:

```sql
-- Mints CONVERSATION_RESCUE_WORKER_SECRET in Vault (same pattern as
-- SDR_WORKER_SECRET, 20260715130000_sdr_activation_schema.sql).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'CONVERSATION_RESCUE_WORKER_SECRET') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'CONVERSATION_RESCUE_WORKER_SECRET',
      'Shared secret authenticating conversation-rescue-tick (offline-rescue sub-project B).'
    );
  end if;
end $$;
```

- [ ] **Step 4: Migration do agendamento `pg_cron`**

Criar `supabase/migrations/20260717190000_conversation_rescue_cron_trigger.sql` (**ajustar a URL do projeto** para o valor real antes de aplicar — mesmo domínio usado em `20260715150000_sdr_backstop_cron_trigger.sql`):

```sql
-- conversation-rescue-tick: periodic trigger (sub-projeto B). Same pattern as
-- sdr-backstop-tick. ORDER OF OPERATIONS: apply AFTER the function is
-- deployed and AFTER the worker-secret migration above.

create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'conversation-rescue-tick';

select cron.schedule(
  'conversation-rescue-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/conversation-rescue-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('CONVERSATION_RESCUE_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
```

- [ ] **Step 5: Aplicar as duas migrations via MCP (com OK do dono) e confirmar o cron job**

Aplicar `20260717180000_conversation_rescue_worker_secret.sql`, depois `20260717190000_conversation_rescue_cron_trigger.sql`.

Run (via `mcp__supabase__execute_sql`): `select jobname, schedule, active from cron.job where jobname = 'conversation-rescue-tick';`
Expected: 1 linha, `active = true`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/conversation-rescue-tick supabase/migrations/20260717180000_conversation_rescue_worker_secret.sql supabase/migrations/20260717190000_conversation_rescue_cron_trigger.sql
git commit -m "feat(conversation-rescue): tick Edge Function + worker secret + pg_cron schedule"
```

---

### Task 8: Vocabulário de notificações — `conversa.resgatada`

**Files:**
- Modify: `src/providers/notifications/events.ts`
- Modify: `src/providers/notifications/routing/rules.ts`

**Interfaces:**
- Produces: `"conversa.resgatada"` disponível em `NotificationEventType` (evento pontual — **não** entra em `DERIVED_EVENTS`, já que é inserido diretamente pelo trigger da Task 4, não pelo reconciler).

- [ ] **Step 1: Adicionar o tipo do evento**

Em `src/providers/notifications/events.ts`, no bloco `// Atendimento (conversations / SDR)` do `NotificationEventType`, adicionar logo após `"conversa.ociosa"`:

```ts
  | "conversa.resgatada"
```

**Não** adicionar a `DERIVED_EVENTS` — este evento é inserido diretamente pelo trigger SQL (Task 4), não pelo reconciler periódico.

- [ ] **Step 2: Adicionar a regra de roteamento**

Em `src/providers/notifications/routing/rules.ts`, logo após o bloco `"conversa.ociosa": { ... }`, adicionar:

```ts
  "conversa.resgatada": {
    category: "operational",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
```

- [ ] **Step 3: Type-check e testes**

Run: `bunx tsc --noEmit 2>&1 | grep -i "conversa.resgatada\|routing/rules" || echo "no new errors"`
Expected: `no new errors`.

Run: `bun run test`
Expected: suíte inteira continua verde.

- [ ] **Step 4: Commit**

```bash
git add src/providers/notifications/events.ts src/providers/notifications/routing/rules.ts
git commit -m "feat(conversation-rescue): add conversa.resgatada to the notification vocabulary"
```

---

### Task 9: Settings — hook, página e navegação

**Files:**
- Create: `src/features/conversation-rescue/hooks/useConversationRescueSettings.ts`
- Create: `src/features/conversation-rescue/components/ConversationRescueSettingsSection.tsx`
- Create: `src/features/admin-settings/pages/ConversationRescueSettingsPage.tsx`
- Modify: `src/features/admin-settings/index.ts`
- Create: `src/routes/app.configuracoes.atendimento.resgate-conversas.tsx`
- Modify: `src/features/shell/layouts/SettingsLayout.tsx`
- Modify: `src/features/conversation-rescue/index.ts`

**Interfaces:**
- Consumes: `useSettingsProvider` (já existente), `useSellersProvider` (já existente), `DEFAULT_CONVERSATION_RESCUE_SETTINGS` (Task 1).
- Produces: rota `/app/configuracoes/atendimento/resgate-conversas`.

- [ ] **Step 1: Hook de settings (mesmo esqueleto de `useIdleAlertsSettings`)**

Criar `src/features/conversation-rescue/hooks/useConversationRescueSettings.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import type { ID, IConversationRescueSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { DEFAULT_CONVERSATION_RESCUE_SETTINGS } from "../config/defaults";

export interface IUseConversationRescueSettingsResult {
  settings: IConversationRescueSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<IConversationRescueSettings>) => Promise<void>;
}

/** Read + write helper for `IPlatformSettings.conversationRescue` (spec 2026-07-17). */
export function useConversationRescueSettings(storeId: ID | null): IUseConversationRescueSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IConversationRescueSettings>(
    DEFAULT_CONVERSATION_RESCUE_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const platform = await provider.get(storeId);
      setSettings(platform.conversationRescue ?? DEFAULT_CONVERSATION_RESCUE_SETTINGS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, [provider, storeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<IConversationRescueSettings>) => {
      if (!storeId) return;
      setSaving(true);
      const before = settings;
      const next: IConversationRescueSettings = { ...settings, ...patch };
      try {
        await provider.update(storeId, { conversationRescue: next });
        setSettings(next);
        auditLog({
          action: "conversation_rescue_settings.update",
          resource: "settings",
          resourceId: storeId,
          before,
          after: next,
          storeId,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [provider, settings, storeId],
  );

  return { settings, loading, saving, error, reload, update };
}
```

- [ ] **Step 2: Seção de configuração (card com switch, 2 campos numéricos, multi-seleção de reserva)**

Criar `src/features/conversation-rescue/components/ConversationRescueSettingsSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import type { ID, IConversationRescueSettings, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { useConversationRescueSettings } from "../hooks/useConversationRescueSettings";

const MINUTES_MIN = 1;
const MINUTES_MAX = 120;

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return MINUTES_MIN;
  return Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(value)));
}

export interface IConversationRescueSettingsSectionProps {
  storeId: ID | null;
}

/** Per-store offline-rescue settings card (spec 2026-07-17). Owner-only screen. */
export function ConversationRescueSettingsSection({ storeId }: IConversationRescueSettingsSectionProps) {
  const { settings, loading, saving, update } = useConversationRescueSettings(storeId);
  const [draft, setDraft] = useState<IConversationRescueSettings>(settings);
  const sellersProvider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (!storeId) return;
    sellersProvider.list({ storeId, active: true }).then(setSellers);
  }, [sellersProvider, storeId]);

  const toggleFallback = (sellerId: ID) => {
    setDraft((d) => ({
      ...d,
      fallbackSellerIds: d.fallbackSellerIds.includes(sellerId)
        ? d.fallbackSellerIds.filter((id) => id !== sellerId)
        : [...d.fallbackSellerIds, sellerId],
    }));
  };

  const handleSave = async () => {
    try {
      await update({
        enabled: draft.enabled,
        temporaryAbsenceGraceMinutes: clampMinutes(draft.temporaryAbsenceGraceMinutes),
        forceAssignTimeoutMinutes: clampMinutes(draft.forceAssignTimeoutMinutes),
        fallbackSellerIds: draft.fallbackSellerIds,
      });
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Resgate de conversas</h3>
          <p className="text-xs text-muted-foreground">
            Oferece a conversa a outro atendente online quando o responsável está ausente; força
            uma atribuição se ninguém assumir.
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
          aria-label="Ativar resgate de conversas"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rescue-grace" className="text-xs">
            Folga p/ ausência temporária (min)
          </Label>
          <Input
            id="rescue-grace"
            type="number"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            value={draft.temporaryAbsenceGraceMinutes}
            disabled={!draft.enabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                temporaryAbsenceGraceMinutes: clampMinutes(Number(e.target.value)),
              }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rescue-force-timeout" className="text-xs">
            Prazo até forçar atribuição (min)
          </Label>
          <Input
            id="rescue-force-timeout"
            type="number"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            value={draft.forceAssignTimeoutMinutes}
            disabled={!draft.enabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                forceAssignTimeoutMinutes: clampMinutes(Number(e.target.value)),
              }))
            }
          />
        </div>
      </div>
      <div className="mt-4">
        <Label className="text-xs">Reserva para atribuição forçada</Label>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
          {sellers.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.fallbackSellerIds.includes(s.id)}
                disabled={!draft.enabled}
                onCheckedChange={() => toggleFallback(s.id)}
              />
              {s.fullName}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          Salvar
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Página de Configurações (mesma moldura de `IdleAlertsSettingsPage`)**

Criar `src/features/admin-settings/pages/ConversationRescueSettingsPage.tsx`:

```tsx
import { useCurrentStore } from "@/features/multistore";
import { ConversationRescueSettingsSection } from "@/features/conversation-rescue";
import { SectionHeader } from "../components/SectionHeader";

export function ConversationRescueSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Resgate de conversas"
        description="Oferece a conversa a outro atendente online quando o responsável está ausente; força uma atribuição se ninguém assumir."
      />
      <ConversationRescueSettingsSection storeId={storeId} />
    </div>
  );
}
```

- [ ] **Step 4: Exportar no barrel de `conversation-rescue` e de `admin-settings`**

Em `src/features/conversation-rescue/index.ts`, adicionar:

```ts
export { useConversationRescueSettings } from "./hooks/useConversationRescueSettings";
export { ConversationRescueSettingsSection } from "./components/ConversationRescueSettingsSection";
```

Em `src/features/admin-settings/index.ts`, adicionar (junto às demais páginas):

```ts
export { ConversationRescueSettingsPage } from "./pages/ConversationRescueSettingsPage";
```

- [ ] **Step 5: Rota**

Criar `src/routes/app.configuracoes.atendimento.resgate-conversas.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { ConversationRescueSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/resgate-conversas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <ConversationRescueSettingsPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 6: Item de navegação**

Em `src/features/shell/layouts/SettingsLayout.tsx`, no grupo `"Operação"`, logo após o item `"Alertas de ociosidade"` adicionado no sub-projeto A, adicionar:

```ts
      {
        label: "Resgate de conversas",
        icon: "mdi:account-switch-outline",
        to: "/app/configuracoes/atendimento/resgate-conversas",
        roles: ["Owner"],
      },
```

- [ ] **Step 7: Build e type-check**

Run: `bun run build`
Expected: build verde, com um chunk novo para a rota `app.configuracoes.atendimento.resgate-conversas`.

- [ ] **Step 8: Commit**

```bash
git add src/features/conversation-rescue src/features/admin-settings/pages/ConversationRescueSettingsPage.tsx src/features/admin-settings/index.ts src/routes/app.configuracoes.atendimento.resgate-conversas.tsx src/features/shell/layouts/SettingsLayout.tsx src/routeTree.gen.ts
git commit -m "feat(conversation-rescue): settings page in Configurações → Operação"
```

---

### Task 10: UI — painel de transmissão (`RescueBroadcastClaim`)

**Files:**
- Create: `src/features/conversation-rescue/hooks/useRescueBroadcastQueue.ts`
- Create: `src/features/conversation-rescue/components/RescueBroadcastClaim.tsx`
- Modify: `src/features/shell/layouts/AppLayout.tsx`
- Modify: `src/features/conversation-rescue/index.ts`

**Interfaces:**
- Consumes: `useConversationRescuesProvider` (Task 5), `IConversationRescue` (Task 1).
- Produces: `<RescueBroadcastClaim />` montado no `AppLayout`.

- [ ] **Step 1: Hook do painel (mesmo esqueleto de `useUrgentBroadcastQueue`, sem `window` event — só polling)**

Criar `src/features/conversation-rescue/hooks/useRescueBroadcastQueue.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ID, IConversationRescue } from "@/shared/types";
import { useConversationRescuesProvider } from "@/providers/data";

export interface IRescueBroadcastEntry {
  rescue: IConversationRescue;
  /** Seconds since the broadcast started. */
  age: number;
}

/**
 * Polling broadcast queue for the offline-rescue panel (spec 2026-07-17).
 * Mirrors `useUrgentBroadcastQueue` (SDR) but simpler — no local `window`
 * event bus, just a 15s poll plus an immediate refresh right after `claim`.
 */
export function useRescueBroadcastQueue() {
  const provider = useConversationRescuesProvider();
  const [entries, setEntries] = useState<IRescueBroadcastEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await provider.list();
      const now = Date.now();
      setEntries(
        list.map((rescue) => ({
          rescue,
          age: Math.max(0, Math.floor((now - new Date(rescue.broadcastAt).getTime()) / 1000)),
        })),
      );
    } catch {
      // Provider errors are non-fatal for the queue.
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const claim = useCallback(
    async (rescueId: ID) => {
      const updated = await provider.claim(rescueId);
      await refresh();
      return updated;
    },
    [provider, refresh],
  );

  return useMemo(() => ({ entries, refresh, claim }), [entries, refresh, claim]);
}
```

- [ ] **Step 2: Componente do painel flutuante (mesmo layout de `UrgentBroadcastClaim`)**

Criar `src/features/conversation-rescue/components/RescueBroadcastClaim.tsx`:

```tsx
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useRescueBroadcastQueue } from "../hooks/useRescueBroadcastQueue";

/**
 * Floating panel for online sellers showing every conversation currently
 * being rescued (spec 2026-07-17) — assigned to an absent seller, broadcast
 * to everyone eligible. First to click "Atender agora" claims it.
 */
export function RescueBroadcastClaim() {
  const { currentUser } = useAuth();
  const queue = useRescueBroadcastQueue();
  const navigate = useNavigate();

  if (!currentUser) return null;
  if (queue.entries.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Conversas aguardando resgate"
      className="fixed bottom-20 right-4 z-50 flex w-72 flex-col gap-2 md:bottom-4"
    >
      {queue.entries.map(({ rescue, age }) => (
        <div
          key={rescue.id}
          className="rounded-md border border-amber-500/40 bg-amber-50 p-3 shadow-lg ring-1 ring-amber-500/20 dark:bg-amber-950/60"
        >
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-200">
            <Icon icon="mdi:account-alert-outline" size={14} />
            RESPONSÁVEL AUSENTE · há {age}s
          </div>
          <div className="text-sm font-medium text-foreground">{rescue.contactName}</div>
          {rescue.lastInboundPreview && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {rescue.lastInboundPreview}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={async () => {
                try {
                  await queue.claim(rescue.id);
                  toast.success("Você assumiu a conversa.");
                  void navigate({
                    to: "/app/atendimento/$id",
                    params: { id: rescue.conversationId },
                  });
                } catch {
                  toast.error("Outro atendente já assumiu esta conversa.");
                }
              }}
            >
              Atender agora
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Exportar no barrel**

Em `src/features/conversation-rescue/index.ts`, adicionar:

```ts
export { RescueBroadcastClaim } from "./components/RescueBroadcastClaim";
```

- [ ] **Step 4: Montar no `AppLayout`**

Em `src/features/shell/layouts/AppLayout.tsx`, adicionar o import junto aos demais de `@/features/sdr-escalation`:

```ts
import { RescueBroadcastClaim } from "@/features/conversation-rescue";
```

E montar logo após `<UrgentBroadcastClaim />` (linha ~81, mesmo bloco de componentes globais fixos):

```tsx
        <RescueBroadcastClaim />
```

- [ ] **Step 5: Build e testes**

Run: `bun run build`
Expected: build verde.

Run: `bun run test`
Expected: suíte inteira continua verde.

- [ ] **Step 6: Commit**

```bash
git add src/features/conversation-rescue/hooks/useRescueBroadcastQueue.ts src/features/conversation-rescue/components/RescueBroadcastClaim.tsx src/features/conversation-rescue/index.ts src/features/shell/layouts/AppLayout.tsx
git commit -m "feat(conversation-rescue): floating broadcast-claim panel"
```

---

### Task 11: Regressão RLS

**Files:**
- Modify: `supabase/tests/rls-regression.sql`

**Interfaces:**
- Consumes: tabela/RPC da Task 4, fixtures existentes (lucas `5a6400ed-...`, owner `57706ecc-...`, matriz `00000000-0000-0000-0000-000000000001`) — mesmas usadas no bloco idle-alerts.

- [ ] **Step 1: Adicionar os testes**

Em `supabase/tests/rls-regression.sql`, logo antes de `select 'ALL RLS REGRESSION TESTS PASSED' as result;` (a mesma posição onde termina o bloco idle-alerts), adicionar:

```sql
-- ---------------------------------------------------------------------------
-- Offline-rescue (spec 2026-07-17): RLS de conversation_rescues + claim RPC.
-- Schema per supabase/migrations/20260717170000_conversation_rescues.sql.
-- ---------------------------------------------------------------------------

-- Arrange (superuser, rolled back): plant a broadcasting rescue on a
-- conversation LUCAS cannot access (owner-assigned instance), so the SELECT
-- leak check below cannot pass vacuously.
do $$
declare
  v_owner_conv uuid;
  v_account uuid;
  v_rescue uuid;
begin
  select id, whatsapp_account_id into v_owner_conv, v_account from public.conversations
   where store_id = '00000000-0000-0000-0000-000000000001'
     and assigned_seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f'
     and whatsapp_account_id is not null
   limit 1;
  if v_owner_conv is null then
    raise notice 'conversation-rescue: no owner-assigned conversation with an account in fixtures — skipping';
    return;
  end if;

  insert into public.conversation_rescues
    (conversation_id, store_id, whatsapp_account_id, absent_seller_id, absence_kind, contact_name)
  values
    (v_owner_conv, '00000000-0000-0000-0000-000000000001', v_account,
     '57706ecc-01b5-4a96-b403-0359a4bb767f', 'schedule', 'Cliente RLS-test')
  returning id into v_rescue;

  perform set_config('rls_regression.rescue_id', v_rescue::text, false);
end $$;

-- LUCAS must not see a rescue on a conversation he cannot access.
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $$
declare
  v_rescue_id uuid := nullif(current_setting('rls_regression.rescue_id', true), '')::uuid;
begin
  if v_rescue_id is null then
    return; -- positive control was skipped above (no fixture) — nothing to assert
  end if;
  if exists (select 1 from public.conversation_rescues where id = v_rescue_id) then
    raise exception 'conversation_rescues: lucas should not see a rescue on a conversation he cannot access';
  end if;

  -- Claiming it must also fail closed (RPC re-checks can_access_conversation).
  begin
    perform public.claim_conversation_rescue(v_rescue_id);
    raise exception 'claim_conversation_rescue: lucas should not be able to claim an inaccessible rescue';
  exception
    when others then
      null; -- expected: insufficient_privilege
  end;
end $$;
reset role;

-- Second claim on an already-claimed rescue must fail (concorrência otimista).
do $$
declare
  v_rescue_id uuid := nullif(current_setting('rls_regression.rescue_id', true), '')::uuid;
begin
  if v_rescue_id is null then
    return;
  end if;
  update public.conversation_rescues set status = 'claimed', claimed_by_seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f'
   where id = v_rescue_id;
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"c9cbb27e-2b3c-4e9e-8b6a-9a3a2b6e9b4a","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $$
declare
  v_rescue_id uuid := nullif(current_setting('rls_regression.rescue_id', true), '')::uuid;
begin
  if v_rescue_id is null then
    return;
  end if;
  begin
    perform public.claim_conversation_rescue(v_rescue_id);
    raise exception 'claim_conversation_rescue: claiming an already-claimed rescue should fail';
  exception
    when others then
      null; -- expected: already claimed
  end;
end $$;
reset role;
```

**Nota:** o `sub` do segundo `set_config` (owner) é um placeholder de UUID de auth — se o `auth.uid()`/`sub` real do owner nos fixtures for necessário para alguma policy adicional, ajustar para o valor usado no restante do arquivo (verificar se `57706ecc-...` já aparece associado a um `auth_user_id`/`sub` real em blocos anteriores do mesmo arquivo e reutilizar o mesmo `sub`).

- [ ] **Step 2: Rodar a suíte de regressão**

Run: `mcp__supabase__execute_sql` com o conteúdo completo de `supabase/tests/rls-regression.sql` (ou via o workflow de CI, se disponível localmente).
Expected: `ALL RLS REGRESSION TESTS PASSED` — nenhuma `raise exception` disparada pelos blocos novos.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls-regression.sql
git commit -m "test(conversation-rescue): RLS coverage for conversation_rescues + claim RPC"
```

---

### Task 12: Documentação (as-built)

**Files:**
- Create: `docs/dev/conversation-rescue.md`

- [ ] **Step 1: Escrever o doc as-built**

Criar `docs/dev/conversation-rescue.md` cobrindo: visão geral do fluxo (broadcast → claim first-wins → fallback forçado), a tabela `conversation_rescues` e a RPC `claim_conversation_rescue`, o script de sync (`scripts/sync-conversation-rescue-shared.ts` — regra: mudou `src/features/conversation-rescue/engine/`, `src/features/access/engine/workSchedule.ts` ou `src/features/admin-settings/utils/accessRecipients.ts` ⇒ rodar o sync e redeployar `conversation-rescue-tick`), o `pg_cron` de 1min, as configurações por loja (`enabled`, `temporaryAbsenceGraceMinutes`, `forceAssignTimeoutMinutes`, `fallbackSellerIds`) e a localização da tela (`Configurações → Operação → Resgate de conversas`, Owner-only), e as limitações conhecidas (sem presença real além de `sellers.availability`; sem notificação separada quando ninguém está online no fallback — o sub-projeto A cobre esse extremo).

- [ ] **Step 2: Commit**

```bash
git add docs/dev/conversation-rescue.md
git commit -m "docs(conversation-rescue): as-built dev doc"
```

---

## Self-Review

**Cobertura do spec:** detecção combinada agenda+availability (Task 2, 7), gatilho via `pg_cron` 1x/min (Task 7), pool elegível via `whatsapp_account_access_rules` (Task 7), oferta broadcast claim-first-wins (Task 5, 10), fallback forçado com lista de reserva + sorteio determinístico (Task 3, 7), alcance restrito a `assigned_seller_id` (Task 4 RPC + Task 7), settings por loja com tela própria (Task 1, 9), notificação ao ausente (Task 4, 8), regressão RLS (Task 11), docs (Task 12). Todas as seções do spec `2026-07-17-conversation-rescue-design.md` têm uma task correspondente.

**Placeholders:** nenhum "TBD"/"a definir" restante — o único ponto sinalizado explicitamente (Task 11, `sub` do owner) é uma instrução concreta de verificação, não uma lacuna de requisito.

**Consistência de tipos:** `IConversationRescue`/`AbsenceKind`/`ConversationRescueStatus` (Task 1) usados identicamente pela Task 4 (migration), Task 5 (provider), Task 7 (Edge Function via mirrors), Task 9/10 (UI). `determineAbsence`/`pickFallbackSeller` (Tasks 2-3) têm a mesma assinatura no client e no mirror Deno (Task 6-7) por serem literalmente o mesmo arquivo copiado.
