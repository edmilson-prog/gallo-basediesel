# PRD-214 — Fundação Supabase do Painel de Atendimento (read-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder vazio do provider `atendimentoMetrics` por agregações reais via 6 RPCs `SECURITY DEFINER`, ligando os números do Painel de Atendimento em produção.

**Architecture:** 6 funções SQL `SECURITY DEFINER` (read-only) fazem `date_trunc + group by + count/avg` no servidor e retornam **jsonb já no shape do contrato**; o provider supabase vira passthrough identidade de 6 chamadas `.rpc()`. Sem tabela nova, sem trigger. Bucket em `America/Sao_Paulo`; gate Owner/Gestor + escopo de loja + exclusão de `demo-seed` dentro de cada função (substitui RLS por-linha — padrão `whatsapp_delivery_health`).

**Tech Stack:** PostgreSQL (Supabase), SQL `SECURITY DEFINER` functions, TypeScript, `@supabase/supabase-js` (`getSupabaseClient().rpc`), Vitest.

## Global Constraints

- **Contrato imutável:** `IAtendimentoMetricsProvider` (6 métodos) e os tipos em `src/shared/types/service-volume.ts` **não mudam**. As funções devem casar exatamente esses shapes.
- **Escopo A (read-only):** proibido criar tabela, trigger, ou qualquer escrita. Apenas `create or replace function` + `grant`.
- **Camada congelada:** não tocar em cache de mensagens/mídia (signing #137), Realtime, query keys, nem RPCs gated-once de conversa. PRD-214 é puramente aditivo.
- **Status taxonomy:** `aguardando | em_andamento | aguardando_cliente | resolvida | arquivada` (snake_case, union inalterada).
- **demo-seed sempre excluído:** `('demo-seed' = any(c.tags)) is not true`.
- **Bucket SP −03:00**, formato de chave idêntico ao `bucketKey` do engine: dia/semana = `YYYY-MM-DD` (semana = segunda-feira ISO via `date_trunc('week', …)`), mês = `YYYY-MM`.
- **Padrão de função:** `language sql stable security definer set search_path to ''`, refs `public.` qualificadas. Helpers de JWT: `public.current_app_role()`, `public.current_store_id()`.
- **Migration timestamp:** maior que a última aplicada (`20260624120000`). Usar `20260624170000`.
- **Regra do espelho:** a migration vai pro git no mesmo PR.
- **Deploy:** a aplicação em prod (DDL) é feita pelo **orquestrador** com **confirmação explícita do dono** (Task 6), **nunca** por subagente; subagentes só fazem `SELECT` read-only de verificação.
- **Comandos de gate:** `bun run test` (Vitest) + `bun run build` (Vite, não faz type-check). Avaliar código novo por delta.

---

## File Structure

- **Create:** `supabase/migrations/20260624170000_service_volume_metrics.sql` — os 6 RPCs + grants (Tasks 1–2).
- **Modify:** `src/providers/data/impl/supabase/atendimentoMetrics.ts` — placeholder → 6 `.rpc()` (Task 3).
- **Create:** `src/providers/data/impl/supabase/atendimentoMetrics.test.ts` — teste de mapping do provider (Task 3).
- **Modify:** `src/features/service-volume/i18n/pt-BR.ts` — copy honesta (Task 4).
- **Modify:** `src/features/service-volume/pages/ServiceVolumePage.tsx` — chave do empty-state (Task 4).
- **Orchestrator/owner:** aplicar migration em prod + verificação SQL (Task 6).

---

## Task 1: Migration — RPCs baseados em conversations (novos, accumulated, status)

**Files:**
- Create: `supabase/migrations/20260624170000_service_volume_metrics.sql`

**Interfaces:**
- Consumes: helpers em prod `public.current_app_role() → text`, `public.current_store_id() → uuid`; tabela `public.conversations(created_at timestamptz, store_id uuid, assigned_seller_id uuid, status text, tags text[], last_message_at timestamptz)`.
- Produces (consumido na Task 3):
  - `public.service_volume_novos_atendimentos(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_granularity text, p_seller_id uuid) → jsonb` shape `{series:[{bucket,value}], total, averagePerDay, deltaPct, historyStartsAt}`.
  - `public.service_volume_accumulated_chats(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_granularity text, p_seller_id uuid) → jsonb` shape `{series:[{bucket,value}], total}`.
  - `public.service_volume_status_distribution(p_store_id uuid, p_seller_id uuid) → jsonb` shape `{slices:[{status,count}], total}`.

- [ ] **Step 1: Criar o arquivo de migration com cabeçalho e os 3 RPCs de conversations**

Create `supabase/migrations/20260624170000_service_volume_metrics.sql`:

```sql
-- PRD-214 — Service-volume metrics (read-only foundation).
--
-- Six SECURITY DEFINER aggregation functions that feed the Painel de
-- Atendimento (atendimentoMetrics provider). They REPLACE per-row RLS with an
-- in-function gate (role + store + demo-seed) so aggregating over ~66k messages
-- stays fast — mirroring public.whatsapp_delivery_health.
--
-- Scope A (read-only): no new table, no trigger. "Novo atendimento" = first
-- contact (conversations.created_at); reopens are deferred (scope B).
-- Buckets are computed in America/Sao_Paulo and keyed to match the frontend
-- engine bucketKey: day/week = 'YYYY-MM-DD' (week = ISO Monday), month = 'YYYY-MM'.
-- Owner: optional p_store_id (cross-store when null). Manager: forced to its own
-- store. demo-seed conversations are always excluded.

-- ── Novos atendimentos (primeiro contato) ────────────────────────────────────
create or replace function public.service_volume_novos_atendimentos(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text default 'day',
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store,
      case when lower(coalesce(nullif(p_granularity, ''), 'day'))
                in ('day', 'week', 'month')
           then lower(coalesce(nullif(p_granularity, ''), 'day'))
           else 'day' end as g
  ),
  base as (
    select c.created_at, g.g
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
  ),
  cur as (
    select case g
             when 'month' then to_char(date_trunc('month', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM')
             else to_char(date_trunc(g, created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
           end as bucket
    from base
    where created_at >= p_from and created_at <= p_to
  ),
  series as (
    select bucket, count(*)::int as value from cur group by bucket
  ),
  totals as (select count(*)::int as total from cur),
  prev as (
    select count(*)::int as prev_total
    from base
    where created_at >= p_from - (p_to - p_from) and created_at < p_from
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'value', value) order by bucket)
      from series), '[]'::jsonb),
    'total', (select total from totals),
    'averagePerDay', round(
      (select total from totals)::numeric
      / greatest(1, ((p_to at time zone 'America/Sao_Paulo')::date
                    - (p_from at time zone 'America/Sao_Paulo')::date) + 1), 1),
    'deltaPct', (
      select case when p.prev_total = 0 then null
                  else round(((t.total - p.prev_total)::numeric / p.prev_total) * 100)::int end
      from totals t, prev p),
    'historyStartsAt', null
  );
$function$;

-- ── Chats acumulados (cumulativo dentro da janela) ───────────────────────────
create or replace function public.service_volume_accumulated_chats(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text default 'day',
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store,
      case when lower(coalesce(nullif(p_granularity, ''), 'day'))
                in ('day', 'week', 'month')
           then lower(coalesce(nullif(p_granularity, ''), 'day'))
           else 'day' end as g
  ),
  base as (
    select c.created_at, g.g
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
  ),
  cur as (
    select case g
             when 'month' then to_char(date_trunc('month', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM')
             else to_char(date_trunc(g, created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
           end as bucket
    from base
    where created_at >= p_from and created_at <= p_to
  ),
  series as (
    select bucket, count(*)::int as value from cur group by bucket
  ),
  cumulative as (
    select bucket, sum(value) over (order by bucket)::int as value from series
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'value', value) order by bucket)
      from cumulative), '[]'::jsonb),
    'total', (select count(*)::int from base)
  );
$function$;

-- ── Distribuição de status (snapshot atual) ──────────────────────────────────
create or replace function public.service_volume_status_distribution(
  p_store_id uuid,
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store
  ),
  base as (
    select c.status
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
  ),
  slices as (
    select status, count(*)::int as count from base group by status
  )
  select jsonb_build_object(
    'slices', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', count) order by status)
      from slices), '[]'::jsonb),
    'total', (select count(*)::int from base)
  );
$function$;
```

- [ ] **Step 2: Verificar a lógica de agregação contra dados reais (read-only)**

Rode via `mcp__supabase__execute_sql` (somente `SELECT`; **não** crie funções). Confirma que a expressão de bucket e os filtros dão números sãos:

```sql
-- Mimetiza o corpo do RPC de novos atendimentos (sem o gate de papel), 30d, day:
with base as (
  select c.created_at from public.conversations c
  where ('demo-seed' = any(c.tags)) is not true
)
select
  to_char(date_trunc('day', created_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as bucket,
  count(*)::int as value
from base
where created_at >= now() - interval '30 days' and created_at <= now()
group by 1 order by 1;
```

Expected: algumas linhas `bucket=YYYY-MM-DD`, `value>0`, em ordem crescente (1.127 convs reais distribuídas; nenhum bucket negativo/nulo).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260624170000_service_volume_metrics.sql
git commit -m "feat(prd-214): conversation-based service-volume RPCs (novos, accumulated, status)"
```

---

## Task 2: Migration — RPCs baseados em messages (volume, by-user, handle-time) + grants

**Files:**
- Modify: `supabase/migrations/20260624170000_service_volume_metrics.sql` (append)

**Interfaces:**
- Consumes: tabela `public.messages(conversation_id uuid, direction text, author_type text, sent_at timestamptz)`, `public.sellers(id uuid, full_name text)`, e os helpers de JWT.
- Produces (consumido na Task 3):
  - `public.service_volume_message_volume(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_granularity text, p_seller_id uuid) → jsonb` shape `{series:[{bucket,sent,received}], totalSent, totalReceived}`.
  - `public.service_volume_messages_by_user(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_seller_id uuid, p_audience text) → jsonb` shape `{rows:[{sellerId,name,authorType,count}], audience}`.
  - `public.service_volume_handle_time(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_seller_id uuid) → jsonb` shape `{averageMs, medianMs, cycleCount, deltaPct}`.

- [ ] **Step 1: Anexar os 3 RPCs de messages + grants ao arquivo**

Append ao final de `supabase/migrations/20260624170000_service_volume_metrics.sql`:

```sql
-- ── Mensagens enviadas vs recebidas (por bucket) ─────────────────────────────
create or replace function public.service_volume_message_volume(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_granularity text default 'day',
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store,
      case when lower(coalesce(nullif(p_granularity, ''), 'day'))
                in ('day', 'week', 'month')
           then lower(coalesce(nullif(p_granularity, ''), 'day'))
           else 'day' end as g
  ),
  base as (
    select m.sent_at, m.direction, g.g
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.sent_at >= p_from and m.sent_at <= p_to
  ),
  bucketed as (
    select case g
             when 'month' then to_char(date_trunc('month', sent_at at time zone 'America/Sao_Paulo'), 'YYYY-MM')
             else to_char(date_trunc(g, sent_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
           end as bucket,
           direction
    from base
  ),
  series as (
    select bucket,
           count(*) filter (where direction = 'out')::int as sent,
           count(*) filter (where direction = 'in')::int as received
    from bucketed group by bucket
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'sent', sent, 'received', received) order by bucket)
      from series), '[]'::jsonb),
    'totalSent', (select count(*)::int from base where direction = 'out'),
    'totalReceived', (select count(*)::int from base where direction = 'in')
  );
