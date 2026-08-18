# Histórico de Atendimento em camadas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer o Histórico da ficha do cliente mostrar mensagens, notas, orçamentos e pedidos num fio de cards por conversa com filtros, e trazer de volta as conversas anteriores ao trigger.

**Architecture:** o banco ganha uma RPC `get_customer_timeline` que devolve JSONB já agregado (mensagens contadas sob índice, dentro de `SECURITY DEFINER`); um engine puro no front funde as fontes, classifica cada item para o filtro e aplica as três regras de exibição; a UI só renderiza. A RPC antiga e o engine antigo continuam vivos até a última tarefa.

**Tech Stack:** Postgres/Supabase (plpgsql, RLS, migrations versionadas), TypeScript strict, React, TanStack Query, Vitest, Tailwind v4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-18-historico-atendimento-camadas-design.md`

## Global Constraints

- **Marco do registro:** `2026-07-04 01:43:17+00`. Constante única, definida na migration da RPC. Nenhuma outra camada redefine essa data.
- **Prévia de mensagem:** truncada em **120 caracteres**, no banco.
- **Gate de acesso:** idêntico ao da RPC atual — `is_staff()` OR dono da carteira OR `can_access_conversation()` em qualquer conversa do cliente. Nenhum relaxamento faz parte desta entrega.
- **Toda função nova:** `security definer`, `set search_path to ''`, `revoke all ... from public, anon`, `grant execute ... to authenticated`.
- **Query key da UI:** `["customer-timeline", customerId]`. O cache do atendimento (conversa/mensagens) é congelado — nunca compartilhar nem invalidar chaves dele.
- **Fora de escopo:** etiqueta e troca de carteira como evento; `customer_notes` no fio; paginação; `LeadTimeline`.
- **Idioma:** código e commits em inglês; toda string de UI em português com acentuação correta.
- **Migrations:** versionadas em `supabase/migrations/` no mesmo PR. **Aplicação em produção é manual e exige OK explícito do dono** — nenhuma tarefa deste plano aplica migration.
- **Gate de CI:** `bun run build` + `bun run test`.

---

### Task 1: Tipos do payload e engine de composição

O coração da entrega. Função pura, sem I/O — é onde as três regras viram comportamento verificável.

**Files:**
- Modify: `src/shared/types/conversation.ts` (acrescentar ao final)
- Create: `src/features/attendance-history/engine/customerTimeline.ts`
- Test: `src/features/attendance-history/engine/customerTimeline.test.ts`

**Interfaces:**
- Consumes: `IConversationActivityEvent`, `ConversationChannel`, `ConversationStatus`, `ID` de `@/shared/types`.
- Produces: `buildCustomerTimeline(payload: ICustomerTimelinePayload, filter: TimelineFilter): ITimelineCard[]`, e os tipos `ICustomerTimelinePayload`, `ICustomerTimelineConversation`, `ITimelineCard`, `ITimelineCardItem`, `TimelineFilter`.

- [ ] **Step 1: Acrescentar os tipos do payload**

Em `src/shared/types/conversation.ts`, ao final do arquivo:

```typescript
/** One note attached to a conversation, as returned by get_customer_timeline. */
export interface ICustomerTimelineNote {
  id: ID;
  at: string;
  authorId: ID | null;
  body: string;
}

/** A quote or order anchored to a conversation. */
export interface ICustomerTimelineDeal {
  id: ID;
  at: string;
  total: number;
  status?: string;
}

/** One conversation with everything the timeline needs to render it. */
export interface ICustomerTimelineConversation {
  id: ID;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdAt: string;
  closedAt: string | null;
  assignedSellerId: ID | null;
  /** Born before the trigger existed — its beginning was never recorded. */
  preRegistro: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  events: IConversationActivityEvent[];
  notes: ICustomerTimelineNote[];
  quotes: ICustomerTimelineDeal[];
  orders: ICustomerTimelineDeal[];
}

/** Full payload of get_customer_timeline. */
export interface ICustomerTimelinePayload {
  customerId: ID;
  generatedAt: string;
  conversations: ICustomerTimelineConversation[];
}
```

- [ ] **Step 2: Escrever o teste que falha**

Crie `src/features/attendance-history/engine/customerTimeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ICustomerTimelinePayload } from "@/shared/types";
import { buildCustomerTimeline } from "./customerTimeline";

