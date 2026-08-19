# PRD-217 `Provenance` — Fase 1: Modelo de Dados e Captura ao Vivo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar a perda irreversível de origem de anúncio: cada clique que vira mensagem passa a gerar um registro imutável em `ad_touches`, sem tocar no comportamento atual de `conversations.ad_referral`.

**Architecture:** Duas tabelas novas (`ads`, catálogo por `source_id`; `ad_touches`, log de toques) e uma RPC `SECURITY DEFINER` `record_ad_touch` que faz o upsert do criativo e insere o toque **lendo os vínculos da própria conversa** — assim o webhook não precisa carregar `contact_id`/`lead_id`/`customer_id`, que ele não tem no escopo. O webhook ganha `db.recordAdTouch`, chamado ao lado do `setConversationAdReferral` que já existe, em bloco best-effort separado.

**Tech Stack:** Postgres/Supabase (migration + RLS + plpgsql), TypeScript runtime-agnostic (`src/providers/whatsapp/`, espelhado em Deno via `scripts/sync-whatsapp-shared.ts`), Vitest.

**Spec:** `docs/prds/PRD-217-historico-origem-anuncio.md`

## Global Constraints

- **Não alterar o comportamento de `conversations.ad_referral`** (RN-07 da spec). Ela continua sendo sobrescrita e continua sendo a fonte do cartão do thread entregue no PR #530. A Fase 1 é puramente aditiva.
- **Best-effort (RN-03):** todo o novo código roda **depois** de `db.markProcessed(eventKey, traceId)`. Uma falha nunca pode reabrir a janela de duplicação nem derrubar o processamento da mensagem.
- **Idempotência (RN-01):** o webhook reentrega o mesmo evento ~5×. A deduplicação é do banco: índice único em `message_id` e em `(conversation_id, ad_id, occurred_at)`, com `on conflict do nothing`.
- **Dois runtimes:** qualquer mudança em `src/providers/whatsapp/` exige `bun run scripts/sync-whatsapp-shared.ts`. O código não pode usar API de DOM nem de Node — só Web API e imports relativos.
- **Todos os `id` do schema são `uuid`** (verificado por catálogo em 2026-08-18). Não inferir tipo de FK a partir de migration antiga.
- **Migration é manual:** aplicar via MCP `apply_migration` **e** exportar o arquivo para `supabase/migrations/` no mesmo PR. Mergear o PR não aplica nada. Aplicação em produção e deploy de Edge Function exigem OK explícito do dono.
- **Escrita só por `service_role`:** `ad_touches` não recebe policy de INSERT/UPDATE/DELETE. Nenhum cliente autenticado escreve.
- **Comentários e nomes em inglês; texto de UI em pt-BR.** Esta fase não tem UI.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260818120000_ad_provenance.sql` **(criar)** | Tabelas, índices, RLS e a RPC `record_ad_touch`. Único ponto de DDL da fase. |
| `src/providers/whatsapp/webhook/adTouch.ts` **(criar)** | Função pura que decide se há toque a registrar e monta o input. Sem I/O. |
| `src/providers/whatsapp/webhook/adTouch.test.ts` **(criar)** | Testes da função pura. |
| `src/providers/whatsapp/webhook/core.ts` **(modificar)** | Contrato `recordAdTouch` no `db` + chamada no bloco de atribuição. |
| `src/providers/whatsapp/webhook/core.test.ts` **(modificar)** | Estado falso + três testes de integração do fluxo. |
| `supabase/functions/whatsapp-webhook/index.ts` **(modificar)** | Implementação real: chama a RPC com o client `admin`. |
| `supabase/functions/_shared/whatsapp/**` **(gerado)** | Espelho — nunca editar à mão, sai do script de sync. |

---

### Task 1: Migration — tabelas, RLS e a RPC

**Files:**
- Create: `supabase/migrations/20260818120000_ad_provenance.sql`

**Interfaces:**
- Consumes: funções existentes `public.current_store_id()`, `public.is_staff()`, `public.can_access_conversation(uuid)` — todas já no banco.
- Produces: tabelas `public.ads` e `public.ad_touches`; função `public.record_ad_touch(p_conversation_id uuid, p_message_id uuid, p_occurred_at timestamptz, p_referral jsonb, p_origin text) returns uuid`, que devolve o id do toque criado ou `null` quando não havia o que registrar (sem `sourceId`, conversa inexistente, ou duplicata).

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260818120000_ad_provenance.sql`:

```sql
-- PRD-217 (Provenance) Fase 1 — ad origin history.
--
-- The webhook overwrites conversations.ad_referral on every new ad entry, so a
-- customer returning through a different campaign erases the previous one for
-- good. These two tables keep every touch instead. conversations.ad_referral is
-- deliberately UNCHANGED: it stays the "latest ad" shortcut the thread card reads.

-- ── Catalog of ad creatives ────────────────────────────────────────────────
-- No store_id on purpose: an ad is not a commercial entity of the store, it is
-- an external Meta reference, and the same creative can bring people to several
-- stores. The touch carries the store.
create table if not exists public.ads (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null unique,
  source_type   text,
  headline      text,
  body          text,
  source_url    text,
  media_url     text,
  media_type    text check (media_type in ('image','video')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.ads is
  'Ad creatives that brought conversations in (Click-to-WhatsApp). Keyed by the Meta sourceID. Holds the LATEST creative seen: the advertiser can edit the copy without changing the id, and versioning creatives is out of scope (PRD-217 RN-02).';

-- ── Touch log ──────────────────────────────────────────────────────────────
create table if not exists public.ad_touches (
  id              uuid primary key default gen_random_uuid(),
  ad_id           uuid not null references public.ads(id) on delete cascade,
  store_id        uuid not null references public.stores(id),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id      uuid references public.messages(id) on delete set null,
  contact_id      uuid references public.contacts(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,
  occurred_at     timestamptz not null,
  origin          text not null check (origin in ('webhook','backfill_delivery','backfill_conversation')),
  created_at      timestamptz not null default now()
);

comment on table public.ad_touches is
  'One row per ad click that turned into a message. Immutable. origin distinguishes live capture from reconstruction: backfill_conversation rows carry an APPROXIMATE occurred_at (the conversation date), so any time series must say so (PRD-217 RN-06).';

-- Dedup (RN-01): the webhook redelivers the same event ~5x. message_id covers
-- live capture; the triple covers the backfill, which cannot always match a
-- message.
create unique index if not exists ad_touches_message_id_key
  on public.ad_touches (message_id) where message_id is not null;
create unique index if not exists ad_touches_dedupe_key
  on public.ad_touches (conversation_id, ad_id, occurred_at);

create index if not exists ad_touches_ad_occurred_idx on public.ad_touches (ad_id, occurred_at desc);
create index if not exists ad_touches_store_idx        on public.ad_touches (store_id);
create index if not exists ad_touches_conversation_idx on public.ad_touches (conversation_id);
create index if not exists ad_touches_lead_idx         on public.ad_touches (lead_id) where lead_id is not null;
create index if not exists ad_touches_customer_idx     on public.ad_touches (customer_id) where customer_id is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.ads enable row level security;

-- The catalog carries no PII — headline, copy and public permalinks of an ad
-- the company itself paid for.
create policy "ads_select"
  on public.ads for select to authenticated
  using (true);

alter table public.ad_touches enable row level security;

-- Staff (Owner/Gestor) sees the whole store: this is what the management screen
-- aggregates over.
create policy "ad_touches_select_staff"
  on public.ad_touches for select to authenticated
  using (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );

-- Everyone else only sees the touch of a conversation they could already open —
-- the same two gates (instance + portfolio) that govern the conversation itself.
create policy "ad_touches_select_own_conversation"
  on public.ad_touches for select to authenticated
  using (public.can_access_conversation(conversation_id));

-- No INSERT/UPDATE/DELETE policy anywhere: writing is service_role only (which
-- bypasses RLS) plus the SECURITY DEFINER function below.

-- ── record_ad_touch ────────────────────────────────────────────────────────
-- Upserts the creative and appends the touch, resolving store/contact/lead/
-- customer from the conversation itself — the webhook does not carry them.
create or replace function public.record_ad_touch(
  p_conversation_id uuid,
  p_message_id      uuid,
  p_occurred_at     timestamptz,
  p_referral        jsonb,
  p_origin          text default 'webhook'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id text := nullif(trim(p_referral->>'sourceId'), '');
  v_ad_id     uuid;
  v_touch_id  uuid;
  v_conv      record;
begin
  -- No sourceID means no natural key: the creative cannot be catalogued and the
  -- touch would be unattributable. Silently skip.
  if v_source_id is null then
    return null;
  end if;

  select store_id, contact_id, lead_id, customer_id
    into v_conv
    from public.conversations
   where id = p_conversation_id;

  if not found then
    return null;
  end if;

  insert into public.ads as a (
    source_id, source_type, headline, body, source_url, media_url, media_type
  )
  values (
    v_source_id,
    nullif(trim(p_referral->>'sourceType'), ''),
    nullif(trim(p_referral->>'headline'), ''),
    nullif(trim(p_referral->>'body'), ''),
    nullif(trim(p_referral->>'sourceUrl'), ''),
    nullif(trim(p_referral->>'mediaUrl'), ''),
    case when p_referral->>'mediaType' in ('image','video') then p_referral->>'mediaType' end
  )
  on conflict (source_id) do update
    set source_type  = coalesce(excluded.source_type, a.source_type),
        headline     = coalesce(excluded.headline,    a.headline),
        body         = coalesce(excluded.body,        a.body),
        source_url   = coalesce(excluded.source_url,  a.source_url),
        media_url    = coalesce(excluded.media_url,   a.media_url),
        media_type   = coalesce(excluded.media_type,  a.media_type),
        last_seen_at = now(),
        updated_at   = now()
  returning a.id into v_ad_id;

  insert into public.ad_touches (
    ad_id, store_id, conversation_id, message_id,
    contact_id, lead_id, customer_id, occurred_at, origin
  )
  values (
    v_ad_id, v_conv.store_id, p_conversation_id, p_message_id,
    v_conv.contact_id, v_conv.lead_id, v_conv.customer_id, p_occurred_at, p_origin
  )
  on conflict do nothing
  returning id into v_touch_id;

  -- null when the touch already existed (redelivery) — the caller treats that
  -- as success, not as an error.
  return v_touch_id;
end;
$$;

comment on function public.record_ad_touch(uuid, uuid, timestamptz, jsonb, text) is
  'PRD-217: upserts the ad creative and appends one touch, resolving the conversation links server-side. Idempotent via the unique indexes. service_role only.';

revoke all on function public.record_ad_touch(uuid, uuid, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_ad_touch(uuid, uuid, timestamptz, jsonb, text)
  to service_role;
```

- [ ] **Step 2: Aplicar a migration**

Aplicar via MCP Supabase `apply_migration`, com o nome `ad_provenance` e exatamente o SQL acima. **Pedir OK do dono antes**, e manter o arquivo em `supabase/migrations/` idêntico ao aplicado.

- [ ] **Step 3: Verificar que as tabelas, os índices e a RLS existem**

Rodar via MCP `execute_sql`:

```sql
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('ads','ad_touches');
select indexname from pg_indexes where schemaname='public' and tablename='ad_touches' order by 1;
select policyname from pg_policies where schemaname='public' and tablename in ('ads','ad_touches') order by 1;
```

Esperado: duas tabelas com `rowsecurity = true`; os índices `ad_touches_ad_occurred_idx`, `ad_touches_conversation_idx`, `ad_touches_customer_idx`, `ad_touches_dedupe_key`, `ad_touches_lead_idx`, `ad_touches_message_id_key`, `ad_touches_pkey`, `ad_touches_store_idx`; as políticas `ad_touches_select_own_conversation`, `ad_touches_select_staff`, `ads_select`.

- [ ] **Step 4: Verificar a RPC com uma conversa real de anúncio**

```sql
select public.record_ad_touch(
  (select id from conversations where ad_referral is not null order by last_message_at desc limit 1),
  null,
  now(),
  (select ad_referral from conversations where ad_referral is not null order by last_message_at desc limit 1),
  'webhook'
) as touch_id;
```

Esperado: um uuid. Rodar **a mesma chamada de novo** e esperar `null` — é a idempotência do índice `ad_touches_dedupe_key` funcionando (o `occurred_at` muda entre chamadas se usar `now()`, então fixe o horário para provar a dedup):

```sql
-- prova da dedup com occurred_at fixo
select public.record_ad_touch(c.id, null, '2026-01-01T00:00:00Z', c.ad_referral, 'webhook') as primeira,
       public.record_ad_touch(c.id, null, '2026-01-01T00:00:00Z', c.ad_referral, 'webhook') as segunda
  from conversations c where c.ad_referral is not null order by c.last_message_at desc limit 1;
```

Esperado: `primeira` = uuid, `segunda` = `null`.

- [ ] **Step 5: Verificar que a RPC ignora referral sem sourceId**

```sql
select public.record_ad_touch(
  (select id from conversations limit 1), null, now(), '{"headline":"sem id"}'::jsonb, 'webhook'
) as deve_ser_null;
```

Esperado: `null`, e `select count(*) from ads where source_id is null` continua impossível (a coluna é `not null`) — nada foi catalogado.

- [ ] **Step 6: Limpar os registros de verificação**

```sql
delete from public.ad_touches where origin = 'webhook' and message_id is null;
select count(*) as devem_ser_zero from public.ad_touches;
```

Esperado: `0`. A tabela precisa entrar na Task 3 vazia, para o smoke da captura ao vivo ser inequívoco.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260818120000_ad_provenance.sql
git commit -m "feat(db): add ads and ad_touches with record_ad_touch (PRD-217 phase 1)"
```

---

### Task 2: Função pura que decide o toque

**Files:**
- Create: `src/providers/whatsapp/webhook/adTouch.ts`
- Test: `src/providers/whatsapp/webhook/adTouch.test.ts`

**Interfaces:**
- Consumes: o tipo `IAdReferral` de `../types`.
- Produces: `export interface IAdTouchInput { conversationId: string; messageId: string; occurredAt: string; referral: IAdReferral }` e `export function buildAdTouchInput(args: { conversationId: string; messageId: string; occurredAt: string; referral: IAdReferral | undefined }): IAdTouchInput | null`. A Task 3 usa ambos.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/providers/whatsapp/webhook/adTouch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAdTouchInput } from "./adTouch";

const BASE = {
  conversationId: "conv-1",
  messageId: "msg-1",
  occurredAt: "2026-08-18T14:09:00.000Z",
};

describe("buildAdTouchInput", () => {
  it("builds the touch when the referral carries a source id", () => {
    const input = buildAdTouchInput({
      ...BASE,
      referral: { sourceId: "120238998853430275", headline: "Filtro UFI" },
    });
    expect(input).toEqual({
      ...BASE,
      referral: { sourceId: "120238998853430275", headline: "Filtro UFI" },
    });
  });

  it("returns null when there is no referral", () => {
    expect(buildAdTouchInput({ ...BASE, referral: undefined })).toBeNull();
  });

  it("returns null when the referral has no source id", () => {
    expect(buildAdTouchInput({ ...BASE, referral: { headline: "Filtro UFI" } })).toBeNull();
  });

  it("returns null when the source id is only whitespace", () => {
    expect(buildAdTouchInput({ ...BASE, referral: { sourceId: "   " } })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
bun run test -- --run src/providers/whatsapp/webhook/adTouch.test.ts
```

Esperado: FAIL com `Cannot find module './adTouch'`.

- [ ] **Step 3: Escrever a implementação mínima**

Criar `src/providers/whatsapp/webhook/adTouch.ts`:

```ts
import type { IAdReferral } from "../types";

/** One ad click that turned into a message — what `record_ad_touch` needs. */
export interface IAdTouchInput {
  conversationId: string;
  messageId: string;
  occurredAt: string;
  referral: IAdReferral;
}

