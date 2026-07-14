# Webhook cria Lead para contatos novos (Frente 2) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contatos novos/desconhecidos do WhatsApp passam a gerar um `Lead` (não mais um `customer` placeholder `pending_review`); o dono do lead é resolvido por uma função SQL de rodízio nova; a tela `contact-review` é aposentada.

**Architecture:** Uma função Postgres nova (`assign_next_from_rotation`) espelha a fila de rodízio (hoje só client-side) para uso no webhook. O core runtime-agnostic do webhook (`src/providers/whatsapp/webhook/core.ts`) ganha uma resolução de contato compartilhada (customer real → lead existente/reaberto → lead novo), usada pelos dois caminhos que hoje criam `pending_review` (mensagem recebida e eco de saída). O adapter concreto (`supabase/functions/whatsapp-webhook/index.ts`) implementa os novos métodos e é espelhado em `_shared/whatsapp/webhook/` pelo script de sync já existente. Por fim, o frontend de `contact-review` é removido.

**Tech Stack:** TypeScript (core.ts runtime-agnostic + Deno Edge Function), PostgreSQL/Supabase (migration + `mcp__supabase__execute_sql`), Vitest.

## Global Constraints

- `leads.seller_id`, `leads.store_id`, `leads.id`, `sellers.id`, `customers.id/seller_id`, `conversations.id/customer_id/assigned_seller_id/whatsapp_account_id` são todos `uuid` no schema real de produção (confirmado via `information_schema.columns` — **não confiar nos tipos `text` dos arquivos de migration originais**, o schema evoluiu). `conversations.lead_id` e `rotation_participants.ref_id`/`rotation_queues.last_assigned_ref_id` continuam `text`.
- Offset fixo São Paulo = UTC−03:00 (Brasil sem DST desde 2019) — `now() - interval '3 hours'`, sem lookup de timezone IANA.
- Fallback final de dono (ninguém elegível na fila) = **Fernando Mello Muniz Gallo**, `seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f'` — hardcoded, NÃO usar `profiles.role = 'owner'` (esse papel no RBAC pertence a Edmilson Souza, o admin técnico, não ao dono real do negócio).
- Hoje **não existe nenhuma `rotation_queue` configurada em produção** — todo lead novo cai no fallback (Fernando) até o dono configurar uma fila em `/app/configuracoes/rodizio`. Isso é esperado, não é bug.
- `messages.author_id` é `text` livre, **sem FK** — aceita tanto um `customer.id` quanto um `lead.id` sem mudança de schema.
- `conversations.customer_id` e `conversations.lead_id` já são nullable — o par é mutuamente exclusivo por convenção de app, não por constraint de banco.
- Regra do projeto: mudou `src/providers/whatsapp/` ⇒ rodar `scripts/sync-whatsapp-shared.ts` e redeployar a edge function `whatsapp-webhook`. Mudança de schema via `apply_migration` deve ser espelhada em `supabase/migrations/` no mesmo PR.
- Ordem de deploy: a migration da função SQL (Task 1) precisa estar aplicada **antes** do redeploy do webhook (Task 4), pois o webhook passa a chamar `assign_next_from_rotation`.
- Fora de escopo: redistribuição de carteira, mudanças em `ConvertLeadModal`/`MarkAsLostModal`, ativar a fila real para outros fluxos, canais além de WhatsApp, foto de perfil automática para leads (hoje só existe para customers via `onCustomerAutoCreated` — leads novos não disparam essa busca; gap conhecido, não corrigido nesta frente).

---

### Task 1: Função SQL de rodízio (`assign_next_from_rotation`)

**Files:**
- Create: `supabase/migrations/20260713190000_assign_next_from_rotation.sql`
- Create: `supabase/tests/rotation-assignment-regression.sql`

**Interfaces:**
- Produces: `public.assign_next_from_rotation(p_store_id uuid) returns uuid` — usada pela Task 4 (adapter do webhook). Nunca retorna `null` (sempre cai no fallback Fernando).
- Produces (auxiliares, não chamadas fora desta função): `public.parse_hhmm_minutes(text) returns int`, `public.is_seller_eligible_now(uuid) returns boolean`, `public.rotation_order(uuid, text, text, text) returns table(ref_id text, enabled boolean, rotation_rn bigint)`.

- [ ] **Passo 1: Criar a migration com as 4 funções**