const conversation = (over: Partial<ICustomerTimelinePayload["conversations"][number]> = {}) => ({
  id: "c1",
  channel: "whatsapp" as const,
  status: "resolvida" as const,
  createdAt: "2026-08-12T09:00:00Z",
  closedAt: "2026-08-14T17:02:00Z",
  assignedSellerId: "s1",
  preRegistro: false,
  messageCount: 18,
  lastMessageAt: "2026-08-13T10:00:00Z",
  lastMessagePreview: "combinado",
  events: [
    {
      id: "e1",
      conversationId: "c1",
      storeId: "st1",
      type: "assignment" as const,
      toSellerId: "s1",
      actorKind: "seller" as const,
      actorId: "s1",
      createdAt: "2026-08-12T09:31:00Z",
      conversationChannel: "whatsapp" as const,
      conversationStatus: "resolvida" as const,
      conversationCreatedAt: "2026-08-12T09:00:00Z",
    },
  ],
  notes: [{ id: "n1", at: "2026-08-12T11:00:00Z", authorId: "s1", body: "pediu prazo" }],
  quotes: [],
  orders: [],
  ...over,
});

const payload = (convs: ReturnType<typeof conversation>[]): ICustomerTimelinePayload => ({
  customerId: "cu1",
  generatedAt: "2026-08-18T13:00:00Z",
  conversations: convs,
});