$function$;

-- ── Mensagens por atendente (atribuição por responsável da conversa) ──────────
create or replace function public.service_volume_messages_by_user(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_seller_id uuid default null,
  p_audience text default 'all'
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store,
      case when lower(coalesce(nullif(p_audience, ''), 'all'))
                in ('human', 'automation', 'all')
           then lower(coalesce(nullif(p_audience, ''), 'all'))
           else 'all' end as aud
  ),
  base as (
    select m.author_type, c.assigned_seller_id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and m.direction = 'out'
      and m.author_type <> 'customer'
      and m.sent_at >= p_from and m.sent_at <= p_to
  ),
  classified as (
    select case when author_type = 'sdr' then 'automation' else 'human' end as kind,
           assigned_seller_id
    from base
  ),
  filtered as (
    select c.kind, c.assigned_seller_id
    from classified c cross join guard g
    where g.aud = 'all' or g.aud = c.kind
  ),
  human_rows as (
    select f.assigned_seller_id as seller_id,
           coalesce(s.full_name, 'Sem responsável') as name,
           'seller'::text as author_type,
           count(*)::int as count
    from filtered f
    left join public.sellers s on s.id = f.assigned_seller_id
    where f.kind = 'human'
    group by f.assigned_seller_id, s.full_name
  ),
  auto_rows as (
    select null::uuid as seller_id, 'SDR (automação)'::text as name,
           'sdr'::text as author_type, count(*)::int as count
    from filtered where kind = 'automation'
    having count(*) > 0
  ),
  rows as (
    select * from human_rows
    union all
    select * from auto_rows
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sellerId', seller_id, 'name', name, 'authorType', author_type, 'count', count) order by count desc)
      from rows), '[]'::jsonb),
    'audience', (select aud from guard)
  );