```sql
-- supabase/migrations/20260713190000_assign_next_from_rotation.sql
--
-- Frente 2 (webhook cria Lead): a fila de rodízio real (PRD-213) só roda no
-- cliente (src/features/rotation/engine/) — inacessível ao webhook, que roda
-- como Edge Function no servidor. Estas funções espelham fielmente
-- selectNextFromRotation.ts + eligibility.ts em SQL, no mesmo padrão já usado
-- por whatsapp_health_tick (lógica SQL-only quando o runtime do Edge não serve).

create or replace function public.parse_hhmm_minutes(p_value text)
returns int
language sql
immutable
set search_path to ''
as $$
  select case
    when p_value ~ '^\d{1,2}:\d{2}$' then
      (split_part(p_value, ':', 1)::int) * 60 + (split_part(p_value, ':', 2)::int)
    else null
  end;
$$;

-- Mirrors isWithinWorkSchedule (src/features/access/engine/workSchedule.ts) +
-- isSellerEligible (src/features/rotation/engine/eligibility.ts), minus the
-- participant-enabled check (that's the caller's job, per participant row).
create or replace function public.is_seller_eligible_now(p_seller_id uuid)
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  v_active boolean;
  v_availability text;
  v_schedule jsonb;
  v_overrides jsonb;
  v_now_sp timestamptz := now() - interval '3 hours';
  v_weekday int := extract(dow from v_now_sp)::int;
  v_minutes int := extract(hour from v_now_sp)::int * 60 + extract(minute from v_now_sp)::int;
  v_ymd text := to_char(v_now_sp, 'YYYY-MM-DD');
  v_override jsonb;
  v_win jsonb;
  v_open int;
  v_close int;
begin
  select active, availability, coalesce(work_schedule, '[]'::jsonb), coalesce(schedule_overrides, '[]'::jsonb)
    into v_active, v_availability, v_schedule, v_overrides
  from public.sellers
  where id = p_seller_id;

  if not found or not coalesce(v_active, false) then
    return false;
  end if;
  if v_availability is distinct from 'online' then
    return false;
  end if;

  if jsonb_array_length(v_schedule) = 0 and jsonb_array_length(v_overrides) = 0 then
    return true;
  end if;

  select o into v_override
  from jsonb_array_elements(v_overrides) o
  where o->>'date' = v_ymd
  limit 1;

  if v_override is not null then
    if v_override->>'type' = 'block' then
      return false;
    end if;
    v_open := coalesce(public.parse_hhmm_minutes(v_override->>'openAt'), 0);
    v_close := coalesce(public.parse_hhmm_minutes(v_override->>'closeAt'), 24*60);
    return v_minutes >= v_open and v_minutes < v_close;
  end if;

  if jsonb_array_length(v_schedule) = 0 then
    return true;
  end if;

  for v_win in select * from jsonb_array_elements(v_schedule)
  loop
    if (v_win->>'enabled')::boolean and (v_win->>'weekday')::int = v_weekday then
      v_open := public.parse_hhmm_minutes(v_win->>'openAt');
      v_close := public.parse_hhmm_minutes(v_win->>'closeAt');
      if v_open is not null and v_close is not null and v_minutes >= v_open and v_minutes < v_close then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

-- Rotated order of participants in one scope (top-level sellers/departments,
-- or a department's members), starting AFTER p_pointer with wrap-around —
-- mirrors rotatedOrder() in selectNextFromRotation.ts. p_pointer null or not
-- found among current participants => natural order (stale-pointer fallback).
create or replace function public.rotation_order(
  p_queue_id uuid,
  p_ref_type text,
  p_scope_department_id text,
  p_pointer text
)
returns table(ref_id text, enabled boolean, rotation_rn bigint)
language sql
stable
set search_path to ''
as $$
  with ordered as (
    select ref_id, enabled,
           row_number() over (order by "order") as rn,
           count(*) over () as cnt
    from public.rotation_participants
    where queue_id = p_queue_id
      and ref_type = p_ref_type
      and scope_department_id is not distinct from p_scope_department_id
  ),
  pointer_rn as (
    select rn from ordered where ref_id = p_pointer
  )
  select
    o.ref_id,
    o.enabled,
    case
      when (select rn from pointer_rn) is null then o.rn
      else (((o.rn - (select rn from pointer_rn) - 1 + o.cnt) % o.cnt) + 1)
    end as rotation_rn
  from ordered o
  order by rotation_rn;
$$;

-- Entry point used by the webhook. Advances the queue's pointer(s) atomically
-- on selection. Falls back to Fernando (the real business owner — NOT
-- profiles.role='owner', which is the technical admin) when nobody is
-- eligible (empty/misconfigured queue, everyone offline/off-hours).
create or replace function public.assign_next_from_rotation(p_store_id uuid)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_queue record;
  v_row record;
  v_dept_row record;
  v_dept_last_member text;
  v_member_row record;
  v_selected uuid;
begin
  select * into v_queue from public.rotation_queues where store_id = p_store_id limit 1;

  if found then
    if v_queue.target_mode = 'direct' then
      for v_row in
        select * from public.rotation_order(v_queue.id, 'seller', null, v_queue.last_assigned_ref_id)
      loop
        if v_row.enabled and public.is_seller_eligible_now(v_row.ref_id::uuid) then
          v_selected := v_row.ref_id::uuid;
          update public.rotation_queues
            set last_assigned_ref_id = v_selected::text, updated_at = now()
            where id = v_queue.id;
          return v_selected;
        end if;
      end loop;
    else
      for v_dept_row in
        select * from public.rotation_order(v_queue.id, 'department', null, v_queue.last_assigned_ref_id)
      loop
        if not v_dept_row.enabled then
          continue;
        end if;

        select last_assigned_member_id into v_dept_last_member
        from public.rotation_participants
        where queue_id = v_queue.id and ref_type = 'department' and ref_id = v_dept_row.ref_id;

        for v_member_row in
          select * from public.rotation_order(v_queue.id, 'seller', v_dept_row.ref_id, v_dept_last_member)
        loop
          if v_member_row.enabled and public.is_seller_eligible_now(v_member_row.ref_id::uuid) then
            v_selected := v_member_row.ref_id::uuid;
            update public.rotation_participants
              set last_assigned_member_id = v_selected::text
              where queue_id = v_queue.id and ref_type = 'department' and ref_id = v_dept_row.ref_id;
            update public.rotation_queues
              set last_assigned_ref_id = v_dept_row.ref_id, updated_at = now()
              where id = v_queue.id;
            return v_selected;
          end if;
        end loop;
      end loop;
    end if;
  end if;

  return '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid;
end;
$$;

revoke all on function public.assign_next_from_rotation(uuid) from public, anon;
grant execute on function public.assign_next_from_rotation(uuid) to authenticated, service_role;
```