describe("buildCustomerTimeline", () => {
  it("merges every source into one trail ordered newest-first", () => {
    const [card] = buildCustomerTimeline(payload([conversation()]), "tudo");
    expect(card.items.map((i) => i.kind)).toEqual(["conversa", "nota", "historico"]);
    expect(card.items[0].at).toBe("2026-08-13T10:00:00Z");
  });

  it("aggregates messages into a single item, never one per message", () => {
    const [card] = buildCustomerTimeline(payload([conversation({ messageCount: 240 })]), "tudo");
    const messageItems = card.items.filter((i) => i.kind === "conversa");
    expect(messageItems).toHaveLength(1);
    expect(messageItems[0].messageCount).toBe(240);
  });

  it("omits the message item when the conversation has none", () => {
    const [card] = buildCustomerTimeline(
      payload([conversation({ messageCount: 0, lastMessageAt: null })]),
      "tudo",
    );
    expect(card.items.some((i) => i.kind === "conversa")).toBe(false);
  });

  it("keeps the card when the filter empties it", () => {
    const [card] = buildCustomerTimeline(
      payload([conversation({ notes: [], events: [] })]),
      "nota",
    );
    expect(card).toBeDefined();
    expect(card.items).toHaveLength(0);
  });

  it("collapses a pre-registro conversation that has no event at all", () => {
    const [card] = buildCustomerTimeline(
      payload([conversation({ preRegistro: true, events: [], notes: [] })]),
      "tudo",
    );
    expect(card.preRegistro).toBe(true);
    expect(card.collapsed).toBe(true);
  });

  it("does NOT collapse a pre-registro conversation that has partial events", () => {
    const [card] = buildCustomerTimeline(payload([conversation({ preRegistro: true })]), "tudo");
    expect(card.preRegistro).toBe(true);
    expect(card.collapsed).toBe(false);
  });

  it("summarises duration and owner", () => {
    const [card] = buildCustomerTimeline(payload([conversation()]), "tudo");
    expect(card.summary.ownerId).toBe("s1");
    expect(card.summary.durationMs).toBe(
      Date.parse("2026-08-14T17:02:00Z") - Date.parse("2026-08-12T09:00:00Z"),
    );
  });

  it("survives an empty payload", () => {
    expect(buildCustomerTimeline(payload([]), "tudo")).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
bun run test -- customerTimeline
```

Esperado: FAIL — `Failed to resolve import "./customerTimeline"`.

- [ ] **Step 4: Implementar o engine**

Crie `src/features/attendance-history/engine/customerTimeline.ts`:

```typescript
/**
 * Customer attendance timeline builder.
 *
 * Pure function — no I/O, no Date.now(). Folds the four sources returned by
 * get_customer_timeline into one trail per conversation and applies the three
 * display rules agreed in the spec:
 *
 *  - filtering shrinks a card, it never removes it;
 *  - messages arrive aggregated, one item per conversation;
 *  - a conversation born before the trigger carries a warning, and collapses
 *    only when it holds no event whatsoever.
 */

import type {
  ConversationChannel,
  ConversationStatus,
  ICustomerTimelineConversation,
  ICustomerTimelinePayload,
  ID,
} from "@/shared/types";

export type TimelineFilter = "tudo" | "conversa" | "nota" | "historico";

export interface ITimelineCardItem {
  id: string;
  kind: "conversa" | "nota" | "historico";
  at: string;
  /** Present only on the aggregated message item. */
  messageCount?: number;
  preview?: string;
  /** Raw payload for the renderer — event, note or deal, depending on kind. */
  source: unknown;
}

export interface ITimelineCard {
  conversationId: ID;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdAt: string;
  closedAt: string | null;
  preRegistro: boolean;
  /** Pre-registro AND no event at all — renders folded, with the warning. */
  collapsed: boolean;
  items: ITimelineCardItem[];
  summary: {
    itemCount: number;
    ownerId: ID | null;
    /** Open→close span; null while the conversation is still open. */
    durationMs: number | null;
  };
}

function itemsOf(conversation: ICustomerTimelineConversation): ITimelineCardItem[] {
  const items: ITimelineCardItem[] = [];

  if (conversation.messageCount > 0 && conversation.lastMessageAt) {
    items.push({
      id: `msg-${conversation.id}`,
      kind: "conversa",
      at: conversation.lastMessageAt,
      messageCount: conversation.messageCount,
      preview: conversation.lastMessagePreview,
      source: null,
    });
  }

  for (const note of conversation.notes) {
    items.push({ id: note.id, kind: "nota", at: note.at, source: note });
  }

  for (const event of conversation.events) {
    items.push({ id: event.id, kind: "historico", at: event.createdAt, source: event });
  }

  // Deals read as commercial outcome of the attendance — same slice as the
  // lifecycle, so they narrow together under "Histórico".
  for (const deal of [...conversation.quotes, ...conversation.orders]) {
    items.push({ id: deal.id, kind: "historico", at: deal.at, source: deal });
  }

  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function buildCustomerTimeline(
  payload: ICustomerTimelinePayload,
  filter: TimelineFilter,
): ITimelineCard[] {
  return payload.conversations.map((conversation) => {
    const all = itemsOf(conversation);
    // Rule: the filter narrows the contents, never the card list.
    const items = filter === "tudo" ? all : all.filter((item) => item.kind === filter);

    return {
      conversationId: conversation.id,
      channel: conversation.channel,
      status: conversation.status,
      createdAt: conversation.createdAt,
      closedAt: conversation.closedAt,
      preRegistro: conversation.preRegistro,
      collapsed: conversation.preRegistro && conversation.events.length === 0,
      items,
      summary: {
        itemCount: all.length,
        ownerId: conversation.assignedSellerId,
        durationMs: conversation.closedAt
          ? Date.parse(conversation.closedAt) - Date.parse(conversation.createdAt)
          : null,
      },
    };
  });
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
bun run test -- customerTimeline
```

Esperado: PASS, 8 testes.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/conversation.ts src/features/attendance-history/engine/customerTimeline.ts src/features/attendance-history/engine/customerTimeline.test.ts
git commit -m "feat(attendance-history): add pure engine that folds the customer timeline"
```

---

### Task 2: Migration da RPC `get_customer_timeline`

**Files:**
- Create: `supabase/migrations/20260818120000_get_customer_timeline.sql`

**Interfaces:**
- Consumes: tabelas `conversation_activity`, `conversations`, `customers`, `messages`, `conversation_notes`, `quotes`, `orders`; funções `is_staff()`, `current_seller_id()`, `can_access_conversation()`.
- Produces: `public.get_customer_timeline(p_customer_id uuid) returns jsonb`, consumida pela Task 4.

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/20260818120000_get_customer_timeline.sql`:

```sql
-- Customer attendance timeline, one call. Returns JSONB because the payload has
-- two granularities (conversation and event) and flattening would repeat each
-- conversation's aggregate on every event row.
--
-- Message aggregation lives here on purpose: it runs as an index-only scan over
-- messages_conversation_created_at_idx, and SECURITY DEFINER means it never pays
-- per-row RLS over 217k rows.
--
-- get_customer_activity is deliberately left untouched — rollback is to stop
-- calling this function.

create or replace function public.get_customer_timeline(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with allowed as (
    select 1
    from public.customers cu
    where cu.id = p_customer_id
      and (
        public.is_staff()
        or cu.seller_id = public.current_seller_id()
        or exists (
          select 1 from public.conversations cc
          where cc.customer_id = p_customer_id
            and public.can_access_conversation(cc.id)
        )
      )
  ),
  conv as (
    select c.*
    from public.conversations c
    where c.customer_id = p_customer_id
      and exists (select 1 from allowed)
  ),
  msg as (
    select m.conversation_id,
           count(*) as message_count,
           max(m.created_at) as last_message_at
    from public.messages m
    join conv on conv.id = m.conversation_id
    group by m.conversation_id
  ),
  last_msg as (
    select distinct on (m.conversation_id)
           m.conversation_id,
           left(coalesce(m.text, ''), 120) as preview
    from public.messages m
    join conv on conv.id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  )
  select coalesce(
    jsonb_build_object(
      'customerId', p_customer_id,
      'generatedAt', now(),
      'conversations', coalesce(jsonb_agg(x.payload order by x.created_at desc), '[]'::jsonb)
    ),
    jsonb_build_object('customerId', p_customer_id, 'generatedAt', now(),
                       'conversations', '[]'::jsonb)
  )
  from (
    select
      conv.created_at,
      jsonb_build_object(
        'id', conv.id,
        'channel', conv.channel,
        'status', conv.status,
        'createdAt', conv.created_at,
        'closedAt', conv.closed_at,
        'assignedSellerId', conv.assigned_seller_id,
        -- The marker is the timestamp of the first event the trigger ever wrote.
        'preRegistro', conv.created_at < timestamptz '2026-07-04 01:43:17+00',
        'messageCount', coalesce(msg.message_count, 0),
        'lastMessageAt', msg.last_message_at,
        'lastMessagePreview', coalesce(last_msg.preview, ''),
        'events', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id, 'conversationId', a.conversation_id, 'storeId', a.store_id,
            'type', a.type, 'fromStatus', a.from_status, 'toStatus', a.to_status,
            'fromSellerId', a.from_seller_id, 'toSellerId', a.to_seller_id,
            'actorId', a.actor_id, 'actorKind', a.actor_kind, 'createdAt', a.created_at,
            'conversationChannel', conv.channel, 'conversationStatus', conv.status,
            'conversationCreatedAt', conv.created_at
          ) order by a.created_at asc)
          from public.conversation_activity a where a.conversation_id = conv.id
        ), '[]'::jsonb),
        'notes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', n.id, 'at', n.created_at, 'authorId', n.author_id, 'body', n.body
          ) order by n.created_at asc)
          from public.conversation_notes n where n.conversation_id = conv.id
        ), '[]'::jsonb),
        'quotes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'at', q.created_at, 'total', q.total, 'status', q.status
          ) order by q.created_at asc)
          from public.quotes q where q.conversation_id = conv.id
        ), '[]'::jsonb),
        'orders', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'at', o.created_at, 'total', o.total
          ) order by o.created_at asc)
          from public.orders o where o.conversation_id = conv.id
        ), '[]'::jsonb)
      ) as payload
    from conv
    left join msg on msg.conversation_id = conv.id
    left join last_msg on last_msg.conversation_id = conv.id
  ) x;