$function$;

-- ── Tempo médio de atendimento (proxy last_message_at − created_at) ───────────
create or replace function public.service_volume_handle_time(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_seller_id uuid default null
) returns jsonb
language sql stable security definer set search_path to ''
as $function$
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store
  ),
  durs as (
    select extract(epoch from (c.last_message_at - c.created_at)) * 1000 as ms
    from public.conversations c
    cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and c.created_at >= p_from and c.created_at <= p_to
      and c.last_message_at is not null
  ),
  pos as (select ms from durs where ms > 0)
  select case when (select count(*) from pos) = 0
    then jsonb_build_object('averageMs', 0, 'medianMs', null, 'cycleCount', 0, 'deltaPct', null)
    else jsonb_build_object(
      'averageMs', (select round(avg(ms))::bigint from pos),
      'medianMs', (select round(percentile_cont(0.5) within group (order by ms))::bigint from pos),
      'cycleCount', (select count(*)::int from pos),
      'deltaPct', null
    )
  end;
$function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant execute on function
  public.service_volume_novos_atendimentos(uuid, timestamptz, timestamptz, text, uuid),
  public.service_volume_accumulated_chats(uuid, timestamptz, timestamptz, text, uuid),
  public.service_volume_status_distribution(uuid, uuid),
  public.service_volume_message_volume(uuid, timestamptz, timestamptz, text, uuid),
  public.service_volume_messages_by_user(uuid, timestamptz, timestamptz, uuid, text),
  public.service_volume_handle_time(uuid, timestamptz, timestamptz, uuid)