/**
 * Decides whether an inbound referral is worth recording as a touch.
 *
 * Without a `sourceId` the creative has no natural key: it cannot be catalogued
 * in `ads` and the touch would be unattributable to any campaign. Those are
 * dropped here instead of reaching the database (PRD-217 RN-01).
 */
export function buildAdTouchInput(args: {
  conversationId: string;
  messageId: string;
  occurredAt: string;
  referral: IAdReferral | undefined;
}): IAdTouchInput | null {
  const { conversationId, messageId, occurredAt, referral } = args;
  if (!referral?.sourceId?.trim()) return null;
  return { conversationId, messageId, occurredAt, referral };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
bun run test -- --run src/providers/whatsapp/webhook/adTouch.test.ts
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/webhook/adTouch.ts src/providers/whatsapp/webhook/adTouch.test.ts
git commit -m "feat(whatsapp): add buildAdTouchInput guard for ad provenance"
```

---

### Task 3: Contrato e chamada no webhook

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts` (contrato `db` perto da linha 146; bloco de atribuição perto da linha 867)
- Modify: `src/providers/whatsapp/webhook/core.test.ts` (`IFakeState`, `emptyState`, o `db` falso, e os testes novos)

**Interfaces:**
- Consumes: `buildAdTouchInput` e `IAdTouchInput` da Task 2.
- Produces: método `recordAdTouch(input: IAdTouchInput): Promise<void>` no contrato `IWebhookDb`, que a Task 4 implementa de verdade.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/providers/whatsapp/webhook/core.test.ts` — no `describe("processWebhookEvent — ad referral attribution", ...)` que já existe, adicionar ao final, antes do fechamento:

```ts
  it("records an ad touch when the referral carries a source id", async () => {
    const state = emptyState();
    const result = await run(state, {
      event: "messages.upsert",
      instance: "gallo-matriz",
      sender: "5555911111111@s.whatsapp.net",
      data: {
        key: { id: "ADMSG2", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
        message: {
          extendedTextMessage: {
            text: "Vim do anúncio",
            contextInfo: {
              externalAdReplyInfo: { title: "Filtro UFI", sourceId: "120238998853430275" },
            },
          },
        },
        messageTimestamp: 1765400000,
      },
    });
    expect(state.adTouches).toHaveLength(1);
    expect(state.adTouches[0]).toMatchObject({
      conversationId: result.conversationId,
      referral: { sourceId: "120238998853430275", headline: "Filtro UFI" },
    });
  });

  it("does not record a touch when the referral has no source id", async () => {
    const state = emptyState();
    await run(state, {
      event: "messages.upsert",
      instance: "gallo-matriz",
      sender: "5555911111111@s.whatsapp.net",
      data: {
        key: { id: "ADMSG3", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
        message: {
          extendedTextMessage: {
            text: "Vim do anúncio",
            contextInfo: { externalAdReplyInfo: { title: "Sem id" } },
          },
        },
        messageTimestamp: 1765400000,
      },
    });
    expect(state.adReferrals).toHaveLength(1);
    expect(state.adTouches).toEqual([]);
  });

  it("keeps the message when recording the touch fails", async () => {
    const state = emptyState();
    state.failAdTouch = true;
    const result = await run(state, {
      event: "messages.upsert",
      instance: "gallo-matriz",
      sender: "5555911111111@s.whatsapp.net",
      data: {
        key: { id: "ADMSG4", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
        message: {
          extendedTextMessage: {
            text: "Vim do anúncio",
            contextInfo: {
              externalAdReplyInfo: { title: "Filtro UFI", sourceId: "120238998853430275" },
            },
          },
        },
        messageTimestamp: 1765400000,
      },
    });
    expect(result.outcome).toBe("message-created");
    expect(state.messages).toHaveLength(1);
    expect(state.adTouches).toEqual([]);
  });
```

No mesmo arquivo, na interface `IFakeState`, adicionar os dois campos:

```ts
  adTouches: IAdTouchInput[];
  failAdTouch?: boolean;
```

Importar o tipo no topo do arquivo, junto dos outros imports locais:

```ts
import type { IAdTouchInput } from "./adTouch";
```

Em `emptyState()`, adicionar a linha `adTouches: [],` logo depois de `adReferrals: [],`.

No objeto `db` falso, adicionar logo depois de `setConversationAdReferral`:

```ts
    recordAdTouch: async (input) => {
      if (state.failAdTouch) throw new Error("record_ad_touch boom");
      state.adTouches.push(input);
    },
```

- [ ] **Step 2: Rodar os testes e ver falhar**

```bash
bun run test -- --run src/providers/whatsapp/webhook/core.test.ts
```

Esperado: FAIL. Os três testes novos falham — os dois primeiros por `state.adTouches` estar vazio (nada chama `recordAdTouch` ainda) e o terceiro por o mesmo motivo invertido. Se em vez disso o erro for de tipo em `recordAdTouch` não existir no contrato, também é falha esperada: o contrato só é declarado no Step 3.

- [ ] **Step 3: Declarar o método no contrato**

Em `src/providers/whatsapp/webhook/core.ts`, logo abaixo da declaração de `setConversationAdReferral` (perto da linha 146):

```ts
  /**
   * Best-effort provenance write (PRD-217): appends ONE row per ad click and
   * never overwrites — the counterpart of setConversationAdReferral, which
   * keeps only the latest. Idempotent on the database side, so a redelivered
   * event is a no-op rather than a duplicate.
   */
  recordAdTouch(input: IAdTouchInput): Promise<void>;
```

E no topo do arquivo, junto dos imports:

```ts
import { buildAdTouchInput, type IAdTouchInput } from "./adTouch";
```

- [ ] **Step 4: Chamar no bloco de atribuição**

Em `src/providers/whatsapp/webhook/core.ts`, substituir o bloco existente:

```ts
  if (parsed.adReferral) {
    try {
      await db.setConversationAdReferral(conversation.id, parsed.adReferral);
    } catch (error) {
      warn("ad-referral attribution failed", {
        conversationId: conversation.id,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
```

por:

```ts
  if (parsed.adReferral) {
    try {
      await db.setConversationAdReferral(conversation.id, parsed.adReferral);
    } catch (error) {
      warn("ad-referral attribution failed", {
        conversationId: conversation.id,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    // Provenance history (PRD-217): the touch is APPENDED, never overwritten,
    // so a customer returning through another campaign keeps both. Its own
    // try/catch — a failure here must not cost us the overwrite above, and
    // vice versa.
    const touch = buildAdTouchInput({
      conversationId: conversation.id,
      messageId: message.id,
      occurredAt: parsed.timestamp,
      referral: parsed.adReferral,
    });
    if (touch) {
      try {
        await db.recordAdTouch(touch);
      } catch (error) {
        warn("ad-touch record failed", {
          conversationId: conversation.id,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
```

- [ ] **Step 5: Rodar os testes e ver passar**

```bash
bun run test -- --run src/providers/whatsapp/webhook/core.test.ts
```

Esperado: PASS, incluindo os dois testes de referral que já existiam (`sets conversations.ad_referral…` e `does not call setConversationAdReferral…`) — eles provam que a Fase 1 não mudou o comportamento antigo.

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts
git commit -m "feat(whatsapp): record an ad touch alongside the referral overwrite"
```

---

### Task 4: Implementação real na Edge Function

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts` (perto da linha 543, junto de `setConversationAdReferral`)
- Generated: `supabase/functions/_shared/whatsapp/**` via script

**Interfaces:**
- Consumes: `recordAdTouch(input: IAdTouchInput)` do contrato da Task 3 e a RPC `record_ad_touch` da Task 1.
- Produces: nada para tarefas seguintes — é a ponta do fluxo.

- [ ] **Step 1: Implementar o método**

Em `supabase/functions/whatsapp-webhook/index.ts`, logo depois do bloco `async setConversationAdReferral(...)`:

```ts
    async recordAdTouch(input) {
      // The RPC resolves store/contact/lead/customer from the conversation and
      // dedupes on its own unique indexes, so a redelivered event is a no-op.
      const { error } = await admin.rpc("record_ad_touch", {
        p_conversation_id: input.conversationId,
        p_message_id: input.messageId,
        p_occurred_at: input.occurredAt,
        p_referral: input.referral,
        p_origin: "webhook",
      });
      if (error) throw new Error(`recordAdTouch: ${error.message}`);
    },
```

- [ ] **Step 2: Espelhar o núcleo para o runtime Deno**

```bash
bun run scripts/sync-whatsapp-shared.ts
```

- [ ] **Step 3: Conferir que o espelho recebeu os arquivos novos**

```bash
git status --short supabase/functions/_shared/whatsapp/
grep -c "recordAdTouch" supabase/functions/_shared/whatsapp/webhook/core.ts
```

Esperado: `adTouch.ts` aparece como arquivo novo, `webhook/core.ts` como modificado, e o `grep` retorna `2` (a declaração no contrato e a chamada). O `adTouch.test.ts` **não** deve aparecer — o script exclui testes.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "feat(edge): wire recordAdTouch to the record_ad_touch RPC"
```

- [ ] **Step 5: Deploy — pedir OK ao dono ANTES de rodar**

```bash
npx supabase functions deploy whatsapp-webhook
```

Sem o OK explícito, parar aqui e entregar o resto do plano sem o deploy.

---

### Task 5: Gate e smoke

**Files:** nenhum arquivo novo — é verificação.

- [ ] **Step 1: Suíte completa**

```bash
bun run test
```

Esperado: tudo verde, com 7 testes a mais que o baseline da branch (4 de `adTouch.test.ts` + 3 de `core.test.ts`).

- [ ] **Step 2: Build**

```bash
bun run build
```

Esperado: `✓ built`. Depois disso, `src/routeTree.gen.ts` pode aparecer modificado — é gerado, **descartar** antes de commitar: `git checkout -- src/routeTree.gen.ts`.

- [ ] **Step 3: Type-check dos arquivos tocados**

```bash
bunx tsc --noEmit 2>&1 | grep -E "adTouch|core.ts"
```

Esperado: saída vazia. O repositório tem baseline de erros pré-existentes de `tsc`; o que não pode haver é erro **nos arquivos desta fase**.

- [ ] **Step 4: Smoke em produção — a prova real**

Mandar uma mensagem para o WhatsApp da GALLO clicando em um dos anúncios ativos e conferir:

```sql
select t.id, t.origin, t.occurred_at, t.conversation_id, t.message_id,
       t.lead_id, t.customer_id, a.source_id, a.headline
  from ad_touches t join ads a on a.id = t.ad_id
 order by t.created_at desc limit 5;
```

Esperado: uma linha com `origin='webhook'`, `message_id` preenchido, `lead_id` **ou** `customer_id` preenchido (a conversa tem exatamente um dos dois), e o `source_id` do anúncio clicado. `ads` deve ter ganhado no máximo uma linha.

- [ ] **Step 5: Confirmar que a redelivery não duplicou**

Alguns minutos depois do smoke (o webhook reentrega o mesmo evento ~5×):

```sql
select message_id, count(*) from ad_touches group by 1 having count(*) > 1;
```

Esperado: nenhuma linha.

- [ ] **Step 6: Confirmar que o comportamento antigo continua**

```sql
select c.ad_referral->>'sourceId' as na_conversa, a.source_id as no_toque
  from ad_touches t
  join ads a on a.id = t.ad_id
  join conversations c on c.id = t.conversation_id
 order by t.created_at desc limit 1;
```

Esperado: as duas colunas iguais — `conversations.ad_referral` continua sendo escrita como antes (RN-07).

- [ ] **Step 7: Abrir o PR**

```bash
git push -u origin claude/prd-217-fase-1-ad-touches
```

Corpo do PR: o que muda, o link para `docs/prds/PRD-217-historico-origem-anuncio.md`, o resultado do smoke dos Steps 4–6, e o aviso de que a migration **já foi aplicada** em produção (com data) e a Edge Function **já foi redeployada** — ou de que ambos aguardam OK, se o dono não tiver liberado.

---

## O que esta fase deliberadamente NÃO faz

Não propaga `customer_id` na conversão (Fase 2), não faz backfill (Fase 2), não mostra nada na interface (Fase 3), não tem tela de métricas nem recurso de RBAC (Fase 4), e não cria provider em `src/providers/data/` — nada lê `ad_touches` ainda, e criar contrato sem consumidor é código morto.
