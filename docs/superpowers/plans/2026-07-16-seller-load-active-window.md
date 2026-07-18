# Carga por vendedor v2 (recorte de atividade) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O card "Carga por vendedor" passa a contar apenas conversas abertas com atividade (`last_message_at`) dentro do período selecionado na aba (24h/7d/30d/custom).

**Architecture:** Estende a RPC `service_volume_seller_load` com `p_from`/`p_to` opcionais (null = sem recorte, compatível com o frontend deployado); o hook `useSellerLoad` passa a janela da aba; mock espelha o filtro. Spec: `docs/superpowers/specs/2026-07-16-seller-load-active-window-design.md`.

**Tech Stack:** Postgres plpgsql (Supabase), TypeScript/React, TanStack Query, Vitest, Bun.

## Global Constraints

- Migration espelhada em `supabase/migrations/` no mesmo PR; aplicação em prod é manual via MCP, **antes** do merge, com aprovação explícita do dono.
- A função antiga de 2 parâmetros DEVE ser dropada (overload quebra o PostgREST por ambiguidade).
- Copy de UI em pt-BR com acentos corretos.
- Gate de CI prático: `bun run test` + `bun run build`; tipos por delta com `bunx tsc --noEmit`.
- Verificação empírica pré-prod: SQL (guard com literais) ≡ referência JS service-role, janelas 24h/7d/30d.

---

### Task 1: Migration — RPC com janela opcional

**Files:**
- Create: `supabase/migrations/20260716210000_seller_load_active_window.sql`

**Interfaces:**
- Produces: `public.service_volume_seller_load(p_store_id uuid, p_seller_id uuid default null, p_from timestamptz default null, p_to timestamptz default null) returns jsonb` — shape `{rows: [{sellerId, activeCount}]}` inalterado.

- [ ] **Step 1: Escrever a migration**

```sql
-- Carga por vendedor v2 — the card now counts only OPEN conversations with
-- activity (last_message_at) inside the tab's selected window, instead of the
-- whole accumulated backlog (spec:
-- docs/superpowers/specs/2026-07-16-seller-load-active-window-design.md).
--
-- p_from/p_to are optional (null = no cut) so the already-deployed frontend
-- keeps working between migration apply and deploy. The 2-arg function MUST
-- be dropped first: re-creating with a different arity would register an
-- OVERLOAD and PostgREST named calls become ambiguous.

drop function if exists public.service_volume_seller_load(uuid, uuid);

create or replace function public.service_volume_seller_load(
  p_store_id uuid,
  p_seller_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare
  result jsonb;
begin
  with guard as (
    select
      public.current_app_role() as role,
      case when public.current_app_role() = 'manager'
           then public.current_store_id() else p_store_id end as eff_store
  ),
  loads as (
    select c.assigned_seller_id as seller_id, count(*)::int as active_count
    from public.conversations c cross join guard g
    where g.role in ('owner', 'manager')
      and (g.eff_store is null or c.store_id = g.eff_store)
      and (p_seller_id is null or c.assigned_seller_id = p_seller_id)
      and ('demo-seed' = any(c.tags)) is not true
      and c.status in ('aguardando', 'em_andamento', 'aguardando_cliente')
      and c.assigned_seller_id is not null
      and (p_from is null or c.last_message_at >= p_from)
      and (p_to is null or c.last_message_at <= p_to)
    group by c.assigned_seller_id
  )
  select jsonb_build_object(
    'rows', coalesce(
      (select jsonb_agg(
         jsonb_build_object('sellerId', seller_id, 'activeCount', active_count)
         order by active_count desc, seller_id)
       from loads),
      '[]'::jsonb)
  )
  into result;
  return result;
end;
$function$;

grant execute on function
  public.service_volume_seller_load(uuid, uuid, timestamptz, timestamptz)
to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260716210000_seller_load_active_window.sql
git commit -m "feat(service-volume): seller-load RPC accepts optional activity window"
```

### Task 2: Tipos + provider supabase (TDD)

**Files:**
- Modify: `src/shared/types/service-volume.ts` (interface `ISellerLoadParams`)
- Modify: `src/providers/data/impl/supabase/atendimentoMetrics.ts` (`getSellerLoad`)
- Test: `src/providers/data/impl/supabase/atendimentoMetrics.test.ts`