to authenticated;
```

- [ ] **Step 2: Verificar a lógica de messages contra dados reais (read-only)**

Rode via `mcp__supabase__execute_sql` (somente `SELECT`):

```sql
-- volume enviadas/recebidas, 7d (sem o gate de papel):
with base as (
  select m.sent_at, m.direction
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where ('demo-seed' = any(c.tags)) is not true
    and m.sent_at >= now() - interval '7 days'
)
select count(*) filter (where direction='out') as sent,
       count(*) filter (where direction='in') as received from base;

-- por atendente (humano via assigned_seller), 30d:
select coalesce(s.full_name,'Sem responsável') as name, count(*)::int as count
from public.messages m
join public.conversations c on c.id = m.conversation_id
left join public.sellers s on s.id = c.assigned_seller_id
where ('demo-seed' = any(c.tags)) is not true
  and m.direction='out' and m.author_type not in ('sdr','customer')
  and m.sent_at >= now() - interval '30 days'
group by 1 order by count desc limit 10;
```

Expected: `sent`/`received` inteiros > 0; o breakdown por atendente lista nomes reais com contagens decrescentes (e possivelmente uma linha "Sem responsável").

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260624170000_service_volume_metrics.sql
git commit -m "feat(prd-214): message-based service-volume RPCs (volume, by-user, handle-time) + grants"
```