$$;

revoke all on function public.get_customer_timeline(uuid) from public, anon;
grant execute on function public.get_customer_timeline(uuid) to authenticated;
```

- [ ] **Step 2: Conferir que a coluna de texto da mensagem se chama `text`**

```bash
echo "select column_name from information_schema.columns where table_schema='public' and table_name='messages' and column_name in ('text','body','content');"
```

Rode essa consulta pelo MCP do Supabase. Se a coluna não for `text`, ajuste os dois pontos da migration que a referenciam (`coalesce(m.text, '')`). **Não presuma** — a migration antiga deste projeto já declarou tipo errado antes.

- [ ] **Step 3: Provar que o gate de acesso nega quem não deve ler**

A spec exige que a matriz de acesso seja idêntica à da RPC atual. Rode pelo MCP do Supabase, **depois** de a migration ser aplicada (não durante esta task, mas registre o resultado no PR):

```sql
-- 1. A função não pode ser executável por anon.
select has_function_privilege('anon', 'public.get_customer_timeline(uuid)', 'execute') as anon_pode;
-- Esperado: false

-- 2. Comparar o gate contra a RPC atual, para o mesmo cliente, como o mesmo papel.
select
  (select count(*) from jsonb_array_elements(public.get_customer_timeline(cu.id) -> 'conversations')) as novo,
  (select count(distinct conversation_id) from public.get_customer_activity(cu.id)) as antigo
from customers cu limit 5;
```

O novo pode ser **maior** que o antigo (agora traz conversa sem evento, por desenho). Nunca deve trazer conversa de cliente que o antigo não trazia por falta de permissão.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818120000_get_customer_timeline.sql
git commit -m "feat(db): add get_customer_timeline RPC returning the folded payload"
```

---

### Task 3: Migration dos novos tipos de evento

**Files:**
- Create: `supabase/migrations/20260818121000_activity_note_quote_order.sql`

**Interfaces:**
- Consumes: `conversation_activity`, `conversation_notes`, `quotes`, `orders`, `current_seller_id()`.
- Produces: triggers `conversation_note_activity_capture`, `quote_activity_capture`, `order_activity_capture`; tipos `note`, `quote`, `order` aceitos por `conversation_activity.type`.

- [ ] **Step 1: Ler o CHECK vigente antes de reescrever**

Rode pelo MCP do Supabase:

```sql
select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.conversation_activity'::regclass and contype = 'c';
```

O CHECK no banco **já diverge** da migration original (aceita `participant_add`/`participant_remove`). Copie a lista vigente e acrescente os três novos tipos — não recrie a lista de memória.

- [ ] **Step 2: Escrever a migration**