- [ ] **Passo 2: Criar o arquivo de teste SQL (padrão `supabase/tests/rls-regression.sql` — asserções puras, sem pgTAP, tudo dentro de uma transação com rollback)**

```sql
-- supabase/tests/rotation-assignment-regression.sql
--
-- Regressão de public.assign_next_from_rotation e das funções auxiliares.
-- Roda dentro de uma transação com rollback — nunca persiste dado de teste.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rotation-assignment-regression.sql

begin;

-- Sellers reais da matriz usados como fixture (loja 00000000-0000-0000-0000-000000000001):
--   Tiago  97834e8d-e1b5-4bb7-9f25-2e58e641fdab
--   Ramon  d3ec82e5-f0a4-4d33-972f-13709da5447c
--   Weligton db41c11b-510a-4fff-9dd8-4c86aab8d114
--   Fernando (fallback esperado) 57706ecc-01b5-4a96-b403-0359a4bb767f

create temporary table _scenario_log (scenario text, result uuid);

-- Cenário A: nenhuma rotation_queue para a loja → cai no fallback Fernando.
insert into _scenario_log values (
  'A_no_queue', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'A_no_queue')
     <> '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid then
    raise exception 'A_no_queue: esperava fallback Fernando';
  end if;
end $$;

-- Cenário B: fila direct-mode, 3 participantes, todos online, ponteiro = Tiago
-- → deve selecionar Ramon (próximo na ordem) e avançar o ponteiro.
update public.sellers set availability = 'online' where id in (
  '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 'd3ec82e5-f0a4-4d33-972f-13709da5447c', 'db41c11b-510a-4fff-9dd8-4c86aab8d114'
);
insert into public.rotation_queues (id, store_id, target_mode, last_assigned_ref_id, skip_offline)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'direct', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', true);
insert into public.rotation_participants (id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', null, 'seller', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 1, true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', null, 'seller', 'd3ec82e5-f0a4-4d33-972f-13709da5447c', 2, true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', null, 'seller', 'db41c11b-510a-4fff-9dd8-4c86aab8d114', 3, true);

insert into _scenario_log values (
  'B_pointer_tiago', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'B_pointer_tiago')
     <> 'd3ec82e5-f0a4-4d33-972f-13709da5447c'::uuid then
    raise exception 'B_pointer_tiago: esperava Ramon';
  end if;
  if (select last_assigned_ref_id from public.rotation_queues where id = '11111111-1111-1111-1111-111111111111')
     <> 'd3ec82e5-f0a4-4d33-972f-13709da5447c' then
    raise exception 'B_pointer_tiago: ponteiro não avançou para Ramon';
  end if;
end $$;

-- Cenário C: Ramon fica offline → deve pular pra Weligton.
update public.sellers set availability = 'offline' where id = 'd3ec82e5-f0a4-4d33-972f-13709da5447c';
insert into _scenario_log values (
  'C_ramon_offline', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'C_ramon_offline')
     <> 'db41c11b-510a-4fff-9dd8-4c86aab8d114'::uuid then
    raise exception 'C_ramon_offline: esperava Weligton';
  end if;
end $$;

-- Cenário D: todo mundo offline → cai no fallback Fernando de novo.
update public.sellers set availability = 'offline' where id in (
  '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 'db41c11b-510a-4fff-9dd8-4c86aab8d114'
);
insert into _scenario_log values (
  'D_all_offline', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'D_all_offline')
     <> '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid then
    raise exception 'D_all_offline: esperava fallback Fernando';
  end if;
end $$;

-- Cenário E: fila department-mode, 2 departamentos (A: Tiago+Ramon, B: Weligton),
-- ponteiro no departamento A → deve tentar o departamento B a seguir → seleciona
-- Weligton (único membro de B).
insert into public.departments (id, name, store_id) values
  ('dept-test-a', 'Depto A (teste)', '00000000-0000-0000-0000-000000000001'),
  ('dept-test-b', 'Depto B (teste)', '00000000-0000-0000-0000-000000000001');
update public.sellers set availability = 'online' where id = 'db41c11b-510a-4fff-9dd8-4c86aab8d114'; -- Weligton
insert into public.rotation_queues (id, store_id, target_mode, last_assigned_ref_id, skip_offline)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'department', 'dept-test-a', true);
insert into public.rotation_participants (id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled, last_assigned_member_id)
values
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', null, 'department', 'dept-test-a', 1, true, null),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', null, 'department', 'dept-test-b', 2, true, null);
insert into public.rotation_participants (id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled)
values
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'dept-test-a', 'seller', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 1, true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'dept-test-a', 'seller', 'd3ec82e5-f0a4-4d33-972f-13709da5447c', 2, true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'dept-test-b', 'seller', 'db41c11b-510a-4fff-9dd8-4c86aab8d114', 1, true);

insert into _scenario_log values (
  'E_dept_pointer_a', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'E_dept_pointer_a')
     <> 'db41c11b-510a-4fff-9dd8-4c86aab8d114'::uuid then
    raise exception 'E_dept_pointer_a: esperava Weligton (departamento B)';
  end if;
end $$;

-- Cenário F: Weligton (único membro do depto B) fica offline → depto B não tem
-- ninguém elegível → pula (dá a volta) pro depto A → ponteiro interno do depto A
-- ainda está null (fresh) → seleciona Tiago (order=1).
update public.sellers set availability = 'offline' where id = 'db41c11b-510a-4fff-9dd8-4c86aab8d114';
insert into _scenario_log values (
  'F_deptB_offline', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'F_deptB_offline')
     <> '97834e8d-e1b5-4bb7-9f25-2e58e641fdab'::uuid then
    raise exception 'F_deptB_offline: esperava Tiago (departamento A, fallback de B)';
  end if;
end $$;

select 'ALL ROTATION ASSIGNMENT TESTS PASSED' as result;

rollback;
```

