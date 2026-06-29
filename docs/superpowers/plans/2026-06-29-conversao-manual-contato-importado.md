# Conversão Manual de Contato Importado → Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir promover um contato importado do WhatsApp (`pending_review`, sem dono, só no Atendimento) a **cliente de fato** — ou descartá-lo como "não é cliente" — por quem tem acesso à conversa (ficha) ou pela gestão (fila dedicada).

**Architecture:** Duas RPCs `SECURITY DEFINER` (`convert_pending_contact`, `mark_contact_not_customer`) gated por `is_staff()` OU acesso à conversa (`can_access_conversation`) são a única porta que muta um contato sem dono — a RLS de `customers_update` fica intocada. O Provider Pattern ganha 2 métodos (supabase chama as RPCs; mock muta o store). A UI: faixa de alerta na ficha do Atendimento (auto-contida, com os dois diálogos) + fila staff-only `/app/atendimento/contatos-pendentes` com seletor de 3 visualizações.

**Tech Stack:** React 19, TanStack Router (file-based) + Query, Zustand (mock store), Supabase (Postgres + RLS + RPC), Tailwind v4 + shadcn/ui, Vitest, bun.

## Global Constraints

- **Provider Pattern:** features acessam dados só via `@/providers/data` (hooks `useXxxProvider`). Nunca importar `@/mocks` nem `impl/*` fora das camadas permitidas (ESLint barra).
- **🔒 Cache do Atendimento (#137) CONGELADO:** não tocar em signing de mídia em lote, Realtime, nem nas query keys de **mensagens**. A invalidação desta feature é só nas chaves de **customer** e **conversation-detail** (disjuntas das de mensagens/mídia).
- **Migration versionada + aplicada manual:** toda migration vai em `supabase/migrations/` E é aplicada em prod via MCP `apply_migration` **com OK explícito do dono** (o workflow de migração é no-op). A migration é aplicada **ANTES do merge** (o CI `rls-regression` roda contra o banco de produção — lição do PR #194).
- **RLS `customers_update` permanece intocada.** A mutação de contato sem dono só ocorre via as RPCs `SECURITY DEFINER`.
- **Tipos reais do banco (confirmados):** `customers.id`/`seller_id`/`store_id` = `uuid`; `customers.tags` = `text[]` NOT NULL; `audit_logs.id`/`store_id`/`actor_id` = `uuid` NOT NULL, `resource_id` = `text` NOT NULL; `conversations.id`/`customer_id`/`assigned_seller_id`/`whatsapp_account_id` = `uuid`; `sellers.id` = `uuid`.
- **Tag de descarte:** `reviewed_not_customer`. `HIDDEN_CUSTOMER_TAGS = ['pending_review', 'reviewed_not_customer']`.
- **Convenções:** TS `strict`, sem `any`; interfaces `I`-prefixed; UI/strings em **pt-BR com acentos**; comentários em inglês; Conventional Commits atômicos terminando em `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Gate por task:** `bun run test` (verde) e/ou `bunx tsc --noEmit` (sem **novos** erros — baseline ~334) e/ou `bun run build` (verde). Branch de trabalho: `feat/conversao-contato-importado` (NÃO mergear sem OK; integração via PR).

---

## File Structure

**Backend (SQL)**
- Create `supabase/migrations/20260629HHMMSS_convert_pending_contact_rpcs.sql` — 2 RPCs + grants.
- Modify `supabase/tests/rls-regression.sql` — casos novos (antes do `select 'ALL ...'`/`rollback`).

**Camada de dados**
- Modify `src/providers/data/contracts/customers.ts` — `IConvertPendingContactInput` + 2 métodos.
- Modify `src/providers/data/impl/supabase/customers.ts` — 2 métodos (`.rpc`) + filtro `tags`/`tag` include.
- Modify `src/mocks/api/customers.ts` — `convertPendingContact`/`markContactNotCustomer` no `customersApi`.
- Modify `src/providers/data/impl/mock/customers.ts` — expor os 2 métodos no `mockCustomersProvider`.
- Modify `src/features/customers/utils/listFilters.ts` — `HIDDEN_CUSTOMER_TAGS`.

**Feature `src/features/contact-review/` (nova)**
- `engine/validateConversion.ts` (+ `.test.ts`) — validação + mapeamento de input (puro, TDD).
- `i18n/pt-BR.ts` — `CONTACT_REVIEW_STRINGS`.
- `hooks/useContactConversion.ts` — mutações + invalidação.
- `hooks/usePendingContacts.ts` — query da fila.
- `components/ConvertContactDialog.tsx` — modal (layout A coluna única).
- `components/MarkNotCustomerDialog.tsx` — confirmação de descarte.
- `components/PendingContactBanner.tsx` — faixa A (auto-contida).
- `components/PendingContactsTable.tsx` / `PendingContactsCards.tsx` / `PendingContactsSplit.tsx` — 3 views.
- `pages/PendingContactsPage.tsx` — header + busca + seletor de view.
- `index.ts` — barrel.

**Integração**
- Modify `src/features/customers/components/ProfileHeader.tsx` — inserir `<PendingContactBanner>`.
- Create `src/routes/app.atendimento_.contatos-pendentes.tsx` — rota staff (não-aninhada).
- Modify `src/features/shell/config/routes.ts` — `APP_CONTATOS_PENDENTES`.
- Modify `src/features/shell/config/navigation.ts` — item de nav staff.

---

## FASE A — Backend (SQL)

### Task 1: Migration com as duas RPCs

**Files:**
- Create: `supabase/migrations/20260629HHMMSS_convert_pending_contact_rpcs.sql` (substitua `HHMMSS` por um timestamp; ex.: `20260629120000`)

**Interfaces:**
- Produces: `public.convert_pending_contact(uuid,text,text,text,text,text,text,text,uuid) returns setof public.customers` e `public.mark_contact_not_customer(uuid) returns setof public.customers`.

- [ ] **Step 1: Escrever a migration** (conteúdo completo do arquivo):

```sql
-- Conversão manual de contato importado (pending_review) → cliente, e descarte.
-- Duas RPCs SECURITY DEFINER, gated por is_staff() OU acesso à conversa
-- (can_access_conversation), espelhando o padrão de public.transfer_conversation.
-- São a única porta que muta um contato sem dono; a RLS de customers_update
-- permanece intocada. Tudo numa transação atômica + trilha em audit_logs.

create or replace function public.convert_pending_contact(
  p_customer_id uuid,
  p_type text,
  p_full_name text default null,
  p_cpf text default null,
  p_razao_social text default null,
  p_nome_fantasia text default null,
  p_cnpj text default null,
  p_contact_name text default null,
  p_seller_id uuid default null
)
returns setof public.customers
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_cust public.customers;
  v_target uuid;
begin
  select * into v_cust from public.customers where id = p_customer_id;
  if not found then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  if v_cust.store_id is distinct from v_store then
    raise exception 'not allowed to convert this contact' using errcode = '42501';
  end if;

  -- Authorization: staff OR has access to a conversation anchored on this customer.
  if not (
    public.is_staff()
    or exists (
      select 1 from public.conversations c
      where c.customer_id = p_customer_id
        and public.can_access_conversation(c.id)
    )
  ) then
    raise exception 'not allowed to convert this contact' using errcode = '42501';
  end if;

  -- Idempotency / race guard: must still be a pending contact.
  if not (v_cust.tags @> array['pending_review']) then
    raise exception 'contact is not pending review' using errcode = '22023';
  end if;

  if p_type not in ('B2C', 'B2B') then
    raise exception 'invalid type %', p_type using errcode = '22023';
  end if;

  -- Wallet owner: non-staff always becomes the owner; staff may pick another.
  if public.is_staff() then
    v_target := coalesce(p_seller_id, v_seller);
  else
    v_target := v_seller;
  end if;

  -- Validate the target seller (when set) belongs to the store and is active.
  if v_target is not null and not exists (
    select 1 from public.sellers s
    where s.id = v_target and s.store_id = v_store and coalesce(s.active, true)
  ) then
    raise exception 'invalid wallet owner' using errcode = '22023';
  end if;

  -- Apply identity + owner, dropping ONLY the pending_review tag (preserve others).
  return query
    update public.customers
       set type = p_type,
           seller_id = v_target,
           full_name = case when p_type = 'B2C' then p_full_name else full_name end,
           cpf = case when p_type = 'B2C' then p_cpf else cpf end,
           razao_social = case when p_type = 'B2B' then p_razao_social else razao_social end,
           nome_fantasia = case when p_type = 'B2B' then p_nome_fantasia else nome_fantasia end,
           cnpj = case when p_type = 'B2B' then p_cnpj else cnpj end,
           contact_name = case when p_type = 'B2B' then p_contact_name else contact_name end,
           tags = array_remove(tags, 'pending_review')
     where id = p_customer_id
    returning *;

  -- Audit (best-effort: actor_id is NOT NULL → only when caller maps to a seller).
  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (
      gen_random_uuid(), v_store, v_seller,
      'convert_pending_contact', 'customer', p_customer_id::text,
      jsonb_build_object('tags', v_cust.tags, 'seller_id', v_cust.seller_id, 'type', v_cust.type),
      jsonb_build_object('seller_id', v_target, 'type', p_type)
    );
  end if;
end;
$$;

create or replace function public.mark_contact_not_customer(p_customer_id uuid)
returns setof public.customers
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_cust public.customers;
begin
  select * into v_cust from public.customers where id = p_customer_id;
  if not found then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  if v_cust.store_id is distinct from v_store then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not (
    public.is_staff()
    or exists (
      select 1 from public.conversations c
      where c.customer_id = p_customer_id
        and public.can_access_conversation(c.id)
    )
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not (v_cust.tags @> array['pending_review']) then
    raise exception 'contact is not pending review' using errcode = '22023';
  end if;

  return query
    update public.customers
       set tags = (
             select array(
               select distinct t
               from unnest(array_remove(tags, 'pending_review') || array['reviewed_not_customer']) as t
             )
           )
     where id = p_customer_id
    returning *;

  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (
      gen_random_uuid(), v_store, v_seller,
      'mark_contact_not_customer', 'customer', p_customer_id::text,
      jsonb_build_object('tags', v_cust.tags),
      jsonb_build_object('tags', 'reviewed_not_customer')
    );
  end if;
end;
$$;

grant execute on function public.convert_pending_contact(uuid,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.mark_contact_not_customer(uuid) to authenticated;
```

- [ ] **Step 2: Validar a sintaxe localmente sem aplicar** (não há OK para prod ainda). Confira visualmente que: assinaturas batem com os tipos reais, `search_path` vazio, `returning *` antes do `insert audit`. NÃO rode `apply_migration` aqui — a aplicação é o Rollout (fim do plano), com OK do dono.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260629HHMMSS_convert_pending_contact_rpcs.sql
git commit -m "feat(db): RPCs convert_pending_contact e mark_contact_not_customer"
```

---

### Task 2: Casos de regressão de RLS

**Files:**
- Modify: `supabase/tests/rls-regression.sql` (inserir **antes** da linha `select 'ALL RLS REGRESSION TESTS PASSED' as result;`)

**Interfaces:**
- Consumes: `public.convert_pending_contact(...)`, `public.mark_contact_not_customer(...)` da Task 1. Identidades já usadas no arquivo: owner (`seller_id 57706ecc-…`), lucas não-staff (`seller_id 5a6400ed-…`), store `00000000-0000-0000-0000-000000000001`.

- [ ] **Step 1: Inserir o bloco de teste** (antes do `select 'ALL ...'`):

```sql
-- ---------------------------------------------------------------------------
-- Conversão manual de contato pendente (convert_pending_contact / mark_contact_not_customer).
-- Gated por is_staff() OU acesso à conversa. Guard: pula até a migration existir.
-- Fixtures criados como owner; convertidos como lucas (não-staff). Rolled back com a suíte.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $conv$
declare
  anchor_ok uuid := gen_random_uuid();   -- tem conversa acessível ao lucas
  anchor_no uuid := gen_random_uuid();   -- sem conversa → lucas não acessa
  conv_ok uuid := gen_random_uuid();
begin
  if to_regprocedure('public.convert_pending_contact(uuid,text,text,text,text,text,text,text,uuid)') is null then
    return; -- migration ainda não aplicada em prod; pula (ver Rollout).
  end if;
  insert into public.customers (id, store_id, type, phone, full_name, seller_id, status, tags)
    values (anchor_ok, '00000000-0000-0000-0000-000000000001', 'B2C', '+550000000291', '+550000000291', null, 'ativo', array['pending_review']),
           (anchor_no, '00000000-0000-0000-0000-000000000001', 'B2C', '+550000000292', '+550000000292', null, 'ativo', array['pending_review']);
  -- Conversa atribuída ao lucas, sem número (whatsapp_account_id null) → can_access_conversation = true para ele.
  insert into public.conversations (id, store_id, customer_id, assigned_seller_id, whatsapp_account_id, channel, status, last_message_at)
    values (conv_ok, '00000000-0000-0000-0000-000000000001', anchor_ok, '5a6400ed-5aec-4bf1-b641-31635f15c887', null, 'whatsapp', 'aguardando', now());
  perform set_config('conv.anchor_ok', anchor_ok::text, true);
  perform set_config('conv.anchor_no', anchor_no::text, true);
end $conv$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $conv$
declare
  anchor_ok uuid := nullif(current_setting('conv.anchor_ok', true), '')::uuid;
  anchor_no uuid := nullif(current_setting('conv.anchor_no', true), '')::uuid;
  v_seller uuid;
  v_tags text[];
begin
  if anchor_ok is null then
    return; -- migration não aplicada (fixtures não criados); pula.
  end if;

  -- (1) Não-staff COM acesso à conversa: converte com sucesso e vira o dono.
  perform public.convert_pending_contact(anchor_ok, 'B2C', 'Cliente Convertido', null, null, null, null, null, null);
  select seller_id, tags into v_seller, v_tags from public.customers where id = anchor_ok;
  if v_seller is distinct from '5a6400ed-5aec-4bf1-b641-31635f15c887'::uuid then
    raise exception 'convert: non-staff converter must become the wallet owner';
  end if;
  if v_tags @> array['pending_review'] then
    raise exception 'convert: pending_review tag must be removed after conversion';
  end if;

  -- (2) Idempotência: converter de novo deve falhar (já não é pendente).
  begin
    perform public.convert_pending_contact(anchor_ok, 'B2C', 'X', null, null, null, null, null, null);
    raise exception 'convert: second conversion should be rejected (not pending)';
  exception when others then
    if sqlstate <> '22023' then raise; end if; -- esperado: 22023
  end;

  -- (3) Não-staff SEM conversa acessível: negado (42501).
  begin
    perform public.convert_pending_contact(anchor_no, 'B2C', 'Y', null, null, null, null, null, null);
    raise exception 'convert: non-staff without an accessible conversation must be denied';
  exception when insufficient_privilege then null; -- esperado: 42501
  end;
end $conv$;
reset role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/tests/rls-regression.sql
git commit -m "test(rls): cobre convert_pending_contact (acesso/idempotência/negação)"
```

---

## FASE B — Camada de dados

### Task 3: Contrato do provider

**Files:**
- Modify: `src/providers/data/contracts/customers.ts`

**Interfaces:**
- Produces: `IConvertPendingContactInput`; `ICustomersProvider.convertPendingContact(input)`, `ICustomersProvider.markContactNotCustomer(customerId)`.

- [ ] **Step 1: Adicionar o tipo de input** (perto dos outros tipos exportados do arquivo):

```ts
export interface IConvertPendingContactInput {
  customerId: ID;
  type: ICustomer["type"];
  fullName?: string;
  cpf?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  contactName?: string;
  /** Wallet owner. Ignored for non-staff callers (RPC forces the caller). */
  sellerId?: ID | null;
}
```

- [ ] **Step 2: Adicionar os 2 métodos à interface `ICustomersProvider`** (após `getViaConversation`):

```ts
  /** Promote an imported pending_review contact to a real customer. */
  convertPendingContact(input: IConvertPendingContactInput): Promise<ICustomer>;
  /** Mark a pending_review contact as reviewed-and-not-a-customer (archived). */
  markContactNotCustomer(customerId: ID): Promise<ICustomer>;
```

- [ ] **Step 3: Verificar tipos** — `bunx tsc --noEmit`. Esperado: os providers mock/supabase agora **faltam** implementar os métodos → erros APENAS em `impl/mock/customers.ts` e `impl/supabase/customers.ts` (resolvidos nas Tasks 4 e 5). Nenhum erro em outro arquivo.

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/contracts/customers.ts
git commit -m "feat(providers): contrato de conversão de contato pendente"
```

---

### Task 4: Implementação Supabase

**Files:**
- Modify: `src/providers/data/impl/supabase/customers.ts`

**Interfaces:**
- Consumes: `IConvertPendingContactInput` (Task 3); helpers locais `getSupabaseClient`, `rowToCustomer`, `CustomerRow`, `TABLE`, `COLUMNS`.

- [ ] **Step 1: Adicionar o filtro `tags`/`tag` (include) no `list()`** — logo após o bloco do `excludeTags` (`query = query.not("tags", "ov", ...)`):

```ts
    // Include filters (mirror the mock's AND semantics — customer must carry ALL).
    if (params.tag) {
      query = query.contains("tags", [params.tag]);
    }
    if (params.tags && params.tags.length > 0) {
      query = query.contains("tags", params.tags);
    }
```

- [ ] **Step 2: Adicionar os 2 métodos** (após `getViaConversation`, dentro do objeto provider):

```ts
  async convertPendingContact(input: IConvertPendingContactInput): Promise<ICustomer> {
    const { data, error } = await getSupabaseClient()
      .rpc("convert_pending_contact", {
        p_customer_id: input.customerId,
        p_type: input.type,
        p_full_name: input.fullName ?? null,
        p_cpf: input.cpf ?? null,
        p_razao_social: input.razaoSocial ?? null,
        p_nome_fantasia: input.nomeFantasia ?? null,
        p_cnpj: input.cnpj ?? null,
        p_contact_name: input.contactName ?? null,
        p_seller_id: input.sellerId ?? null,
      })
      .maybeSingle();
    if (error)
      throw new Error(`[supabase] customers.convertPendingContact failed: ${error.message}`);
    if (!data) throw new Error("[supabase] customers.convertPendingContact returned no row");
    return rowToCustomer(data as unknown as CustomerRow, []);
  },

  async markContactNotCustomer(customerId: ID): Promise<ICustomer> {
    const { data, error } = await getSupabaseClient()
      .rpc("mark_contact_not_customer", { p_customer_id: customerId })
      .maybeSingle();
    if (error)
      throw new Error(`[supabase] customers.markContactNotCustomer(${customerId}) failed: ${error.message}`);
    if (!data) throw new Error("[supabase] customers.markContactNotCustomer returned no row");
    return rowToCustomer(data as unknown as CustomerRow, []);
  },
```

(Se necessário, importe `IConvertPendingContactInput` do contrato no topo do arquivo.)

- [ ] **Step 3: Verificar** — `bunx tsc --noEmit`: zero erro novo em `impl/supabase/customers.ts`. `bun run build`: verde.

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/impl/supabase/customers.ts
git commit -m "feat(providers): conversão de contato no supabase + filtro tags include"
```

---

### Task 5: Implementação Mock

**Files:**
- Modify: `src/mocks/api/customers.ts` (lógica no `customersApi`)
- Modify: `src/providers/data/impl/mock/customers.ts` (expor no `mockCustomersProvider`)

**Interfaces:**
- Consumes: `IConvertPendingContactInput`; helpers do mock `selectCustomerById`, `patchById`, `MockNotFoundError`, `MockValidationError`, `runApi`.

- [ ] **Step 1: Adicionar os métodos ao `customersApi`** (`src/mocks/api/customers.ts`, junto de `create`/`update`). Importe `IConvertPendingContactInput` do contrato:

```ts
  async convertPendingContact(input: IConvertPendingContactInput): Promise<ICustomer> {
    return runApi(
      "customersApi",
      "convertPendingContact",
      () => {
        const existing = selectCustomerById(input.customerId);
        if (!existing) throw new MockNotFoundError("customer", input.customerId);
        if (!existing.tags.includes("pending_review")) {
          throw new MockValidationError("contact is not pending review", "tags");
        }
        const tags = existing.tags.filter((t) => t !== "pending_review");
        const sellerId = input.sellerId ?? existing.sellerId ?? null;
        const patch =
          input.type === "B2B"
            ? {
                type: "B2B" as const,
                sellerId,
                tags,
                razaoSocial: input.razaoSocial ?? "",
                nomeFantasia: input.nomeFantasia ?? "",
                cnpj: input.cnpj ?? "",
                contactName: input.contactName ?? "",
              }
            : {
                type: "B2C" as const,
                sellerId,
                tags,
                fullName: input.fullName ?? "",
                cpf: input.cpf ?? "",
              };
        const updated = patchById("customers", input.customerId, patch as Partial<ICustomer>);
        if (!updated) throw new MockNotFoundError("customer", input.customerId);
        return updated;
      },
      { payload: input },
    );
  },

  async markContactNotCustomer(customerId: ID): Promise<ICustomer> {
    return runApi(
      "customersApi",
      "markContactNotCustomer",
      () => {
        const existing = selectCustomerById(customerId);
        if (!existing) throw new MockNotFoundError("customer", customerId);
        if (!existing.tags.includes("pending_review")) {
          throw new MockValidationError("contact is not pending review", "tags");
        }
        const tags = existing.tags.filter((t) => t !== "pending_review");
        if (!tags.includes("reviewed_not_customer")) tags.push("reviewed_not_customer");
        const updated = patchById("customers", customerId, { tags } as Partial<ICustomer>);
        if (!updated) throw new MockNotFoundError("customer", customerId);
        return updated;
      },
      { payload: { customerId } },
    );
  },
```

- [ ] **Step 2: Expor no wrapper** (`src/providers/data/impl/mock/customers.ts`), dentro do objeto `mockCustomersProvider`:

```ts
  convertPendingContact: async (input) => {
    const updated = await customersApi.convertPendingContact(input);
    logMockMutation({
      action: "convert_pending_contact",
      resource: "customer",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  markContactNotCustomer: async (customerId) => {
    const updated = await customersApi.markContactNotCustomer(customerId);
    logMockMutation({
      action: "mark_contact_not_customer",
      resource: "customer",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
```

- [ ] **Step 3: Verificar** — `bunx tsc --noEmit`: zero erro novo (contrato agora satisfeito por ambos os providers). `bun run build`: verde.

- [ ] **Step 4: Commit**

```bash
git add src/mocks/api/customers.ts src/providers/data/impl/mock/customers.ts
git commit -m "feat(providers): conversão de contato no mock (paridade)"
```

---

### Task 6: Esconder a tag de descarte da tela Clientes

**Files:**
- Modify: `src/features/customers/utils/listFilters.ts`
- Test: `src/features/customers/utils/listFilters.test.ts` (se existir; senão criar)

- [ ] **Step 1: Escrever/!ajustar o teste** em `listFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HIDDEN_CUSTOMER_TAGS, toListParams, EMPTY_FILTERS, DEFAULT_SORT } from "./listFilters";

describe("HIDDEN_CUSTOMER_TAGS", () => {
  it("hides both pending_review and reviewed_not_customer", () => {
    expect(HIDDEN_CUSTOMER_TAGS).toContain("pending_review");
    expect(HIDDEN_CUSTOMER_TAGS).toContain("reviewed_not_customer");
  });

  it("toListParams always excludes the hidden tags", () => {
    const params = toListParams(EMPTY_FILTERS, DEFAULT_SORT, 1, 50);
    expect(params.excludeTags).toEqual([...HIDDEN_CUSTOMER_TAGS]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun run test src/features/customers/utils/listFilters.test.ts`. Esperado: FAIL (`reviewed_not_customer` ainda não está em `HIDDEN_CUSTOMER_TAGS`).

- [ ] **Step 3: Implementar** — em `listFilters.ts`, alterar a constante:

```ts
export const HIDDEN_CUSTOMER_TAGS = ["pending_review", "reviewed_not_customer"] as const;
```

- [ ] **Step 4: Rodar e ver passar** — `bun run test src/features/customers/utils/listFilters.test.ts`. Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/customers/utils/listFilters.ts src/features/customers/utils/listFilters.test.ts
git commit -m "feat(customers): esconde reviewed_not_customer da tela Clientes"
```

---

## FASE C — Engine de validação

### Task 7: `validateConversion` (TDD)

**Files:**
- Create: `src/features/contact-review/engine/validateConversion.ts`
- Test: `src/features/contact-review/engine/validateConversion.test.ts`

**Interfaces:**
- Produces: `IConversionFormValues`, `IConversionValidationResult`, `validateConversion(values)`, `toConvertInput(customerId, values, sellerId?)`.

- [ ] **Step 1: Escrever o teste**:

```ts
import { describe, expect, it } from "vitest";
import { validateConversion, toConvertInput, type IConversionFormValues } from "./validateConversion";

const base: IConversionFormValues = {
  type: "B2C", fullName: "", cpf: "", razaoSocial: "", nomeFantasia: "", cnpj: "", contactName: "",
};

describe("validateConversion", () => {
  it("B2C requires a name", () => {
    const r = validateConversion({ ...base, fullName: "   " });
    expect(r.valid).toBe(false);
    expect(r.errors.fullName).toBeTruthy();
  });
  it("B2C with a name and no document is valid", () => {
    expect(validateConversion({ ...base, fullName: "João" }).valid).toBe(true);
  });
  it("B2C rejects a malformed CPF", () => {
    const r = validateConversion({ ...base, fullName: "João", cpf: "123" });
    expect(r.valid).toBe(false);
    expect(r.errors.cpf).toBeTruthy();
  });
  it("B2B requires a fantasy name", () => {
    const r = validateConversion({ ...base, type: "B2B" });
    expect(r.valid).toBe(false);
    expect(r.errors.nomeFantasia).toBeTruthy();
  });
  it("B2B with a fantasy name and no document is valid", () => {
    expect(validateConversion({ ...base, type: "B2B", nomeFantasia: "Auto Peças" }).valid).toBe(true);
  });
  it("B2B rejects a malformed CNPJ", () => {
    const r = validateConversion({ ...base, type: "B2B", nomeFantasia: "X", cnpj: "999" });
    expect(r.valid).toBe(false);
    expect(r.errors.cnpj).toBeTruthy();
  });
});

describe("toConvertInput", () => {
  it("maps only the fields of the chosen type (B2C)", () => {
    const input = toConvertInput("c1", { ...base, fullName: "João", cpf: "11122233344" });
    expect(input).toMatchObject({ customerId: "c1", type: "B2C", fullName: "João", cpf: "11122233344" });
    expect(input.razaoSocial).toBeUndefined();
  });
  it("passes the chosen seller id through", () => {
    const input = toConvertInput("c1", { ...base, fullName: "João" }, "s9");
    expect(input.sellerId).toBe("s9");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun run test src/features/contact-review/engine/validateConversion.test.ts`. Esperado: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**:

```ts
import type { ID } from "@/shared/types";
import type { IConvertPendingContactInput } from "@/providers/data";

export interface IConversionFormValues {
  type: "B2C" | "B2B";
  fullName: string;
  cpf: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  contactName: string;
}

export interface IConversionValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof IConversionFormValues, string>>;
}

const digits = (v: string): string => (v ?? "").replace(/\D/g, "");

/** Validate the quick-conversion form. Document is optional; when present it must be well-formed. */
export function validateConversion(values: IConversionFormValues): IConversionValidationResult {
  const errors: IConversionValidationResult["errors"] = {};
  if (values.type === "B2C") {
    if (!values.fullName.trim()) errors.fullName = "Informe o nome completo.";
    if (values.cpf.trim() && digits(values.cpf).length !== 11) errors.cpf = "CPF inválido.";
  } else {
    if (!values.nomeFantasia.trim()) errors.nomeFantasia = "Informe o nome fantasia.";
    if (values.cnpj.trim() && digits(values.cnpj).length !== 14) errors.cnpj = "CNPJ inválido.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Map validated form values to the provider input (only the chosen type's fields). */
export function toConvertInput(
  customerId: ID,
  values: IConversionFormValues,
  sellerId?: ID | null,
): IConvertPendingContactInput {
  const owner = sellerId === undefined ? {} : { sellerId };
  if (values.type === "B2B") {
    return {
      customerId,
      type: "B2B",
      razaoSocial: values.razaoSocial.trim() || undefined,
      nomeFantasia: values.nomeFantasia.trim(),
      cnpj: values.cnpj.trim() || undefined,
      contactName: values.contactName.trim() || undefined,
      ...owner,
    };
  }
  return {
    customerId,
    type: "B2C",
    fullName: values.fullName.trim(),
    cpf: values.cpf.trim() || undefined,
    ...owner,
  };
}
```

- [ ] **Step 4: Rodar e ver passar** — `bun run test src/features/contact-review/engine/validateConversion.test.ts`. Esperado: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/contact-review/engine/validateConversion.ts src/features/contact-review/engine/validateConversion.test.ts
git commit -m "feat(contact-review): engine de validação de conversão (TDD)"
```

---

## FASE D — UI da ficha (Atendimento)

### Task 8: Strings pt-BR da feature

**Files:**
- Create: `src/features/contact-review/i18n/pt-BR.ts`

- [ ] **Step 1: Criar o arquivo**:

```ts
export const CONTACT_REVIEW_STRINGS = {
  banner: {
    title: "Contato pendente de revisão",
    convert: "Converter em cliente",
    discard: "Não é cliente",
  },
  convert: {
    title: "Converter em cliente",
    description: "Revise os dados antes de promover este contato.",
    typeLabel: "Tipo de cliente",
    pf: "Pessoa física",
    pj: "Empresa",
    fullName: "Nome completo",
    cpf: "CPF",
    razaoSocial: "Razão social",
    nomeFantasia: "Nome fantasia",
    cnpj: "CNPJ",
    contactName: "Nome do contato",
    optional: "opcional",
    phone: "Telefone",
    owner: "Vendedor responsável",
    ownerSelf: "Você",
    ownerPick: "Selecionar…",
    cancel: "Cancelar",
    confirm: "Converter",
    submitting: "Convertendo…",
    success: "Contato convertido em cliente.",
    failure: "Não foi possível converter o contato.",
  },
  discard: {
    title: "Marcar como “não é cliente”?",
    description:
      "O contato sai da fila de pendentes e continua acessível só no Atendimento. Não aparecerá na tela Clientes.",
    cancel: "Cancelar",
    confirm: "Não é cliente",
    submitting: "Salvando…",
    success: "Contato marcado como não-cliente.",
    failure: "Não foi possível atualizar o contato.",
  },
  queue: {
    title: "Contatos pendentes",
    search: "Buscar nome ou telefone…",
    empty: "Nenhum contato pendente.",
    columns: { contact: "Contato", phone: "Telefone", origin: "Origem", received: "Recebido", actions: "" },
    views: { table: "Tabela", cards: "Cards", split: "Lista" },
    noName: "(sem nome)",
  },
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/features/contact-review/i18n/pt-BR.ts
git commit -m "feat(contact-review): strings pt-BR"
```

---

### Task 9: Hook de mutação `useContactConversion`

**Files:**
- Create: `src/features/contact-review/hooks/useContactConversion.ts`

**Interfaces:**
- Produces: `useContactConversion()` → `{ saving, convert(input, conversationId?), discard(customerId, conversationId?) }`.
- Consumes: `useCustomersProvider` (`@/providers/data`), `IConvertPendingContactInput`.

- [ ] **Step 1: Implementar**:

```ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { useCustomersProvider, type IConvertPendingContactInput } from "@/providers/data";

export interface IUseContactConversionResult {
  saving: boolean;
  convert: (input: IConvertPendingContactInput, conversationId?: ID | null) => Promise<ICustomer>;
  discard: (customerId: ID, conversationId?: ID | null) => Promise<ICustomer>;
}

export function useContactConversion(): IUseContactConversionResult {
  const provider = useCustomersProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Invalidate ONLY customer/queue/conversation-detail keys — never the frozen
  // Atendimento message/media caches (#137).
  const invalidate = useCallback(
    (customerId: ID, conversationId?: ID | null) => {
      void queryClient.invalidateQueries({ queryKey: ["customer-profile", customerId] });
      void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-contacts"] });
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: ["conversation-detail", conversationId] });
      }
    },
    [queryClient],
  );

  const convert = useCallback(
    async (input: IConvertPendingContactInput, conversationId?: ID | null) => {
      setSaving(true);
      try {
        const result = await provider.convertPendingContact(input);
        invalidate(input.customerId, conversationId);
        return result;
      } finally {
        setSaving(false);
      }
    },
    [provider, invalidate],
  );

  const discard = useCallback(
    async (customerId: ID, conversationId?: ID | null) => {
      setSaving(true);
      try {
        const result = await provider.markContactNotCustomer(customerId);
        invalidate(customerId, conversationId);
        return result;
      } finally {
        setSaving(false);
      }
    },
    [provider, invalidate],
  );

  return { saving, convert, discard };
}
```

- [ ] **Step 2: Verificar** — `bunx tsc --noEmit` (zero erro novo). **Commit**

```bash
git add src/features/contact-review/hooks/useContactConversion.ts
git commit -m "feat(contact-review): hook de mutação (convert/discard) + invalidação"
```

---

### Task 10: `ConvertContactDialog` (modal — layout A)

**Files:**
- Create: `src/features/contact-review/components/ConvertContactDialog.tsx`

**Interfaces:**
- Consumes: `validateConversion`/`toConvertInput` (Task 7), `useContactConversion` (Task 9), `CONTACT_REVIEW_STRINGS` (Task 8), `useCurrentRole` (`@/features/rbac/hooks/useCurrentRole`), `useSellersProvider` (`@/providers/data`), `useCurrentStore` (`@/features/multistore/hooks/useCurrentStore`).
- Produces: `ConvertContactDialog` (props `customer`, `conversation?`, `open`, `onOpenChange`, `onConverted?`).

- [ ] **Step 1: Implementar** o componente:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IConversation, ICustomer, ID } from "@/shared/types";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSellersProvider } from "@/providers/data";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { useContactConversion } from "../hooks/useContactConversion";
import {
  validateConversion, toConvertInput, type IConversionFormValues,
} from "../engine/validateConversion";

export interface IConvertContactDialogProps {
  customer: ICustomer;
  conversation?: IConversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted?: () => void;
}

function initialValues(customer: ICustomer): IConversionFormValues {
  const name = customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
  return {
    type: customer.type,
    fullName: customer.type === "B2C" ? (name ?? "") : (customer.whatsappName ?? ""),
    cpf: customer.type === "B2C" ? (customer.cpf ?? "") : "",
    razaoSocial: customer.type === "B2B" ? (customer.razaoSocial ?? "") : "",
    nomeFantasia: customer.type === "B2B" ? (name ?? "") : (customer.whatsappName ?? ""),
    cnpj: customer.type === "B2B" ? (customer.cnpj ?? "") : "",
    contactName: customer.type === "B2B" ? (customer.contactName ?? "") : "",
  };
}

export function ConvertContactDialog({
  customer, conversation, open, onOpenChange, onConverted,
}: IConvertContactDialogProps) {
  const role = useCurrentRole();
  const isStaff = role === "Owner" || role === "Gestor";
  const { currentStoreId } = useCurrentStore();
  const sellersProvider = useSellersProvider();
  const { saving, convert } = useContactConversion();

  const [values, setValues] = useState<IConversionFormValues>(() => initialValues(customer));
  const [sellerId, setSellerId] = useState<ID | "">("");
  const [errors, setErrors] = useState<ReturnType<typeof validateConversion>["errors"]>({});

  useEffect(() => {
    if (open) {
      setValues(initialValues(customer));
      setSellerId("");
      setErrors({});
    }
  }, [open, customer]);

  const sellersQuery = useQuery({
    queryKey: ["sellers-list", currentStoreId],
    queryFn: () => sellersProvider.list({ storeId: currentStoreId ?? undefined }),
    enabled: open && isStaff && Boolean(currentStoreId),
  });
  const sellers = sellersQuery.data?.data ?? [];

  const set = (patch: Partial<IConversionFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateConversion(values);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    try {
      const input = toConvertInput(
        customer.id,
        values,
        isStaff ? (sellerId || undefined) : undefined,
      );
      await convert(input, conversation?.id ?? null);
      toast.success(S.convert.success);
      onConverted?.();
      onOpenChange(false);
    } catch {
      toast.error(S.convert.failure);
    }
  };

  const phone = useMemo(() => customer.phone, [customer.phone]);
  const isB2B = values.type === "B2B";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{S.convert.title}</DialogTitle>
            <DialogDescription>{S.convert.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>{S.convert.typeLabel}</Label>
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {(["B2C", "B2B"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ type: t })}
                  className={
                    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                    (values.type === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t === "B2C" ? S.convert.pf : S.convert.pj}
                </button>
              ))}
            </div>
          </div>

          {!isB2B ? (
            <>
              <Field label={S.convert.fullName} error={errors.fullName}>
                <Input value={values.fullName} onChange={(e) => set({ fullName: e.target.value })} autoFocus />
              </Field>
              <Field label={`${S.convert.cpf} · ${S.convert.optional}`} error={errors.cpf}>
                <Input value={values.cpf} onChange={(e) => set({ cpf: e.target.value })} placeholder="000.000.000-00" />
              </Field>
            </>
          ) : (
            <>
              <Field label={`${S.convert.razaoSocial} · ${S.convert.optional}`}>
                <Input value={values.razaoSocial} onChange={(e) => set({ razaoSocial: e.target.value })} />
              </Field>
              <Field label={S.convert.nomeFantasia} error={errors.nomeFantasia}>
                <Input value={values.nomeFantasia} onChange={(e) => set({ nomeFantasia: e.target.value })} autoFocus />
              </Field>
              <Field label={`${S.convert.cnpj} · ${S.convert.optional}`} error={errors.cnpj}>
                <Input value={values.cnpj} onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </Field>
              <Field label={`${S.convert.contactName} · ${S.convert.optional}`}>
                <Input value={values.contactName} onChange={(e) => set({ contactName: e.target.value })} />
              </Field>
            </>
          )}

          <Field label={S.convert.phone}>
            <Input value={phone} readOnly className="text-muted-foreground" />
          </Field>

          <div className="space-y-1.5">
            <Label>{S.convert.owner}</Label>
            {isStaff ? (
              <Select value={sellerId} onValueChange={(v) => setSellerId(v as ID)}>
                <SelectTrigger><SelectValue placeholder={S.convert.ownerPick} /></SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={S.convert.ownerSelf} readOnly className="text-muted-foreground" />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {S.convert.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? S.convert.submitting : S.convert.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar** — `bunx tsc --noEmit` (zero erro novo; se `sellersProvider.list` tiver assinatura diferente, ajuste para o shape real — espera-se `IPaginatedResult<ISeller>` com `.data`). `bun run build`: verde.

- [ ] **Step 3: Commit**

```bash
git add src/features/contact-review/components/ConvertContactDialog.tsx
git commit -m "feat(contact-review): modal de conversão (coluna única, B2C/B2B)"
```

---

### Task 11: `MarkNotCustomerDialog` (confirmação de descarte)

**Files:**
- Create: `src/features/contact-review/components/MarkNotCustomerDialog.tsx`

- [ ] **Step 1: Implementar**:

```tsx
import { toast } from "sonner";
import type { IConversation, ICustomer, ID } from "@/shared/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { useContactConversion } from "../hooks/useContactConversion";

export interface IMarkNotCustomerDialogProps {
  customerId: ID;
  conversation?: IConversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function MarkNotCustomerDialog({
  customerId, conversation, open, onOpenChange, onDone,
}: IMarkNotCustomerDialogProps) {
  const { saving, discard } = useContactConversion();

  const handleConfirm = async () => {
    try {
      await discard(customerId, conversation?.id ?? null);
      toast.success(S.discard.success);
      onDone?.();
      onOpenChange(false);
    } catch {
      toast.error(S.discard.failure);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{S.discard.title}</AlertDialogTitle>
          <AlertDialogDescription>{S.discard.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>{S.discard.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void handleConfirm(); }}
            disabled={saving}
          >
            {saving ? S.discard.submitting : S.discard.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Verificar** `bunx tsc --noEmit` + **Commit**

```bash
git add src/features/contact-review/components/MarkNotCustomerDialog.tsx
git commit -m "feat(contact-review): diálogo de descarte (não é cliente)"
```

---

### Task 12: `PendingContactBanner` + inserir na ficha

**Files:**
- Create: `src/features/contact-review/components/PendingContactBanner.tsx`
- Create: `src/features/contact-review/index.ts` (barrel)
- Modify: `src/features/customers/components/ProfileHeader.tsx`

- [ ] **Step 1: Implementar a faixa** (layout A — barra âmbar + 2 botões, auto-contida):

```tsx
import { useState } from "react";
import type { IConversation, ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { ConvertContactDialog } from "./ConvertContactDialog";
import { MarkNotCustomerDialog } from "./MarkNotCustomerDialog";

export interface IPendingContactBannerProps {
  customer: ICustomer;
  conversation?: IConversation | null;
}

export function PendingContactBanner({ customer, conversation }: IPendingContactBannerProps) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon icon="mdi:alert-outline" size={16} className="text-warning" />
        <span className="text-sm font-medium text-warning">{S.banner.title}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => setConvertOpen(true)}>{S.banner.convert}</Button>
        <Button size="sm" variant="outline" onClick={() => setDiscardOpen(true)}>{S.banner.discard}</Button>
      </div>

      <ConvertContactDialog
        customer={customer}
        conversation={conversation}
        open={convertOpen}
        onOpenChange={setConvertOpen}
      />
      <MarkNotCustomerDialog
        customerId={customer.id}
        conversation={conversation}
        open={discardOpen}
        onOpenChange={setDiscardOpen}
      />
    </div>
  );
}
```

- [ ] **Step 2: Criar o barrel** `src/features/contact-review/index.ts` (só o que já existe nesta task; `PendingContactsPage` é adicionada na Task 15):

```ts
export { PendingContactBanner } from "./components/PendingContactBanner";
export { ConvertContactDialog } from "./components/ConvertContactDialog";
export { MarkNotCustomerDialog } from "./components/MarkNotCustomerDialog";
```

- [ ] **Step 3: Inserir a faixa na ficha** — em `src/features/customers/components/ProfileHeader.tsx`, dentro do `<header>`, logo após `<ProfileContactRow customer={customer} />` (e antes do bloco de botões de ação):

```tsx
      {customer.tags.includes("pending_review") && (
        <PendingContactBanner customer={customer} conversation={conversation} />
      )}
```

E adicionar o import no topo:

```tsx
import { PendingContactBanner } from "@/features/contact-review";
```

- [ ] **Step 4: Verificar** — `bunx tsc --noEmit` (zero erro novo). `bun run build`: verde. Manualmente NÃO é necessário (o usuário testa a UI).

- [ ] **Step 5: Commit**

```bash
git add src/features/contact-review/components/PendingContactBanner.tsx src/features/contact-review/index.ts src/features/customers/components/ProfileHeader.tsx
git commit -m "feat(contact-review): faixa de contato pendente na ficha do Atendimento"
```

---

## FASE E — Fila de revisão (staff)

> **Ordem de execução desta fase (dependências de import):** Task 13 → criar `PendingContactsTable` (define `IPendingContactsViewProps`) → Task 16 (Cards) → Task 17 (Split) → criar `PendingContactsPage` + adicionar `export { PendingContactsPage }` ao barrel → Task 14 (rota, que importa a página do barrel). Por isso a Task 15 é dividida em 15a (Tabela) e 15b (Página + barrel), e a Task 14 roda por último. Nenhum stub temporário nem import quebrado em ponto algum.

### Task 13: Hook `usePendingContacts`

**Files:**
- Create: `src/features/contact-review/hooks/usePendingContacts.ts`

**Interfaces:**
- Produces: `usePendingContacts({ storeId, search, page, pageSize })` → TanStack query de `IPaginatedResult<ICustomer>`.

- [ ] **Step 1: Implementar**:

```ts
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data";

export interface IUsePendingContactsParams {
  storeId: ID | null;
  search: string;
  page: number;
  pageSize: number;
}

export function usePendingContacts(params: IUsePendingContactsParams) {
  const provider = useCustomersProvider();
  return useQuery({
    queryKey: ["pending-contacts", params.storeId, params.search, params.page, params.pageSize],
    queryFn: () =>
      provider.list({
        storeId: params.storeId ?? undefined,
        tags: ["pending_review"],
        search: params.search.trim() || undefined,
        page: params.page,
        pageSize: params.pageSize,
      }),
    enabled: Boolean(params.storeId),
  });
}
```

- [ ] **Step 2: Verificar** `bunx tsc --noEmit` + **Commit**

```bash
git add src/features/contact-review/hooks/usePendingContacts.ts
git commit -m "feat(contact-review): hook da fila de pendentes"
```

---

### Task 14: Rota staff + ROUTES + navegação

**Files:**
- Create: `src/routes/app.atendimento_.contatos-pendentes.tsx`
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/config/navigation.ts`

**Notas:** o nome de arquivo usa **trailing underscore** (`atendimento_`) — recurso do TanStack file-based que cria a rota em `/app/atendimento/contatos-pendentes` SEM herdar o layout de split de `app.atendimento.tsx` (ela ainda fica sob `/app` → `AppLayout`). O `routeTree.gen.ts` é **gerado** pelo plugin ao rodar `bun run dev`/`bun run build` — não edite à mão.

- [ ] **Step 1: Adicionar a constante de rota** em `routes.ts`, no bloco "App interno":

```ts
  APP_CONTATOS_PENDENTES: "/app/atendimento/contatos-pendentes",
```

- [ ] **Step 2: Criar a rota**:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { PendingContactsPage } from "@/features/contact-review";

export const Route = createFileRoute("/app/atendimento_/contatos-pendentes")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: PendingContactsPage,
});
```

- [ ] **Step 3: Adicionar o item de navegação** em `navigation.ts` — no grupo onde vivem os itens de atendimento/clientes, usando `roles` (staff):

```ts
{
  label: "Contatos pendentes",
  icon: "mdi:account-clock-outline",
  to: ROUTES.APP_CONTATOS_PENDENTES,
  roles: ["Owner", "Gestor"],
},
```

- [ ] **Step 4: Verificar** — `bun run build` regenera o `routeTree.gen.ts` e deve passar (precisa que a Task 15 exista; se rodar antes, faça a Task 15 primeiro e volte). Esperado: build verde, rota acessível só para Owner/Gestor, item de menu visível só para eles.

- [ ] **Step 5: Commit**

```bash
git add src/routes/app.atendimento_.contatos-pendentes.tsx src/features/shell/config/routes.ts src/features/shell/config/navigation.ts src/routeTree.gen.ts
git commit -m "feat(contact-review): rota e navegação da fila (staff-only)"
```

---

### Task 15: `PendingContactsPage` + view Tabela

**Files:**
- Create: `src/features/contact-review/pages/PendingContactsPage.tsx`
- Create: `src/features/contact-review/components/PendingContactsTable.tsx`

**Interfaces:**
- Produces: `PendingContactsPage`; `PendingContactsTable` (props `customers`, `onConvert`, `onDiscard`).
- Consumes: `usePendingContacts` (Task 13), `useCurrentStore`, `CONTACT_REVIEW_STRINGS`, `ConvertContactDialog`/`MarkNotCustomerDialog`, `getCustomerName` (`@/features/customers/utils/customerDisplay`).

- [ ] **Step 1: Criar a página** (header + busca + seletor de view com persistência; hospeda os diálogos uma vez):

```tsx
import { useEffect, useMemo, useState } from "react";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { usePendingContacts } from "../hooks/usePendingContacts";
import { ConvertContactDialog } from "../components/ConvertContactDialog";
import { MarkNotCustomerDialog } from "../components/MarkNotCustomerDialog";
import { PendingContactsTable } from "../components/PendingContactsTable";
import { PendingContactsCards } from "../components/PendingContactsCards";
import { PendingContactsSplit } from "../components/PendingContactsSplit";

type ViewMode = "table" | "cards" | "split";
const VIEW_KEY = "gallo-pending-contacts-view";
const VIEWS: { id: ViewMode; label: string; icon: string }[] = [
  { id: "table", label: S.queue.views.table, icon: "mdi:table" },
  { id: "cards", label: S.queue.views.cards, icon: "mdi:view-grid-outline" },
  { id: "split", label: S.queue.views.split, icon: "mdi:view-split-vertical" },
];

export function PendingContactsPage() {
  const { currentStoreId } = useCurrentStore();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || "table",
  );
  const [convertTarget, setConvertTarget] = useState<ICustomer | null>(null);
  const [discardTarget, setDiscardTarget] = useState<ICustomer | null>(null);

  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  const query = usePendingContacts({ storeId: currentStoreId, search, page: 1, pageSize: 200 });
  const customers = useMemo(() => query.data?.data ?? [], [query.data]);

  const viewProps = {
    customers,
    onConvert: (c: ICustomer) => setConvertTarget(c),
    onDiscard: (c: ICustomer) => setDiscardTarget(c),
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">{S.queue.title}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {query.data?.total ?? 0}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Icon icon="mdi:magnify" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={S.queue.search}
              className="w-56 pl-8"
            />
          </div>
          <div className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                title={v.label}
                onClick={() => setView(v.id)}
                className={
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                  (view === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                <Icon icon={v.icon} size={14} />{v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {customers.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{S.queue.empty}</p>
        ) : view === "table" ? (
          <PendingContactsTable {...viewProps} />
        ) : view === "cards" ? (
          <PendingContactsCards {...viewProps} />
        ) : (
          <PendingContactsSplit {...viewProps} />
        )}
      </div>

      {convertTarget && (
        <ConvertContactDialog
          customer={convertTarget}
          open={Boolean(convertTarget)}
          onOpenChange={(o) => !o && setConvertTarget(null)}
          onConverted={() => setConvertTarget(null)}
        />
      )}
      {discardTarget && (
        <MarkNotCustomerDialog
          customerId={discardTarget.id}
          open={Boolean(discardTarget)}
          onOpenChange={(o) => !o && setDiscardTarget(null)}
          onDone={() => setDiscardTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar a view Tabela** `PendingContactsTable.tsx`:

```tsx
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";

export interface IPendingContactsViewProps {
  customers: ICustomer[];
  onConvert: (customer: ICustomer) => void;
  onDiscard: (customer: ICustomer) => void;
}

export function PendingContactsTable({ customers, onConvert, onDiscard }: IPendingContactsViewProps) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="px-3 py-2">{S.queue.columns.contact}</th>
          <th className="px-3 py-2">{S.queue.columns.phone}</th>
          <th className="px-3 py-2 text-right">{S.queue.columns.actions}</th>
        </tr>
      </thead>
      <tbody>
        {customers.map((c) => (
          <tr key={c.id} className="border-b border-border/60">
            <td className="px-3 py-2 text-foreground">{getCustomerName(c) || S.queue.noName}</td>
            <td className="px-3 py-2 text-muted-foreground">{c.phone}</td>
            <td className="px-3 py-2">
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => onConvert(c)}>{S.banner.convert}</Button>
                <Button size="sm" variant="outline" onClick={() => onDiscard(c)}>{S.banner.discard}</Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Verificar** — `bunx tsc --noEmit`. Esperado: erros APENAS por `PendingContactsCards`/`PendingContactsSplit` ainda não existirem (Tasks 16-17). Crie stubs temporários se quiser build verde agora, ou implemente as Tasks 16-17 em seguida e então rode o build.

- [ ] **Step 4: Commit**

```bash
git add src/features/contact-review/pages/PendingContactsPage.tsx src/features/contact-review/components/PendingContactsTable.tsx
git commit -m "feat(contact-review): página da fila + view Tabela com seletor de visualização"
```

---

### Task 16: View Cards

**Files:**
- Create: `src/features/contact-review/components/PendingContactsCards.tsx`

- [ ] **Step 1: Implementar** (reusa `IPendingContactsViewProps` da Task 15):

```tsx
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import type { IPendingContactsViewProps } from "./PendingContactsTable";

export function PendingContactsCards({ customers, onConvert, onDiscard }: IPendingContactsViewProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {customers.map((c) => (
        <div key={c.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="font-medium text-foreground">{getCustomerName(c) || S.queue.noName}</p>
            <p className="text-sm text-muted-foreground">{c.phone}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onConvert(c)}>{S.banner.convert}</Button>
            <Button size="sm" variant="outline" onClick={() => onDiscard(c)}>{S.banner.discard}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/contact-review/components/PendingContactsCards.tsx
git commit -m "feat(contact-review): view Cards da fila"
```

---

### Task 17: View Lista + painel (split)

**Files:**
- Create: `src/features/contact-review/components/PendingContactsSplit.tsx`

- [ ] **Step 1: Implementar**:

```tsx
import { useEffect, useState } from "react";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import type { IPendingContactsViewProps } from "./PendingContactsTable";

export function PendingContactsSplit({ customers, onConvert, onDiscard }: IPendingContactsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(customers[0]?.id ?? null);
  useEffect(() => {
    if (!customers.some((c) => c.id === selectedId)) setSelectedId(customers[0]?.id ?? null);
  }, [customers, selectedId]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex min-h-[320px] overflow-hidden rounded-lg border border-border">
      <ul className="w-2/5 max-w-xs overflow-auto border-r border-border">
        {customers.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={
                "w-full truncate px-3 py-2.5 text-left text-sm " +
                (c.id === selectedId
                  ? "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]"
                  : "text-muted-foreground hover:bg-muted/50")
              }
            >
              {getCustomerName(c) || S.queue.noName}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex-1 p-5">
        {selected ? (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{getCustomerName(selected) || S.queue.noName}</p>
              <p className="text-sm text-muted-foreground">{selected.phone}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onConvert(selected)}>{S.banner.convert}</Button>
              <Button size="sm" variant="outline" onClick={() => onDiscard(selected)}>{S.banner.discard}</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{S.queue.empty}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TUDO** — `bun run test` (verde, incl. engine + listFilters). `bunx tsc --noEmit` (sem novos erros vs baseline). `bun run build` (verde, `routeTree.gen.ts` regenerado).

- [ ] **Step 3: Commit**

```bash
git add src/features/contact-review/components/PendingContactsSplit.tsx
git commit -m "feat(contact-review): view Lista+painel da fila"
```

---

## Rollout / Deploy (gate humano)

A ordem importa porque o CI `rls-regression` roda contra o **banco de produção** (lição do PR #194). Execute **com OK explícito do dono** a cada passo de prod:

1. **Aplicar a migration em prod** (antes do merge) via MCP `apply_migration`, name `convert_pending_contact_rpcs`, com o SQL da Task 1. Confirme: `select to_regprocedure('public.convert_pending_contact(uuid,text,text,text,text,text,text,text,uuid)')` não nulo.
2. **Abrir o PR** da branch `feat/conversao-contato-importado`. Se o `rls-regression` tiver rodado antes da migration e falhado, faça `gh run rerun <id> --failed` após o passo 1 — deve ficar verde (o guard `to_regprocedure` passa a exercer os casos).
3. **Deploy do frontend**: é a Vercel no merge (sem Edge Functions novas — nada a deployar via CLI). As RPCs já estão no banco.
4. **NÃO mergear sem OK.** Após aprovação, merge via PR. Pós-merge: smoke manual do dono (converter um contato pela ficha; descartar outro; abrir a fila como Owner e como Vendedor — o Vendedor não deve ver o item de menu).

> Migration **espelhada no Git** (`supabase/migrations/`) já está na Task 1 — a regra "todo apply_migration vai pro Git no mesmo PR" fica satisfeita.

---

## Self-Review (preenchido)

**1. Cobertura da spec:**
- §3 tags/estados → Tasks 1, 5, 6. ✓
- §4 RPCs (gating, dono, idempotência, audit) → Task 1; regressão → Task 2. ✓
- §5 contrato/supabase/mock + filtro `tags` include → Tasks 3, 4, 5. ✓
- §6 faixa A + modal A → Tasks 8-12. ✓
- §7 fila staff + 3 views com seletor → Tasks 13-17. ✓
- §8 permissões/RLS → Task 1 (gating) + Task 14 (rota/nav staff). ✓
- §9 testes (engine, listFilters, rls-regression) → Tasks 2, 6, 7. ✓
- §10 invalidação sem tocar #137 → Task 9. ✓

**2. Placeholders:** nenhum "TBD/depois"; todo passo de código traz o código. (Pontos de verificação marcados, não placeholders.)

**3. Consistência de tipos:** `IConvertPendingContactInput` (Task 3) é usado igual em supabase (Task 4), mock (Task 5), engine (Task 7) e hook (Task 9). Métodos `convertPendingContact`/`markContactNotCustomer` com a mesma assinatura em contrato e nas 2 impls. Query keys (`customer-profile`, `customers-list`, `conversation-detail`, `pending-contacts`) consistentes entre Task 9 e Task 13. `IPendingContactsViewProps` definido na Task 15 e reusado nas Tasks 16-17.

**Pontos de atenção para o executor:**
- `sellersProvider.list` — confirme que retorna `IPaginatedResult<ISeller>` com `.data` e que `ISeller.fullName` existe (ajuste se diferente).
- `useCurrentRole` retorna o papel base (`"Owner" | "Gestor" | ...`); confirme os literais.
- Trailing underscore na rota (`app.atendimento_.contatos-pendentes.tsx`) — se o gerador reclamar, valide o nome contra a doc do TanStack Router file-based desta versão.