Crie `supabase/migrations/20260818121000_activity_note_quote_order.sql`:

```sql
-- Widen the activity feed beyond conversation lifecycle: notes, quotes and
-- orders anchored to a conversation. Forward-looking only — nothing here
-- rewrites history.

alter table public.conversation_activity
  drop constraint if exists conversation_activity_type_check;

alter table public.conversation_activity
  add constraint conversation_activity_type_check check (type in (
    'created','status','assignment','reopen',
    'participant_add','participant_remove',
    'note','quote','order'
  ));

create or replace function public.conversation_note_activity_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := public.current_seller_id();
begin
  insert into public.conversation_activity(
    conversation_id, customer_id, lead_id, store_id, type,
    actor_id, actor_kind, created_at)
  select new.conversation_id, c.customer_id, c.lead_id, new.store_id, 'note',
         v_actor, case when v_actor is null then 'system' else 'seller' end, new.created_at
  from public.conversations c where c.id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists conversation_note_activity_capture on public.conversation_notes;
create trigger conversation_note_activity_capture
  after insert on public.conversation_notes
  for each row execute function public.conversation_note_activity_capture();

create or replace function public.deal_activity_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := public.current_seller_id();
begin
  -- Deals without a conversation have no card to live in; skip them.
  if new.conversation_id is null then
    return new;
  end if;

  insert into public.conversation_activity(
    conversation_id, customer_id, lead_id, store_id, type,
    actor_id, actor_kind, created_at)
  select new.conversation_id, c.customer_id, c.lead_id, new.store_id, tg_argv[0],
         v_actor, case when v_actor is null then 'system' else 'seller' end, new.created_at
  from public.conversations c where c.id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists quote_activity_capture on public.quotes;
create trigger quote_activity_capture
  after insert on public.quotes
  for each row execute function public.deal_activity_capture('quote');

drop trigger if exists order_activity_capture on public.orders;
create trigger order_activity_capture
  after insert on public.orders
  for each row execute function public.deal_activity_capture('order');
```

- [ ] **Step 3: Conferir que `conversation_notes` tem coluna `body` e `quotes`/`orders` têm `store_id`**

Rode pelo MCP:

```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('conversation_notes','quotes','orders')
  and column_name in ('body','text','store_id','conversation_id');
```

Ajuste a migration se algum nome divergir.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818121000_activity_note_quote_order.sql
git commit -m "feat(db): capture note, quote and order as activity events"
```

---

### Task 4: Migration do backfill

**Files:**
- Create: `supabase/migrations/20260818122000_backfill_pre_registro.sql`

**Interfaces:**
- Consumes: `conversations`, `conversation_activity`.
- Produces: nenhuma função nova; apenas linhas em `conversation_activity`.

- [ ] **Step 1: Rodar a conferência de sanidade ANTES de escrever**

Pelo MCP do Supabase:

```sql
select
  count(*) filter (where not exists (select 1 from conversation_activity a where a.conversation_id = c.id)) as orfas,
  count(*) filter (where not exists (select 1 from conversation_activity a where a.conversation_id = c.id) and c.closed_at is not null) as com_encerramento
from conversations c where c.created_at < timestamptz '2026-07-04 01:43:17+00';
```

Esperado, medido em 18/08: **1.077** órfãs e **25** com encerramento. Se divergir muito, pare e reavalie antes de seguir — o número mudar significa que a base andou.

- [ ] **Step 2: Escrever a migration**

Crie `supabase/migrations/20260818122000_backfill_pre_registro.sql`:

```sql
-- Backfill for conversations born before the trigger existed.
--
-- Synthesises ONLY what real columns support: the opening (created_at) and,
-- where closed_at exists, the closing. No owner event — we know who owns the
-- conversation but not when they took it, and dating that would be invention.
--
-- to_status on the synthesised opening is NULL on purpose: the real trigger
-- records the status a conversation was born with, and for these rows that
-- value does not exist.
--
-- Idempotent: only touches conversations with no event at all.
-- Rollback:
--   delete from public.conversation_activity
--   where actor_kind = 'system' and actor_id is null
--     and created_at < timestamptz '2026-07-04 01:43:17+00';

insert into public.conversation_activity(
  conversation_id, customer_id, lead_id, store_id, type,
  from_status, to_status, actor_id, actor_kind, created_at)
select c.id, c.customer_id, c.lead_id, c.store_id, 'created',
       null, null, null, 'system', c.created_at
from public.conversations c
where c.created_at < timestamptz '2026-07-04 01:43:17+00'
  and not exists (select 1 from public.conversation_activity a where a.conversation_id = c.id);

insert into public.conversation_activity(
  conversation_id, customer_id, lead_id, store_id, type,
  from_status, to_status, actor_id, actor_kind, created_at)