- [ ] **Passo 3: Rodar o teste manualmente contra o banco (via `mcp__supabase__execute_sql`, colando o conteúdo do arquivo) antes de aplicar a migration**

Esperado: última linha `ALL ROTATION ASSIGNMENT TESTS PASSED`. (Já validado manualmente durante o design — os 6 cenários acima, direct e department mode, rodaram e passaram numa transação com rollback, sem persistir nada.)

- [ ] **Passo 4: Aplicar a migration em produção (`apply_migration` via MCP, nome do arquivo = nome da migration) e confirmar com o dono antes de aplicar**

- [ ] **Passo 5: Commit**

```bash
git add supabase/migrations/20260713190000_assign_next_from_rotation.sql supabase/tests/rotation-assignment-regression.sql
git commit -m "feat: add SQL rotation-assignment function for webhook lead creation"
```

---

### Task 2: Resolução de contato compartilhada + caminho inbound (core.ts)

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts`
- Modify: `src/providers/whatsapp/webhook/core.test.ts`

**Interfaces:**
- Consumes: nenhuma desta plan (a função SQL da Task 1 só é chamada pelo adapter na Task 4 — o core runtime-agnostic só sabe que `db.createLead(...)` devolve um `ILeadRecord` já com `sellerId` resolvido).
- Produces: `IWebhookDb` estendida (novos métodos abaixo) e a função `resolveContact` — consumida pela Task 3 (caminho echo).

- [ ] **Passo 1: Adicionar os novos tipos e métodos à interface `IWebhookDb`, e generalizar `createConversation`/`insertInboundMessage`**

Em `src/providers/whatsapp/webhook/core.ts`, logo após `export interface ICustomerRecord { id: string; }` (linha 30-32):

```ts
export interface ILeadRecord {
  id: string;
  sellerId: string;
  /** `null` when the lead is active/converted; a loss reason when marked lost. */
  lossReason: string | null;
}
```

Na interface `IWebhookDb`, depois de `createPendingCustomer` (mantém como está — ainda usado quando o telefone já é um customer real) e antes de `applyInboundContactName`, adicionar:

```ts
  findLeadByPhone(storeId: string, phoneDigits: string): Promise<ILeadRecord | null>;
  /**
   * Clears lossReason/lossNotes and resets the lead to the store's first
   * pipeline stage (by `order`) — reopens a previously lost lead so a repeat
   * inbound from the same number doesn't spawn a duplicate.
   */
  reopenLostLead(leadId: string): Promise<void>;
  /**
   * Creates a lead for a brand-new WhatsApp contact: origin='whatsapp', the
   * store's first pipeline stage, temperature='morno', seller resolved via
   * the rotation-assignment SQL function.
   */
  createLead(input: { storeId: string; phone: string; name?: string }): Promise<ILeadRecord>;
  /** Same contract as findOpenConversation but keyed by leadId instead of customerId. */
  findOpenConversationForLead(
    leadId: string,
    accountId: string,
    includeTerminal?: boolean,
  ): Promise<{ id: string; status: string } | null>;
  /** Idempotently appends conversationId to lead.conversations. */
  linkConversationToLead(leadId: string, conversationId: string): Promise<void>;
```

Alterar `createConversation` (era `customerId: string`) para:

```ts
  createConversation(input: {
    storeId: string;
    /** Exactly one of customerId/leadId is set — mirrors the app-level invariant. */
    customerId?: string | null;
    leadId?: string | null;
    accountId: string;
    assignedSellerId: string | null;
    lastMessageAt: string;
    status: "aguardando";
  }): Promise<{ id: string }>;
```

Alterar `insertInboundMessage` (era `customerId: string`) para (renomeado — o campo alimenta `messages.author_id`, um texto livre sem FK, então aceita tanto um customer quanto um lead id):

```ts
  insertInboundMessage(input: {
    conversationId: string;
    /** Feeds messages.author_id (free text, no FK) — customer OR lead id. */
    authorId: string;
    provider: "meta" | "evolution" | "evolution-go";
    text: string;
    mediaType: string | null;
    mediaFilename?: string | null;
    providerMessageId: string;
    eventKey: string;
    sentAt: string;
  }): Promise<{ id: string }>;
```

- [ ] **Passo 2: Escrever a função `resolveContact` compartilhada**

Logo antes de `export async function processWebhookEvent` em `core.ts`, adicionar:

```ts
interface IResolvedContact {
  kind: "customer" | "lead";
  id: string;
  /** Only set for kind==='lead' — the customer path stays unassigned (pool), unchanged. */
  sellerId: string | null;
}

/**
 * Resolves who a phone number is, in this order: a real customer (unchanged
 * behavior) → an existing lead (reopened if it was marked lost) → a brand-new
 * lead. Shared by the inbound-customer-message and outbound-echo paths so
 * neither one still creates a pending_review customer placeholder.
 */