---

## Task 3: Provider swap (placeholder → `.rpc()`) com teste de mapping

**Files:**
- Modify: `src/providers/data/impl/supabase/atendimentoMetrics.ts`
- Test: `src/providers/data/impl/supabase/atendimentoMetrics.test.ts`

**Interfaces:**
- Consumes: as 6 funções da Task 1/2 (nomes/params acima); `getSupabaseClient` de `@/shared/lib/supabase`; contrato `IAtendimentoMetricsProvider`.
- Produces: `supabaseAtendimentoMetricsProvider` real (consumido pelo factory existente — registro **não muda**).

- [ ] **Step 1: Escrever o teste de mapping (falhando)**

Create `src/providers/data/impl/supabase/atendimentoMetrics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));

import { supabaseAtendimentoMetricsProvider as P } from "./atendimentoMetrics";

const PARAMS = { storeId: "store-1", sellerId: undefined, from: "2026-06-01T00:00:00Z", to: "2026-06-07T00:00:00Z", granularity: "day" as const };

beforeEach(() => rpc.mockReset());

describe("supabaseAtendimentoMetricsProvider", () => {
  it("getNovosAtendimentos calls the RPC with mapped params and returns the jsonb shape", async () => {
    const payload = { series: [{ bucket: "2026-06-01", value: 3 }], total: 3, averagePerDay: 0.4, deltaPct: 10, historyStartsAt: null };
    rpc.mockResolvedValue({ data: payload, error: null });
    const out = await P.getNovosAtendimentos(PARAMS);
    expect(rpc).toHaveBeenCalledWith("service_volume_novos_atendimentos", {
      p_store_id: "store-1", p_from: PARAMS.from, p_to: PARAMS.to, p_granularity: "day", p_seller_id: null,
    });
    expect(out).toEqual(payload);
  });

  it("maps undefined storeId/sellerId to null params", async () => {
    rpc.mockResolvedValue({ data: { slices: [], total: 0 }, error: null });
    await P.getStatusDistribution({ ...PARAMS, storeId: undefined });
    expect(rpc).toHaveBeenCalledWith("service_volume_status_distribution", { p_store_id: null, p_seller_id: null });
  });

  it("passes audience to messages_by_user", async () => {
    rpc.mockResolvedValue({ data: { rows: [], audience: "human" }, error: null });
    await P.getMessagesByUser({ ...PARAMS, audience: "human" });
    expect(rpc).toHaveBeenCalledWith("service_volume_messages_by_user", {
      p_store_id: "store-1", p_from: PARAMS.from, p_to: PARAMS.to, p_seller_id: null, p_audience: "human",
    });
  });

  it("returns the empty fallback when data is null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const out = await P.getMessageVolume(PARAMS);
    expect(out).toEqual({ series: [], totalSent: 0, totalReceived: 0 });
  });

  it("throws when the RPC returns an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(P.getHandleTimeStats(PARAMS)).rejects.toThrow(/service_volume_handle_time: boom/);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun run test src/providers/data/impl/supabase/atendimentoMetrics.test.ts`
Expected: FAIL (o provider ainda é o placeholder — chama-se nada via `rpc`, asserts de `toHaveBeenCalledWith` falham).

- [ ] **Step 3: Implementar o provider real**

Replace todo o conteúdo de `src/providers/data/impl/supabase/atendimentoMetrics.ts`:

```ts
import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";
import type {
  INovosAtendimentosResult,
  IMessageVolumeResult,
  IMessagesByUserResult,
  IStatusDistributionResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * PRD-214 — real Supabase impl of the service-volume metrics provider.
 * Each method is a thin passthrough over a SECURITY DEFINER RPC that returns the
 * contract shape as jsonb (built server-side). The RPC enforces the role gate +
 * store scope + demo-seed exclusion; this layer only maps params and casts.
 */
async function callRpc<T>(
  name: string,
  params: Record<string, unknown>,
  fallback: T,
): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data as T | null) ?? fallback;
}

export const supabaseAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
  async getNovosAtendimentos({ storeId, sellerId, from, to, granularity }) {
    return callRpc<INovosAtendimentosResult>(
      "service_volume_novos_atendimentos",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_granularity: granularity, p_seller_id: sellerId ?? null },
      { series: [], total: 0, averagePerDay: 0, deltaPct: null, historyStartsAt: null },
    );
  },

  async getMessageVolume({ storeId, sellerId, from, to, granularity }) {
    return callRpc<IMessageVolumeResult>(
      "service_volume_message_volume",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_granularity: granularity, p_seller_id: sellerId ?? null },
      { series: [], totalSent: 0, totalReceived: 0 },
    );
  },

  async getMessagesByUser({ storeId, sellerId, from, to, audience }) {
    return callRpc<IMessagesByUserResult>(
      "service_volume_messages_by_user",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_seller_id: sellerId ?? null, p_audience: audience },
      { rows: [], audience },
    );
  },

  async getStatusDistribution({ storeId, sellerId }) {
    return callRpc<IStatusDistributionResult>(
      "service_volume_status_distribution",
      { p_store_id: storeId ?? null, p_seller_id: sellerId ?? null },
      { slices: [], total: 0 },
    );
  },

  async getAccumulatedChats({ storeId, sellerId, from, to, granularity }) {
    return callRpc<IAccumulatedChatsResult>(
      "service_volume_accumulated_chats",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_granularity: granularity, p_seller_id: sellerId ?? null },
      { series: [], total: 0 },
    );
  },

  async getHandleTimeStats({ storeId, sellerId, from, to }) {
    return callRpc<IHandleTimeStatsResult>(
      "service_volume_handle_time",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_seller_id: sellerId ?? null },
      { averageMs: 0, medianMs: null, cycleCount: 0, deltaPct: null },
    );
  },
};
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun run test src/providers/data/impl/supabase/atendimentoMetrics.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/atendimentoMetrics.ts src/providers/data/impl/supabase/atendimentoMetrics.test.ts
git commit -m "feat(prd-214): real supabase atendimentoMetrics provider (rpc passthrough)"
```

---

## Task 4: Copy honesta — empty-state + "primeiro contato"

**Files:**
- Modify: `src/features/service-volume/i18n/pt-BR.ts`
- Modify: `src/features/service-volume/pages/ServiceVolumePage.tsx`

**Interfaces:**
- Consumes: `SERVICE_VOLUME_STRINGS` (objeto `as const`).
- Produces: chaves renomeadas/ajustadas consumidas por `ServiceVolumePage` e `ServiceVolumeKpis`.

- [ ] **Step 1: Ajustar as strings**

Em `src/features/service-volume/i18n/pt-BR.ts`, troque duas linhas. De:

```ts
  kpiNovosHelp: "1º contato + reaberturas no período",
```
para:
```ts
  kpiNovosHelp: "Primeiro contato de cada conversa no período",
```

E de:
```ts
  prodPlaceholder: "Métricas em implantação — disponíveis em breve.",
```
para:
```ts
  emptyAll: "Sem dados de atendimento no período selecionado.",
```

- [ ] **Step 2: Atualizar a referência na página**

Em `src/features/service-volume/pages/ServiceVolumePage.tsx`, na linha do aviso (`isEmptyEverywhere`), troque `SERVICE_VOLUME_STRINGS.prodPlaceholder` por `SERVICE_VOLUME_STRINGS.emptyAll`:

```tsx
      {isEmptyEverywhere && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {SERVICE_VOLUME_STRINGS.emptyAll}
        </div>
      )}
```

- [ ] **Step 3: Verificar build + ausência de referência órfã**

Run: `bun run build`
Expected: build OK (sem erro de propriedade inexistente).

Run: `grep -rn "prodPlaceholder" src/`
Expected: nenhum resultado (chave removida e referência atualizada).

- [ ] **Step 4: Commit**

```bash
git add src/features/service-volume/i18n/pt-BR.ts src/features/service-volume/pages/ServiceVolumePage.tsx
git commit -m "fix(prd-214): honest copy — first-contact help text + real empty-state notice"
```