select c.id, c.customer_id, c.lead_id, c.store_id, 'status',
       null, c.status, null, 'system', c.closed_at
from public.conversations c
where c.created_at < timestamptz '2026-07-04 01:43:17+00'
  and c.closed_at is not null
  and not exists (
    select 1 from public.conversation_activity a
    where a.conversation_id = c.id and a.type = 'status'
  );
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260818122000_backfill_pre_registro.sql
git commit -m "feat(db): backfill opening and closing for pre-trigger conversations"
```

---

### Task 5: Provider — contrato, mock e Supabase

**Files:**
- Modify: `src/providers/data/contracts/activity.ts`
- Modify: `src/providers/data/impl/supabase/activity.ts`
- Modify: `src/providers/data/impl/mock/activity.ts`
- Test: `src/providers/data/impl/mock/activity.test.ts` (criar)

**Interfaces:**
- Consumes: `ICustomerTimelinePayload` da Task 1; a RPC da Task 2.
- Produces: `IActivityProvider.getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload>`, consumida pela Task 6.

- [ ] **Step 1: Ampliar o contrato**

Em `src/providers/data/contracts/activity.ts`:

```typescript
import type { ID, IConversationActivityEvent, ICustomerTimelinePayload } from "@/shared/types";

export interface IActivityProvider {
  getCustomerActivity(customerId: ID): Promise<IConversationActivityEvent[]>;
  /** Folded timeline: conversations with events, notes, deals and message aggregate. */
  getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload>;
}
```

- [ ] **Step 2: Escrever o teste do mock**

Crie `src/providers/data/impl/mock/activity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mockActivityProvider } from "./activity";