async function resolveContact(
  db: IWebhookDb,
  storeId: string,
  phone: string,
  name: string | undefined,
): Promise<IResolvedContact> {
  const phoneDigits = digits(phone);
  const customer = await db.findCustomerByPhone(storeId, phoneDigits);
  if (customer) {
    return { kind: "customer", id: customer.id, sellerId: null };
  }
  const lead = await db.findLeadByPhone(storeId, phoneDigits);
  if (lead) {
    if (lead.lossReason !== null) {
      await db.reopenLostLead(lead.id);
    }
    return { kind: "lead", id: lead.id, sellerId: lead.sellerId };
  }
  const created = await db.createLead({ storeId, phone, name });
  return { kind: "lead", id: created.id, sellerId: created.sellerId };
}
```

- [ ] **Passo 3: Rewire o caminho inbound (passos 5-7 do `processWebhookEvent`) para usar `resolveContact`**

Substituir o bloco atual (linhas 666-742, do comentário "5. Customer resolution" até o fim do passo 7) por:

```ts
  // 5. Contact resolution (RF-040.2, Frente 2 2026-07-13) — a real customer
  //    keeps today's behavior (unassigned pool conversation). An unknown
  //    number becomes a Lead (reused/reopened if one already exists for this
  //    phone) instead of a pending_review customer placeholder.
  const fromDigits = digits(parsed.fromPhone);
  const contactName = looksLikeName(parsed.senderName) ? parsed.senderName : undefined;
  const resolved = await resolveContact(db, account.storeId, parsed.fromPhone, contactName);
  let contactCreated = false;
  if (resolved.kind === "customer") {
    if (contactName) {
      // Existing contact: always refresh whatsapp_name, and heal the display name
      // if it's still the phone placeholder. Best-effort: must never break the webhook.
      try {
        await db.applyInboundContactName(resolved.id, contactName);
      } catch (error) {
        warn("failed to fill customer name", {
          customerId: resolved.id,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // 6. Conversation resolution (RF-040.3) — includeTerminal:true reuses the
  //    latest conversation regardless of status; a closed one (resolvida/
  //    arquivada) is REOPENED on customer inbound instead of spawning a
  //    duplicate (spec 2026-07-03 §1.5).
  let conversation: { id: string; status: string } | null =
    resolved.kind === "customer"
      ? await db.findOpenConversation(resolved.id, account.id, true)
      : await db.findOpenConversationForLead(resolved.id, account.id, true);
  let didReopen = false;
  if (!conversation) {
    const created = await db.createConversation({
      storeId: account.storeId,
      customerId: resolved.kind === "customer" ? resolved.id : null,
      leadId: resolved.kind === "lead" ? resolved.id : null,
      accountId: account.id,
      // Customer path: unassigned pool, unchanged from today — the auto-
      // created lead path assigns the lead's own seller immediately, keeping
      // Atendimento (assigned_seller_id) and Carteira (leads.seller_id)
      // consistent (docs/dev/conversation-access-model.md).
      assignedSellerId: resolved.kind === "lead" ? resolved.sellerId : null,
      lastMessageAt: parsed.timestamp,
      status: "aguardando",
    });
    conversation = { id: created.id, status: "aguardando" };
    if (resolved.kind === "lead") {
      await db.linkConversationToLead(resolved.id, created.id);
    }
    contactCreated = resolved.kind === "lead";
  } else if (reopenOnInbound(conversation.status)) {
    await db.reopenConversation(conversation.id, parsed.timestamp);
    didReopen = true;
  }

  // 7. Persist message (RF-050) BEFORE any media work — media now or never,
  //    but the message record never depends on the download succeeding.
  const message = await db.insertInboundMessage({
    conversationId: conversation.id,
    authorId: resolved.id,
    provider,
    text: parsed.text ?? parsed.mediaCaption ?? "",
    mediaType: toMediaType(parsed.contentType),
    mediaFilename: parsed.mediaFilename ?? null,
    providerMessageId: parsed.providerMessageId,
    eventKey,
    sentAt: parsed.timestamp,
  });
```

Ajustar o bloco de auditoria mais abaixo (era `customerCreated,` no `after`) para:

```ts
      contactKind: resolved.kind,
      contactCreated,
```

- [ ] **Passo 4: Atualizar o fake `IWebhookDb` em `core.test.ts` com os novos métodos**

No `IFakeState` (logo após o array `customers`), adicionar:

```ts
  leads: Array<{
    id: string;
    storeId: string;
    phoneDigits: string;
    sellerId: string;
    lossReason: string | null;
    conversations: string[];
  }>;
```

No `makeFakeDb`, adicionar (mantendo os métodos já existentes intactos):

```ts
    findLeadByPhone: async (storeId, digits) => {
      const found = state.leads.find((l) => l.storeId === storeId && l.phoneDigits === digits);
      return found ? { id: found.id, sellerId: found.sellerId, lossReason: found.lossReason } : null;
    },
    reopenLostLead: async (leadId) => {
      const lead = state.leads.find((l) => l.id === leadId);
      if (lead) lead.lossReason = null;
    },
    createLead: async ({ storeId, phone }) => {
      const lead = {
        id: nextId("lead"),
        storeId,
        phoneDigits: phone.replace(/\D/g, ""),
        sellerId: "seller-rotation-1",
        lossReason: null,
        conversations: [],
      };
      state.leads.push(lead);
      return { id: lead.id, sellerId: lead.sellerId, lossReason: null };
    },
    findOpenConversationForLead: async (leadId, accountId, includeTerminal) => {
      const found = state.conversations.find(
        (c) =>
          c.leadId === leadId &&
          c.accountId === accountId &&
          (includeTerminal || !["resolvida", "arquivada"].includes(c.status ?? "")),
      );
      return found ? { id: found.id, status: found.status ?? "aguardando" } : null;
    },
    linkConversationToLead: async (leadId, conversationId) => {
      const lead = state.leads.find((l) => l.id === leadId);
      if (lead && !lead.conversations.includes(conversationId)) lead.conversations.push(conversationId);
    },
```

Ajustar `createConversation`'s fake para aceitar `leadId` e gravar `leadId` na conversa (some junto de `customerId` no objeto `conversation` empurrado em `state.conversations`), e ajustar `insertInboundMessage`'s fake para receber `authorId` em vez de `customerId` (só o nome do parâmetro no destructuring muda). Também adicionar `leads: []` ao objeto `IFakeState` inicial usado pelos testes existentes (todos os `describe`/`it` que constroem o estado inicial).

- [ ] **Passo 5: Escrever os testes novos**

Em `core.test.ts`, dentro do `describe` do caminho inbound (mensagem recebida):

```ts
it("creates a lead (not a pending customer) for a brand-new phone number", async () => {
  const state = makeInitialState(); // já existe no arquivo — helper que monta um IFakeState vazio
  const db = makeFakeDb(state);
  const result = await processWebhookEvent({
    provider: "evolution",
    rawPayload: buildInboundPayload({ fromPhone: "+555400000000", text: "Oi" }), // usa o mesmo builder já existente no arquivo
    db,
    buildProvider: () => new MockWhatsAppProvider(),
    traceId: "trace-1",
  });
  expect(result.outcome).toBe("message-created");
  expect(state.customers).toHaveLength(0);
  expect(state.leads).toHaveLength(1);
  const conversation = state.conversations[0];
  expect(conversation.leadId).toBe(state.leads[0]!.id);
  expect(conversation.customerId).toBeUndefined();
  expect(conversation.assignedSellerId).toBe("seller-rotation-1");
});

it("reuses an existing lead for a repeat inbound from the same number", async () => {
  const state = makeInitialState();
  state.leads.push({
    id: "lead-existing",
    storeId: "store-1",
    phoneDigits: "555400000000",
    sellerId: "seller-existing",
    lossReason: null,
    conversations: [],
  });
  const db = makeFakeDb(state);
  await processWebhookEvent({
    provider: "evolution",
    rawPayload: buildInboundPayload({ fromPhone: "+555400000000", text: "Oi de novo" }),
    db,
    buildProvider: () => new MockWhatsAppProvider(),
    traceId: "trace-2",
  });
  expect(state.leads).toHaveLength(1); // não criou um segundo lead
});

it("reopens a lost lead on repeat inbound", async () => {
  const state = makeInitialState();
  state.leads.push({
    id: "lead-lost",
    storeId: "store-1",
    phoneDigits: "555400000000",
    sellerId: "seller-existing",
    lossReason: "sem contato",
    conversations: [],
  });
  const db = makeFakeDb(state);
  await processWebhookEvent({
    provider: "evolution",
    rawPayload: buildInboundPayload({ fromPhone: "+555400000000", text: "Oi de volta" }),
    db,
    buildProvider: () => new MockWhatsAppProvider(),
    traceId: "trace-3",
  });
  expect(state.leads[0]!.lossReason).toBeNull();
});
```

Ajustar os nomes exatos de `makeInitialState`/`buildInboundPayload` para os helpers reais já existentes em `core.test.ts` (o arquivo já tem builders equivalentes para os testes atuais do caminho inbound — usar os mesmos, só variando `fromPhone`).

- [ ] **Passo 6: Rodar os testes**

Run: `bun run test src/providers/whatsapp/webhook/core.test.ts`
Expected: todos os testes passam, incluindo os 3 novos e os pré-existentes (o caminho `findCustomerByPhone` encontrado continua idêntico).

- [ ] **Passo 7: Commit**

```bash
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts
git commit -m "feat: webhook creates/reuses a Lead for unknown WhatsApp contacts (inbound path)"
```

---

### Task 3: Rewire o caminho de eco de saída

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts`
- Modify: `src/providers/whatsapp/webhook/core.test.ts`

**Interfaces:**
- Consumes: `resolveContact` (Task 2).
- Produces: nenhuma nova — só reaproveita o caminho já criado.

- [ ] **Passo 1: Rewire o bloco do eco (linhas ~558-594, dentro do `if (parsed.type === "outbound-echo")`)**

Substituir:

```ts
    const toDigits = digits(parsed.toPhone);
    let customer = await db.findCustomerByPhone(account.storeId, toDigits);
    let customerCreated = false;
    if (!customer) {
      customer = await db.createPendingCustomer({
        storeId: account.storeId,
        phone: parsed.toPhone,
      });
      customerCreated = true;
      // Same background photo fetch when WE start the chat from the phone.
      args.onCustomerAutoCreated?.({
        customerId: customer.id,
        phone: parsed.toPhone,
        account,
      });
    }
    // OPEN-ONLY lookup (includeTerminal omitted): the echo is business-sent,
    // never reopens a closed conversation — spawns a fresh one instead
    // (spec 2026-07-03 §1.5).
    let conversation: { id: string } | null = await db.findOpenConversation(
      customer.id,
      account.id,
    );
    if (!conversation) {
      conversation = await db.createConversation({
        storeId: account.storeId,
        customerId: customer.id,
        accountId: account.id,
        // UNASSIGNED (pool): the webhook cannot know which seller sent from the
        // phone, so it never pins the chat — it lands QUEUED ('aguardando') for
        // someone to claim in the app (spec 2026-07-02). Visibility comes from
        // instance access (can_access_conversation).
        assignedSellerId: null,
        lastMessageAt: parsed.timestamp,
        status: "aguardando",
      });
    }
```

por (nota: `onCustomerAutoCreated` deixa de ser chamado aqui — só disparava na criação de um customer novo, o que não acontece mais neste caminho; leads não têm busca de foto de perfil ainda, gap conhecido e fora de escopo desta frente):

```ts
    const toDigits = digits(parsed.toPhone);
    const resolved = await resolveContact(db, account.storeId, parsed.toPhone, undefined);
    // OPEN-ONLY lookup (includeTerminal omitted): the echo is business-sent,
    // never reopens a closed conversation — spawns a fresh one instead
    // (spec 2026-07-03 §1.5).
    let conversation: { id: string } | null =
      resolved.kind === "customer"
        ? await db.findOpenConversation(resolved.id, account.id)
        : await db.findOpenConversationForLead(resolved.id, account.id);
    if (!conversation) {
      conversation = await db.createConversation({
        storeId: account.storeId,
        customerId: resolved.kind === "customer" ? resolved.id : null,
        leadId: resolved.kind === "lead" ? resolved.id : null,
        accountId: account.id,
        assignedSellerId: resolved.kind === "lead" ? resolved.sellerId : null,
        lastMessageAt: parsed.timestamp,
        status: "aguardando",
      });
      if (resolved.kind === "lead") {
        await db.linkConversationToLead(resolved.id, conversation.id);
      }
    }
```

- [ ] **Passo 2: Ajustar o restante do bloco de eco que referenciava `customer`/`customerCreated`**

Mais abaixo no mesmo bloco (`insertOutboundEchoMessage`, e o `audit`/`log` no final do bloco de eco), trocar qualquer referência a `customer.id` por `resolved.id`, e no objeto de auditoria trocar `customerCreated,` por `contactKind: resolved.kind,` (mesma convenção da Task 2).

- [ ] **Passo 3: Testes novos no `describe` do caminho de eco**

```ts
it("echo path creates a lead (not a pending customer) for a brand-new outbound number", async () => {
  const state = makeInitialState();
  const db = makeFakeDb(state);
  const result = await processWebhookEvent({
    provider: "evolution",
    rawPayload: buildEchoPayload({ toPhone: "+555400000000", text: "Oi, aqui é da Gallo" }), // builder já existente no arquivo para o caminho de eco
    db,
    buildProvider: () => new MockWhatsAppProvider(),
    traceId: "trace-echo-1",
  });
  expect(result.outcome).toBe("echo-created");
  expect(state.customers).toHaveLength(0);
  expect(state.leads).toHaveLength(1);
  expect(state.conversations[0]!.leadId).toBe(state.leads[0]!.id);
  expect(state.conversations[0]!.assignedSellerId).toBe("seller-rotation-1");
});
```

Ajustar `buildEchoPayload` para o nome real do builder de eco já existente em `core.test.ts`.

- [ ] **Passo 4: Rodar os testes**

Run: `bun run test src/providers/whatsapp/webhook/core.test.ts`
Expected: todos passam, incluindo o novo teste de eco.

- [ ] **Passo 5: Commit**

```bash
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts
git commit -m "feat: webhook creates/reuses a Lead for unknown contacts (outbound-echo path)"
```

---

### Task 4: Adapter Supabase + sync + deploy

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`
- Modify (gerado pelo script, não editar à mão): `supabase/functions/_shared/whatsapp/webhook/core.ts` (ou caminho equivalente já usado pelo sync)

**Interfaces:**
- Consumes: `IWebhookDb` estendida (Task 2), `public.assign_next_from_rotation` (Task 1).
- Produces: nada consumido por outra task — é o fio final que liga tudo em produção.

- [ ] **Passo 1: Implementar `findLeadByPhone`, `reopenLostLead`, `createLead`, `findOpenConversationForLead`, `linkConversationToLead` no adapter**

Em `supabase/functions/whatsapp-webhook/index.ts`, logo após a implementação existente de `createPendingCustomer` (mantém como está):

```ts
    async findLeadByPhone(storeId, phoneDigits) {
      const { data } = await admin
        .from("leads")
        .select("id, seller_id, loss_reason, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find(
        (candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits,
      );
      return row
        ? { id: row.id as string, sellerId: row.seller_id as string, lossReason: (row.loss_reason as string | null) ?? null }
        : null;
    },
    async reopenLostLead(leadId) {
      const { data: store } = await admin
        .from("leads")
        .select("store_id")
        .eq("id", leadId)
        .single();
      const firstStage = store ? await getFirstPipelineStage(store.store_id as string) : DEFAULT_FIRST_STAGE;
      const { error } = await admin
        .from("leads")
        .update({ loss_reason: null, loss_notes: null, stage: firstStage })
        .eq("id", leadId);
      if (error) throw new Error(`reopenLostLead: ${error.message}`);
    },
    async createLead({ storeId, phone, name }) {
      const sellerId = await assignNextFromRotation(storeId);
      const firstStage = await getFirstPipelineStage(storeId);
      const { data, error } = await admin
        .from("leads")
        .insert({
          store_id: storeId,
          seller_id: sellerId,
          name: name ?? phone,
          phone,
          stage: firstStage,
          temperature: "morno",
          origin: "whatsapp",
          conversations: [],
          tags: [],
        })
        .select("id, seller_id")
        .single();
      if (error) throw new Error(`createLead: ${error.message}`);
      return { id: data.id as string, sellerId: data.seller_id as string, lossReason: null };
    },
    async findOpenConversationForLead(leadId, accountId, includeTerminal) {
      let query = admin
        .from("conversations")
        .select("id, status")
        .eq("lead_id", leadId)
        .eq("whatsapp_account_id", accountId);
      if (!includeTerminal) {
        query = query.not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`);
      }
      const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ? { id: data.id as string, status: data.status as string } : null;
    },
    async linkConversationToLead(leadId, conversationId) {
      const { data } = await admin
        .from("leads")
        .select("conversations")
        .eq("id", leadId)
        .maybeSingle();
      const current: string[] = (data?.conversations as string[] | null) ?? [];
      if (current.includes(conversationId)) return;
      await admin
        .from("leads")
        .update({ conversations: [...current, conversationId] })
        .eq("id", leadId);
    },
```

Adicionar, no topo do arquivo (perto de outras constantes como `CLOSED_CONVERSATION_STATUSES`):

```ts
const DEFAULT_FIRST_STAGE = { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" };

async function assignNextFromRotation(storeId: string): Promise<string> {
  const { data, error } = await admin.rpc("assign_next_from_rotation", { p_store_id: storeId });
  if (error) throw new Error(`assign_next_from_rotation: ${error.message}`);
  return data as string;
}

async function getFirstPipelineStage(storeId: string): Promise<Record<string, unknown>> {
  const { data } = await admin.from("stores").select("settings").eq("id", storeId).maybeSingle();
  const stages = (data?.settings as { pipelineStages?: Array<Record<string, unknown>> } | null)
    ?.pipelineStages;
  if (!stages || stages.length === 0) return DEFAULT_FIRST_STAGE;
  return [...stages].sort((a, b) => (a.order as number) - (b.order as number))[0]!;
}
```

- [ ] **Passo 2: Atualizar `createConversation` e `insertInboundMessage` do adapter para os novos parâmetros**

```ts
    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          store_id: input.storeId,
          customer_id: input.customerId ?? null,
          lead_id: input.leadId ?? null,
          whatsapp_account_id: input.accountId,
          assigned_seller_id: input.assignedSellerId,
          channel: "whatsapp",
          status: input.status,
          last_message_at: input.lastMessageAt,
          unread_count: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(`createConversation: ${error.message}`);
      return { id: data.id as string };
    },
    async insertInboundMessage(input) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          direction: "in",
          author_type: "customer",
          author_id: input.authorId,
          provider: input.provider,
          text: input.text,
          media_type: input.mediaType,
          media_filename: input.mediaFilename ?? null,
          status: "delivered",
          sent_at: input.sentAt,
          provider_message_id: input.providerMessageId,
          webhook_event_ids: [input.eventKey],
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertInboundMessage: ${error.message}`);
      return { id: data.id as string };
    },
```

- [ ] **Passo 3: Sincronizar o core runtime-agnostic pro `_shared/`**

Run: `bun run tsx scripts/sync-whatsapp-shared.ts` (ou o comando exato documentado em `docs/dev/whatsapp-providers.md` — conferir o `package.json`/README do script antes de rodar).
Expected: o script reporta os arquivos copiados/atualizados sob `supabase/functions/_shared/whatsapp/`, incluindo `core.ts` com as mudanças das Tasks 2 e 3.

- [ ] **Passo 4: Confirmar com o dono, depois aplicar/deployar na ordem certa**

1. Confirmar que a migration da Task 1 já está aplicada em produção (pré-requisito).
2. `bunx tsc --noEmit` limpo para os arquivos tocados (delta contra `main`, conforme convenção do projeto).
3. `bun run test` — suíte completa verde.
4. Deploy da edge function: `npx supabase functions deploy whatsapp-webhook --project-ref njizaasajkdqptlxddqn` (confirmar com o dono antes de rodar — regra do projeto de nunca deployar edge em prod sem OK).

- [ ] **Passo 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts supabase/functions/_shared/whatsapp/
git commit -m "feat: wire lead creation into the production whatsapp-webhook adapter"
```

---

### Task 5: Aposentar o frontend de `contact-review`

**Files:**
- Delete: `src/features/contact-review/` (toda a pasta — `components/`, `hooks/`, `pages/`, `engine/`, `i18n/`, `index.ts`)
- Modify: qualquer rota que monte `PendingContactsPage` (buscar em `src/routes/`)
- Modify: qualquer componente que renderize `PendingContactBanner` fora da própria feature (ex.: ficha do cliente/conversa)

**Interfaces:** nenhuma — ponto de saída do plano, sem consumidores depois.

- [ ] **Passo 1: Localizar todos os pontos de entrada da feature**

```bash
grep -rl "contact-review" src/routes src/features --include="*.tsx" --include="*.ts" | grep -v "src/features/contact-review"
```

Esperado: a rota que monta `PendingContactsPage`, e o(s) componente(s) que renderizam `PendingContactBanner` (ex.: a aba/rail de "Ficha" da conversa ou do cliente).

- [ ] **Passo 2: Remover os pontos de entrada encontrados no Passo 1** (o import e o JSX que os renderiza — sem deixar rota quebrada; se a rota for dedicada só a essa página, remover o arquivo de rota também e rodar o gerador do TanStack Router, ou aguardar o `routeTree.gen.ts` regenerar no próximo `bun run dev`/`build`).

- [ ] **Passo 3: Remover a pasta da feature**

```bash
git rm -r src/features/contact-review
```

- [ ] **Passo 4: Checar por imports órfãos**

```bash
bunx tsc --noEmit
```

Expected: nenhum erro novo referenciando `contact-review` (comparar contra o baseline pré-existente do projeto, conforme `docs/dev/CLAUDE.md` — "avaliar código novo por delta").

- [ ] **Passo 5: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: nenhum teste de `contact-review` sobra (foram removidos junto com a pasta) e o restante da suíte segue verde.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "chore: retire the contact-review feature (superseded by webhook-created Leads)"
```

- [ ] **Passo 7: Nota final para o dono**

As RPCs de banco (`convert_pending_contact`, `mark_contact_not_customer`, a de restore) **ficam no banco, sem chamador** — decisão do design, não remover nesta task.