**Interfaces:**
- Consumes: RPC da Task 1.
- Produces: `ISellerLoadParams = { storeId?: ID; sellerId?: ID; from?: ISO8601; to?: ISO8601 }`; `getSellerLoad` envia `p_from`/`p_to` (`?? null`).

- [ ] **Step 1: Atualizar o teste existente para o novo contrato (falhando)**

Substituir o teste `getSellerLoad calls the RPC with mapped params and falls back to empty rows` por:

```ts
  it("getSellerLoad maps the optional window to p_from/p_to (null when absent)", async () => {
    const payload = { rows: [{ sellerId: "s1", activeCount: 4 }] };
    rpc.mockResolvedValue({ data: payload, error: null });
    const out = await P.getSellerLoad({ storeId: "store-1", from: PARAMS.from, to: PARAMS.to });
    expect(rpc).toHaveBeenCalledWith("service_volume_seller_load", {
      p_store_id: "store-1",
      p_seller_id: null,
      p_from: PARAMS.from,
      p_to: PARAMS.to,
    });
    expect(out).toEqual(payload);

    rpc.mockResolvedValue({ data: null, error: null });
    expect(await P.getSellerLoad({})).toEqual({ rows: [] });
    expect(rpc).toHaveBeenLastCalledWith("service_volume_seller_load", {
      p_store_id: null,
      p_seller_id: null,
      p_from: null,
      p_to: null,
    });
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/providers/data/impl/supabase/atendimentoMetrics.test.ts`
Expected: FAIL (chamada atual não envia `p_from`/`p_to`).

- [ ] **Step 3: Implementar tipo + provider**

Em `src/shared/types/service-volume.ts`:

```ts
/** "Carga por vendedor" — conversas abertas; janela de atividade opcional. */
export interface ISellerLoadParams {
  storeId?: ID;
  sellerId?: ID;
  from?: ISO8601;
  to?: ISO8601;
}
```

Em `src/providers/data/impl/supabase/atendimentoMetrics.ts`:

```ts
  async getSellerLoad({ storeId, sellerId, from, to }) {
    return callRpc<ISellerLoadCountsResult>(
      "service_volume_seller_load",
      {
        p_store_id: storeId ?? null,
        p_seller_id: sellerId ?? null,
        p_from: from ?? null,
        p_to: to ?? null,
      },
      { rows: [] },
    );
  },
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `bunx vitest run src/providers/data/impl/supabase/atendimentoMetrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/service-volume.ts src/providers/data/impl/supabase/atendimentoMetrics.ts src/providers/data/impl/supabase/atendimentoMetrics.test.ts
git commit -m "feat(service-volume): seller-load provider passes the activity window"
```

### Task 3: Mock provider com filtro de janela (TDD)

**Files:**
- Modify: `src/providers/data/impl/mock/atendimentoMetrics.ts` (`getSellerLoad`)
- Test: `src/providers/data/impl/mock/atendimentoMetrics.test.ts`

**Interfaces:**
- Consumes: `ISellerLoadParams` da Task 2; helpers locais `scopedConversations`, `inRange`, `OPEN_STATUSES`.

- [ ] **Step 1: Teste falhando — janela no passado zera as contagens**

Adicionar ao describe existente:

```ts
  it("getSellerLoad: janela de atividade filtra por lastMessageAt", async () => {
    const all = await p.getSellerLoad({});
    const windowed = await p.getSellerLoad({ from: params.from, to: params.to });
    expect(windowed).toEqual(all); // janela 2000–2100 cobre tudo
    const none = await p.getSellerLoad({
      from: "1900-01-01T00:00:00Z",
      to: "1900-12-31T00:00:00Z",
    });
    expect(none.rows).toEqual([]);
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/providers/data/impl/mock/atendimentoMetrics.test.ts`
Expected: FAIL (`none.rows` vem populado — janela é ignorada hoje).

- [ ] **Step 3: Implementar o filtro**

Em `getSellerLoad` do mock:

```ts
  async getSellerLoad({ storeId, sellerId, from, to }) {
    const counts = new Map<string, number>();
    for (const c of scopedConversations(storeId, sellerId)) {
      if (!OPEN_STATUSES.has(c.status) || !c.assignedSellerId) continue;
      if (from && to && !inRange(c.lastMessageAt, from, to)) continue;
      counts.set(c.assignedSellerId, (counts.get(c.assignedSellerId) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([id, activeCount]) => ({ sellerId: id, activeCount }))
      .sort((a, b) => b.activeCount - a.activeCount || a.sellerId.localeCompare(b.sellerId));
    return { rows };
  },
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `bunx vitest run src/providers/data/impl/mock/atendimentoMetrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/mock/atendimentoMetrics.ts src/providers/data/impl/mock/atendimentoMetrics.test.ts
git commit -m "feat(service-volume): mock seller-load honors the activity window"
```

### Task 4: Hook + copy do card

**Files:**
- Modify: `src/features/service-volume/hooks/useSellerLoad.ts` (queryKey + params)
- Modify: `src/features/service-volume/i18n/pt-BR.ts:30-32` (subtítulo + InfoHint)

**Interfaces:**
- Consumes: `getSellerLoad({ storeId, from, to })` da Task 2; `state.fromIso`/`state.toIso` de `IServiceVolumeState`.

- [ ] **Step 1: Passar a janela no hook**

Em `useSellerLoad.ts`, trocar o `loadQuery` por:

```ts
  const loadQuery = useQuery({
    queryKey: ["sv", "sellerLoad", storeId ?? "all", state.fromIso, state.toIso, debouncedTick],
    queryFn: () =>
      provider.getSellerLoad({ storeId, from: state.fromIso, to: state.toIso }),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
  });
```

E no doc-comment do hook, registrar que a contagem obedece à janela da aba.

- [ ] **Step 2: Atualizar a copy**

Em `src/features/service-volume/i18n/pt-BR.ts`:

```ts
  sellerLoadSubtitle: "Conversas abertas com atividade no período selecionado",
  sellerLoadHelp:
    "Quantas conversas abertas (aguardando + em andamento) cada vendedor tem com alguma mensagem dentro do período selecionado, somando todos os números de WhatsApp que ele atende. Conversas paradas fora do período e as já resolvidas não entram na conta. Ajuda a identificar sobrecarga e equilibrar a distribuição da equipe.",
```

- [ ] **Step 3: Suíte completa + build + tsc por delta**

Run: `bun run test` → Expected: tudo verde.
Run: `bun run build` → Expected: sucesso (descartar touch de `src/routeTree.gen.ts` se aparecer).
Run: `bunx tsc --noEmit | grep -E "useSellerLoad|atendimentoMetrics|service-volume"` → Expected: nenhum erro novo (baseline pré-existente não conta).

- [ ] **Step 4: Commit**

```bash
git add src/features/service-volume/hooks/useSellerLoad.ts src/features/service-volume/i18n/pt-BR.ts
git commit -m "feat(service-volume): seller-load card follows the tab period filter"
```

### Task 5: Verificação empírica + rollout gated

**Files:**
- Create (scratchpad, fora do repo): script de referência JS service-role.

- [ ] **Step 1: Referência JS vs corpo SQL (pré-prod)**

Referência JS (service-role, chave `SUPABASE_SERVICE_ROLE_KEY` do `.env.local` da raiz principal): contar conversas abertas atribuídas com `last_message_at` na janela, por vendedor, janelas 24h/7d/30d. Comparar com o corpo SQL da Task 1 (guard substituído por literais) via `mcp__supabase__execute_sql`. Expected: igualdade exata por vendedor nas 3 janelas.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/seller-load-active-window
gh pr create --title "feat(service-volume): seller-load card follows the tab period filter" --body "<resumo + verificação>"
```

- [ ] **Step 3: Gates com o dono (AskUserQuestion)**

1. Aplicar a migration em prod (via `mcp__supabase__apply_migration`) — verificar pós-aplicação como `authenticated` owner (claims `app_metadata.role`) + papel seller vazio + latência.
2. Mergear o PR (deploy Vercel; confirmar `version.json` com o novo buildId).