describe("mockActivityProvider.getCustomerTimeline", () => {
  it("returns a well-formed payload for an unknown customer", async () => {
    const payload = await mockActivityProvider.getCustomerTimeline("does-not-exist");
    expect(payload.customerId).toBe("does-not-exist");
    expect(payload.conversations).toEqual([]);
    expect(typeof payload.generatedAt).toBe("string");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
bun run test -- impl/mock/activity
```

Esperado: FAIL — `getCustomerTimeline is not a function`.

- [ ] **Step 4: Implementar no mock**

Em `src/providers/data/impl/mock/activity.ts`, acrescente ao objeto exportado. Reaproveite o feed que `getCustomerActivity` já monta e agrupe por conversa:

```typescript
  async getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload> {
    const events = await mockActivityProvider.getCustomerActivity(customerId);
    const byConversation = new Map<ID, typeof events>();
    for (const event of events) {
      const bucket = byConversation.get(event.conversationId);
      if (bucket) bucket.push(event);
      else byConversation.set(event.conversationId, [event]);
    }

    return {
      customerId,
      generatedAt: new Date(0).toISOString(),
      conversations: [...byConversation.entries()].map(([id, list]) => ({
        id,
        channel: list[0]!.conversationChannel,
        status: list[0]!.conversationStatus,
        createdAt: list[0]!.conversationCreatedAt,
        closedAt: null,
        assignedSellerId: list[list.length - 1]!.toSellerId ?? null,
        preRegistro: false,
        messageCount: 0,
        lastMessageAt: null,
        lastMessagePreview: "",
        events: list,
        notes: [],
        quotes: [],
        orders: [],
      })),
    };
  },
```

Acrescente `ICustomerTimelinePayload` ao import de tipos no topo do arquivo.

- [ ] **Step 5: Implementar no Supabase**

Em `src/providers/data/impl/supabase/activity.ts`, acrescente ao objeto exportado:

```typescript
  async getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload> {
    const { data, error } = await getSupabaseClient().rpc("get_customer_timeline", {
      p_customer_id: customerId,
    });
    if (error)
      throw new Error(
        `[supabase] activity.getCustomerTimeline(${customerId}) failed: ${error.message}`,
      );
    // The RPC already returns the camelCase shape the UI consumes — no row mapping.
    return data as ICustomerTimelinePayload;
  },
```

Acrescente `ICustomerTimelinePayload` ao import de tipos no topo.

- [ ] **Step 6: Rodar os testes**

```bash
bun run test -- activity
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/providers/data/contracts/activity.ts src/providers/data/impl/mock/activity.ts src/providers/data/impl/mock/activity.test.ts src/providers/data/impl/supabase/activity.ts
git commit -m "feat(providers): expose getCustomerTimeline on the activity provider"
```

---

### Task 6: UI — filtros e consumo do novo engine

**Files:**
- Create: `src/features/attendance-history/hooks/useCustomerTimeline.ts`
- Modify: `src/features/attendance-history/components/AttendanceHistoryPanel.tsx`
- Modify: `src/features/attendance-history/i18n/pt-BR.ts`
- Modify: `src/features/attendance-history/index.ts`

**Interfaces:**
- Consumes: `buildCustomerTimeline` e `TimelineFilter` (Task 1); `getCustomerTimeline` (Task 5).
- Produces: nenhuma API nova para fora da feature — `AttendanceHistoryPanel` mantém a assinatura `{ customerId }`, então `ProfileTabs` e `CustomerTabs` **não mudam**.

- [ ] **Step 1: Criar o hook**

Crie `src/features/attendance-history/hooks/useCustomerTimeline.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useActivityProvider } from "@/providers/data";

/**
 * Folded attendance timeline for a customer.
 *
 * Isolated query key — deliberately distinct from the frozen conversation and
 * message cache keys. Never share or invalidate across those.
 */
export function useCustomerTimeline(customerId: ID | undefined) {
  const activityProvider = useActivityProvider();
  return useQuery({
    queryKey: ["customer-timeline", customerId],
    queryFn: () => activityProvider.getCustomerTimeline(customerId as ID),
    enabled: !!customerId,
  });
}
```

- [ ] **Step 2: Acrescentar as strings**

Em `src/features/attendance-history/i18n/pt-BR.ts`, dentro de `ATTENDANCE_HISTORY_STRINGS`:

```typescript
  filters: {
    all: "Tudo",
    conversation: "Conversas",
    note: "Notas",
    history: "Histórico",
  },
  emptyFilter: "Nada registrado neste filtro.",
  preRegistroWarning: "Anterior ao registro — só a abertura",
  messageCount: (n: number) => `${n} ${n === 1 ? "mensagem" : "mensagens"}`,
  cardSummary: (n: number, duration: string) =>
    `${n} ${n === 1 ? "evento" : "eventos"} · ${duration}`,
```

- [ ] **Step 3: Trocar a fonte do painel**

Em `AttendanceHistoryPanel.tsx`, substitua `useCustomerActivity` + `buildAttendanceTimeline` por `useCustomerTimeline` + `buildCustomerTimeline`, e adicione a barra de filtros acima da lista:

```tsx
const [filter, setFilter] = useState<TimelineFilter>("tudo");
const { data, isLoading, isError } = useCustomerTimeline(customerId);
const cards = useMemo(
  () => (data ? buildCustomerTimeline(data, filter) : []),
  [data, filter],
);
```

A barra, logo antes do map dos cards:

```tsx
<div className="flex shrink-0 gap-1 px-1 pb-2">
  {FILTERS.map((f) => (
    <button
      key={f.id}
      type="button"
      onClick={() => setFilter(f.id)}
      aria-pressed={filter === f.id}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
        filter === f.id
          ? "border-primary bg-primary text-primary-foreground font-medium"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {f.label}
    </button>
  ))}
</div>
```

Com, no topo do arquivo:

```tsx
const FILTERS: { id: TimelineFilter; label: string }[] = [
  { id: "tudo", label: S.filters.all },
  { id: "conversa", label: S.filters.conversation },
  { id: "nota", label: S.filters.note },
  { id: "historico", label: S.filters.history },
];
```

Use **apenas tokens semânticos** (`bg-primary`, `text-muted-foreground`, `border-border`) — nunca primitivos `--gallo-*` nem hex.

- [ ] **Step 4: Renderizar o corpo do card**

Dentro do map dos cards. Card colapsado mostra só o aviso; card com `preRegistro` e eventos parciais mostra o trilho **e** o aviso:

```tsx
<div key={card.conversationId} className="rounded-md border border-border bg-card">
  <button
    type="button"
    onClick={() => toggle(card.conversationId)}
    className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
  >
    <span className="text-sm font-medium">
      {formatRelativeTime(card.createdAt)}
    </span>
    <span className="flex-1" />
    <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", STATUS_META[card.status].tone)}>
      {CONVERSATION_STRINGS.statusLabel[card.status]}
    </span>
  </button>

  {card.preRegistro && (
    <p className="px-2.5 pb-1.5 text-[10px] text-severity-warning">
      {S.preRegistroWarning}
    </p>
  )}

  {!card.collapsed && isOpen(card.conversationId) && (
    <div className="border-l border-border/60 px-2.5 pb-2.5 pl-4">
      {card.items.length === 0 ? (
        <p className="py-1 text-[11px] text-muted-foreground">{S.emptyFilter}</p>
      ) : (
        card.items.map((item) => (
          <div key={item.id} className="flex gap-2 py-1">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <div className="text-[11px]">
              {item.kind === "conversa" ? (
                <>
                  <strong>{S.messageCount(item.messageCount ?? 0)}</strong>
                  {item.preview ? (
                    <span className="block text-muted-foreground">{item.preview}</span>
                  ) : null}
                </>
              ) : (
                <span>{describeItem(item)}</span>
              )}
              <span className="block text-[10px] text-muted-foreground">
                {formatRelativeTime(item.at)}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  )}
</div>
```

`describeItem` é a função de rótulo por tipo de item — reaproveite `describeEvent` de `../utils/eventDescription` para `kind === "historico"` cujo `source` é um evento, e devolva o corpo da nota para `kind === "nota"`.

- [ ] **Step 5: Exportar o novo hook no barrel**

Em `src/features/attendance-history/index.ts`, acrescente:

```typescript
export { useCustomerTimeline } from "./hooks/useCustomerTimeline";
export { buildCustomerTimeline, type TimelineFilter, type ITimelineCard } from "./engine/customerTimeline";
```

- [ ] **Step 6: Rodar build e testes**

```bash
bun run build && bun run test
```

Esperado: build verde; suíte inteira passando.

- [ ] **Step 7: Commit**

```bash
git add src/features/attendance-history
git commit -m "feat(attendance-history): render the filtered timeline in the customer fiche"
```

---

### Task 7: Aposentar a leitura antiga

Só depois que a Task 6 estiver verde. Antes disso, a RPC e o engine antigos são a rede de segurança do rollback.

**Files:**
- Delete: `src/features/attendance-history/engine/attendanceTimeline.ts`
- Delete: `src/features/attendance-history/engine/attendanceTimeline.test.ts`
- Delete: `src/features/attendance-history/hooks/useCustomerActivity.ts`
- Delete: `src/features/attendance-history/components/AttendanceHistoryPanel.test.ts`
- Modify: `src/features/attendance-history/index.ts`
- Modify: `src/providers/data/contracts/activity.ts`
- Modify: `src/providers/data/impl/{mock,supabase}/activity.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `IActivityProvider` reduzido a `getCustomerTimeline`.

- [ ] **Step 1: Confirmar que nada mais consome a via antiga**

```bash
grep -rn "getCustomerActivity\|buildAttendanceTimeline\|useCustomerActivity" src/
```

Esperado: apenas os arquivos listados acima. **Se aparecer qualquer outro consumidor, pare** e reavalie — a remoção deixaria de ser segura.

- [ ] **Step 2: Apagar os arquivos**

```bash
git rm src/features/attendance-history/engine/attendanceTimeline.ts \
       src/features/attendance-history/engine/attendanceTimeline.test.ts \
       src/features/attendance-history/hooks/useCustomerActivity.ts \
       src/features/attendance-history/components/AttendanceHistoryPanel.test.ts
```

- [ ] **Step 3: Enxugar o contrato**

`src/providers/data/contracts/activity.ts` fica exatamente assim:

```typescript
import type { ID, ICustomerTimelinePayload } from "@/shared/types";

export interface IActivityProvider {
  /** Folded timeline: conversations with events, notes, deals and message aggregate. */
  getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload>;
}
```

Remova o método `getCustomerActivity` (e o `rowToEvent`/`ActivityRow` que só ele usava) de `impl/supabase/activity.ts` e de `impl/mock/activity.ts`. No mock, o `getCustomerTimeline` deixa de delegar para o método removido: mova o corpo que montava o feed para dentro dele.

Em `src/features/attendance-history/index.ts`, remova as linhas que exportavam `buildAttendanceTimeline`, `useCustomerActivity`, `IConversationTimeline`, `ITimelineNode` e `ITimelineSummary`.

- [ ] **Step 4: Rodar build e testes**

```bash
bun run build && bun run test
```

Esperado: build verde; suíte passando com menos testes (os de `attendanceTimeline` saíram).

- [ ] **Step 5: Commit**

```bash
git add -A src/features/attendance-history src/providers/data
git commit -m "refactor(attendance-history): retire the flat activity read path"
```

> **A função `get_customer_activity` NÃO é dropada nesta entrega.** Ela fica órfã no banco de propósito — derrubá-la elimina o rollback sem front. Removê-la é assunto de uma migration futura, depois que a nova via provar estabilidade em produção.

---

## Ordem de entrega

1. Tasks 1 a 7 → PR aberto, build e suíte verdes.
2. **Migrations aplicadas manualmente**, na ordem: RPC (Task 2) → triggers (Task 3) → backfill (Task 4), cada uma com OK explícito do dono, e a do backfill conferida pelo `SELECT` de sanidade.
3. Merge do PR.
4. Smoke pelo dono: cliente com conversa recente, cliente só com conversas antigas, cliente sem conversa nenhuma, e um cliente onde o filtro esvazia todos os cards.

Aplicar as migrations **antes** do merge evita janela de tela quebrada: a UI nova chama uma RPC que precisa existir.