---

## Task 5: Gate final + PR

**Files:** nenhum (verificação + PR).

- [ ] **Step 1: Suíte completa + build**

Run: `bun run test`
Expected: tudo verde (inclui os 5 novos testes do provider; nada do 215 quebra).

Run: `bun run build`
Expected: build limpo.

- [ ] **Step 2: Push + PR (NÃO mergear)**

```bash
git push -u origin feat/prd214-service-volume-supabase
gh pr create --repo edmilson-prog/gallo-basediesel --base main \
  --title "feat(prd-214): service-volume Supabase foundation (read-only)" \
  --body "Substitui o placeholder vazio do provider atendimentoMetrics por 6 RPCs SECURITY DEFINER read-only. Spec: docs/superpowers/specs/2026-06-24-prd214-service-volume-supabase-design.md. Migration aplicada manualmente em prod via MCP (Task 6). O dono merga."
```

---

## Task 6: Deploy em produção (ORQUESTRADOR + dono — não-subagente)

> Executado pelo orquestrador **após** as Tasks 1–5 e **com confirmação explícita do dono**. Subagentes não aplicam DDL.

- [ ] **Step 1: Confirmar com o dono** a aplicação da migration `20260624170000_service_volume_metrics.sql` em produção.

- [ ] **Step 2: Aplicar via MCP** (`mcp__supabase__execute_sql`), em transação, o conteúdo exato do arquivo `.sql` + registro de versão:

```sql
begin;
-- (conteúdo integral de supabase/migrations/20260624170000_service_volume_metrics.sql)
insert into supabase_migrations.schema_migrations (version, name)
values ('20260624170000', 'service_volume_metrics')
on conflict (version) do nothing;
commit;
```

- [ ] **Step 3: Verificação pós-deploy** (read-only).

(a) As 6 funções existem:

```sql
select proname from pg_proc
where proname like 'service_volume_%' order by proname;  -- espera 6 linhas
```

(b) **Simular um owner** (o RPC chamado via MCP roda como `service_role`, então `current_app_role()` seria null e o gate devolveria vazio). `current_app_role()` lê `auth.jwt()->'app_metadata'->>'role'`, e `auth.jwt()` lê o GUC `request.jwt.claims`. Numa transação descartável, setar o claim e chamar o RPC:

```sql
begin;
select set_config('request.jwt.claims', '{"app_metadata":{"role":"owner"}}', true);
select public.service_volume_novos_atendimentos(null, now() - interval '30 days', now(), 'day', null) as novos,
       public.service_volume_status_distribution(null, null) as status;
rollback;
```

Expected: `novos` traz `series`/`total`/`averagePerDay` reais (>0); `status` traz as fatias com os 4 status presentes. Comparar `total` ao agregado à mão da Task 1 Step 2 na mesma janela — devem bater.

- [ ] **Step 4:** Dono merga o PR; depois, **version bump** à parte (MINOR + codinome).

---

## Self-Review (coverage do spec)

- **§5 (6 RPCs):** Task 1 (novos, accumulated, status) + Task 2 (volume, by-user, handle-time). ✓
- **§3.2 primeiro contato / §3.4 bucket SP / §3.5 deltaPct / §3.6 proxy / §3.7 demo-seed:** embutidos no SQL das Tasks 1–2. ✓
- **§3.3 atribuição por assigned_seller + "Sem responsável" + automação:** Task 2 `messages_by_user`. ✓
- **§6 permissão (owner cross-store / gestor travado / gate):** CTE `guard` em todos os RPCs. ✓
- **§7 swap do provider (identidade) + averagePerDay no RPC:** Task 3. ✓
- **§7 copy "(primeiro contato)" + desligar aviso:** Task 4. ✓
- **§8 migration espelhada / ordem de deploy / testes:** Tasks 1–2 (arquivo), Task 3 (Vitest), Task 6 (apply+verify). ✓
- **§9 camada congelada:** nenhuma task toca cache/realtime/RPC gated-once. ✓
- **Excluído (event log/trigger, atendimento_cycles):** nenhuma task os implementa. ✓
```
