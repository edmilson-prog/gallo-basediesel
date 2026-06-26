# WhatsApp Multi-Instância — Plano 1: Fundação de dados & acesso RLS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o schema e a camada de RLS que sustentam o multi-instância (finalidade da instância, regras de acesso, participantes de conversa, helpers de acesso) e **fechar o vazamento de leitura de `messages`** (bloqueio #0) delegando toda autorização a um único helper `can_access_conversation`.

**Architecture:** SQL puro (Postgres/Supabase). Acesso resolvido **ao vivo** por funções `security definer stable set search_path = ''` — sem tabela materializada. As policies de `conversations`, `messages` e `conversation_participants` delegam a `can_access_conversation(conversation_id)`, fonte única de verdade. Migrations versionadas em `supabase/migrations/` (espelho do remoto) e validadas pelo harness `supabase/tests/rls-regression.sql`.

**Tech Stack:** PostgreSQL 15 (Supabase), RLS, plpgsql/sql functions, harness de teste SQL plano (sem pgTAP).

**Escopo deste plano (1 de 4):** Só a fundação SQL. NÃO inclui TypeScript (tipos/providers → Plano 2), roteamento server-side (webhook/send → Plano 3) nem UI (→ Plano 4). O critério de acesso `departamento` é **adiado para pós-PRD-211 N:N**; este plano entrega `kind in ('seller','role','store')`.

---

## ✅ Resultado da execução (2026-06-15)

EXECUTADO na branch `feat/whatsapp-multi-instancia` (commits `17825d9`, `d6666f5`, `3a5fd53`).

- **Task 0 (auditoria):** o "vazamento #0" **não existe**. As policies reais de `messages` em prod são store-scoped via subselect que sofre a RLS de `conversations` → já protegidas por dono/pool. Prova empírica (impersonação, transação-rollback): vendedor não-staff vê 354 msgs = suas+pool, não as 24.837 de outros.
- **Tasks 1–4:** `purpose`, `whatsapp_account_access_rules`, `conversation_participants` e os 3 helpers — aplicados em prod e commitados.
- **Backfill (novo, `130350`):** `kind=store` por instância existente — preserva o pool ao ativar o `can_access` (decisão do dono: aplicar agora com backfill).
- **Task 5 (`130400`):** reescrita aplicada — `conversations`/`messages` delegam a `can_access_conversation`. Validado: vendedor segue vendo 354 msgs (sem regressão, sem vazamento).
- **rls-regression:** asserts de estrutura + anti-leak (probe-based) adicionados; validado em prod (`leaked=0`).

A reescrita deixou de ser "fix de segurança" e virou **robustez + habilitação** do pool-por-instância/participante.

---

## ⚠️ Pré-condições de execução (ler antes da Task 0)

- **`.env.local` aponta para PRODUÇÃO** (`njizaasajkdqptlxddqn`). Toda migration/SQL atinge produção e **exige autorização explícita do dono** a cada passo. Nenhuma migration é aplicada sem o "ok" dele.
- **Regra do projeto:** todo `apply_migration` é **espelhado no Git** (`supabase/migrations/`) no mesmo PR. Criar o arquivo `.sql` **e** aplicar.
- **Aplicação preferida:** CLI Supabase autenticada — `npx supabase db push` (aplica os arquivos novos de `supabase/migrations/`). Alternativa por migration única: MCP `apply_migration`. Sempre com autorização.
- **Testes RLS:** `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`. O script é `begin … rollback` (não persiste), mas **executa contra prod** — também requer autorização. Sucesso termina com `ALL RLS REGRESSION TESTS PASSED`.
- **Branch:** criar `feat/whatsapp-multi-instancia` a partir de `main` antes da Task 1. Não commitar em `main`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260615130000_whatsapp_multi_purpose.sql` | Coluna `purpose` em `whatsapp_accounts` (CREATE) |
| `supabase/migrations/20260615130100_whatsapp_multi_access_rules.sql` | Tabela `whatsapp_account_access_rules` + índice único + RLS staff-only (CREATE) |
| `supabase/migrations/20260615130200_whatsapp_multi_participants.sql` | Tabela `conversation_participants` + RLS (CREATE) |
| `supabase/migrations/20260615130300_whatsapp_multi_access_helpers.sql` | Helpers `current_seller_accessible_account_ids`, `is_conversation_participant`, `can_access_conversation` (CREATE) |
| `supabase/migrations/20260615130400_whatsapp_multi_rls_delegate.sql` | Reescrita das policies de `conversations` e `messages` → delegam a `can_access_conversation` (**fix #0**) |
| `supabase/tests/rls-regression.sql` | Asserts novos (MODIFY — inserir antes do `commit;` final) |

> Os timestamps acima assumem que `20260615130000` é maior que a última migration aplicada. Se não for, renomear todos os 5 mantendo a ordem relativa.

---

## Task 0: Auditoria das policies reais de `messages` (diagnóstico, read-only)

**Por quê:** o Git versiona apenas `messages_select_poc_temp = using(true) to anon, authenticated`. A revisão concluiu "store-scoped". Antes de reescrever, é preciso saber o estado **real** em prod (define a severidade do vazamento e se há policies não-espelhadas).

**Files:** nenhum (diagnóstico).

- [ ] **Step 1: Pedir autorização e rodar o SELECT read-only**

Requer "ok" explícito do dono (é prod). Rodar via MCP `execute_sql` **ou** o dono executa no terminal com `! psql …`:

```sql
select tablename, policyname, roles, cmd, qual as using_expr, with_check
from pg_policies
where schemaname = 'public' and tablename in ('messages','conversations')
order by tablename, cmd, policyname;
```

- [ ] **Step 2: Registrar o achado**

Anotar no PR (e atualizar a memória `project_whatsapp_multi_instance_planned`) qual o estado real:
- Se aparecer `messages_select_poc_temp` com `using(true)` → vazamento **total** confirmado (anon lê tudo). Severidade crítica.
- Se aparecerem policies store-scoped não-versionadas → registrar o texto exato e **adicioná-las ao Git retroativamente** (a regra de espelhamento foi violada em prod).

Em ambos os casos o fix da Task 5 é o mesmo. Esta task **não altera nada** — só informa.

---

## Task 1: Coluna `purpose` em `whatsapp_accounts`

**Files:**
- Create: `supabase/migrations/20260615130000_whatsapp_multi_purpose.sql`
- Test: `supabase/tests/rls-regression.sql` (adicionar bloco)

- [ ] **Step 1: Escrever o assert que falha**

No `rls-regression.sql`, logo após o bloco do OWNER (depois do `reset role;` da seção owner, antes do bloco do lucas), inserir:

```sql
-- ---------------------------------------------------------------------------
-- Multi-instância: coluna purpose existe e tem default 'atendimento'.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_accounts'
      and column_name = 'purpose'
  ) then
    raise exception 'whatsapp_accounts.purpose column is missing';
  end if;
end $$;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: FAIL com `whatsapp_accounts.purpose column is missing`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20260615130000_whatsapp_multi_purpose.sql`:

```sql
-- Multi-instância — finalidade da instância (atendimento/campanha/ambos).
-- Default 'atendimento' cobre as contas existentes sem backfill manual.
alter table public.whatsapp_accounts
  add column if not exists purpose text not null default 'atendimento'
    check (purpose in ('atendimento','campanha','ambos'));

comment on column public.whatsapp_accounts.purpose is
  'Multi-instância: onde a instância aparece — atendimento (caixa), campanha (disparo) ou ambos.';
```

- [ ] **Step 4: Aplicar (com autorização) e rodar o teste**

Run: `npx supabase db push` então `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: termina com `ALL RLS REGRESSION TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260615130000_whatsapp_multi_purpose.sql supabase/tests/rls-regression.sql
git commit -m "feat: add purpose column to whatsapp_accounts (multi-instance)"
```

---

## Task 2: Tabela `whatsapp_account_access_rules` (Camada 1)

**Files:**
- Create: `supabase/migrations/20260615130100_whatsapp_multi_access_rules.sql`
- Test: `supabase/tests/rls-regression.sql`

- [ ] **Step 1: Escrever o assert que falha**

Adicionar após o bloco da Task 1:

```sql
-- ---------------------------------------------------------------------------
-- Multi-instância: access_rules existe, é RLS-protegida e staff-only para escrita.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='whatsapp_account_access_rules') then
    raise exception 'whatsapp_account_access_rules table is missing';
  end if;
  if not exists (select 1 from pg_tables
    where schemaname='public' and tablename='whatsapp_account_access_rules' and rowsecurity) then
    raise exception 'whatsapp_account_access_rules must have RLS enabled';
  end if;
end $$;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: FAIL com `whatsapp_account_access_rules table is missing`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20260615130100_whatsapp_multi_access_rules.sql`:

```sql
-- Multi-instância — Camada 1: regras OU de acesso à instância.
-- kind='seller' (uuid do seller) | 'role' (claim cru, ex. 'seller_internal') | 'store' (uuid da loja).
-- 'department' será adicionado pós-PRD-211 (N:N), fora deste escopo.
create table if not exists public.whatsapp_account_access_rules (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null
    references public.whatsapp_accounts(id) on delete cascade,
  kind text not null check (kind in ('seller','role','store')),
  target_value text not null,
  created_at timestamptz not null default now(),
  unique (whatsapp_account_id, kind, target_value)
);

create index if not exists waar_account_idx
  on public.whatsapp_account_access_rules (whatsapp_account_id);

alter table public.whatsapp_account_access_rules enable row level security;

-- Staff (owner/manager) da loja da conta gerencia as regras. Leitura funcional
-- do pool passa pelo helper SECURITY DEFINER da Task 4, então RLS aqui é staff-only.
drop policy if exists waar_staff_all on public.whatsapp_account_access_rules;
create policy waar_staff_all on public.whatsapp_account_access_rules
  for all to authenticated
  using (
    exists (
      select 1 from public.whatsapp_accounts a
      where a.id = whatsapp_account_id
        and a.store_id = (select public.current_store_id())
        and (select public.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.whatsapp_accounts a
      where a.id = whatsapp_account_id
        and a.store_id = (select public.current_store_id())
        and (select public.is_staff())
    )
  );
```

- [ ] **Step 4: Aplicar e rodar o teste**

Run: `npx supabase db push` então `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: `ALL RLS REGRESSION TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260615130100_whatsapp_multi_access_rules.sql supabase/tests/rls-regression.sql
git commit -m "feat: add whatsapp_account_access_rules table with staff-only RLS"
```

---

## Task 3: Tabela `conversation_participants` (Camada 2)

**Files:**
- Create: `supabase/migrations/20260615130200_whatsapp_multi_participants.sql`
- Test: `supabase/tests/rls-regression.sql`

- [ ] **Step 1: Escrever o assert que falha**

Adicionar após o bloco da Task 2:

```sql
-- ---------------------------------------------------------------------------
-- Multi-instância: conversation_participants existe e é RLS-protegida.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='conversation_participants') then
    raise exception 'conversation_participants table is missing';
  end if;
  if not exists (select 1 from pg_tables
    where schemaname='public' and tablename='conversation_participants' and rowsecurity) then
    raise exception 'conversation_participants must have RLS enabled';
  end if;
end $$;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: FAIL com `conversation_participants table is missing`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20260615130200_whatsapp_multi_participants.sql`. A RLS aqui **não** usa `can_access_conversation` (que só nasce na Task 4) — evita dependência de ordem:

```sql
-- Multi-instância — Camada 2: co-responsáveis de uma conversa.
-- FK do seller é NO ACTION (default): soft-delete do seller preserva o histórico.
create table if not exists public.conversation_participants (
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  added_by uuid references public.sellers(id),
  added_at timestamptz not null default now(),
  primary key (conversation_id, seller_id)
);

create index if not exists cp_seller_idx
  on public.conversation_participants (seller_id);

alter table public.conversation_participants enable row level security;

-- SELECT: staff, o próprio participante, ou o responsável da conversa.
drop policy if exists cp_select on public.conversation_participants;
create policy cp_select on public.conversation_participants
  for select to authenticated
  using (
    (select public.is_staff())
    or seller_id = (select public.current_seller_id())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );

-- INSERT/DELETE: staff ou o responsável da conversa adiciona/remove co-responsáveis.
drop policy if exists cp_write on public.conversation_participants;
create policy cp_write on public.conversation_participants
  for all to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  )
  with check (
    (select public.is_staff())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );
```

> Nota: a policy `for all` (`cp_write`) cobre INSERT/UPDATE/DELETE; a `cp_select` cobre SELECT. Postgres aplica a mais permissiva por comando — as duas coexistem sem conflito (SELECT usa `cp_select`; mutações usam `cp_write`).

- [ ] **Step 4: Aplicar e rodar o teste**

Run: `npx supabase db push` então `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: `ALL RLS REGRESSION TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260615130200_whatsapp_multi_participants.sql supabase/tests/rls-regression.sql
git commit -m "feat: add conversation_participants table with RLS"
```

---

## Task 4: Helpers de acesso (`security definer`)

**Files:**
- Create: `supabase/migrations/20260615130300_whatsapp_multi_access_helpers.sql`
- Test: `supabase/tests/rls-regression.sql`

> **Por que `security definer`:** `can_access_conversation` lê `conversations` e `is_conversation_participant` lê `conversation_participants`. Como as policies dessas tabelas chamam os helpers, eles **precisam** rodar como definer (bypassam RLS na leitura interna) para não recursar.

- [ ] **Step 1: Escrever o assert que falha**

Adicionar após o bloco da Task 3:

```sql
-- ---------------------------------------------------------------------------
-- Multi-instância: helpers de acesso existem e são SECURITY DEFINER.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.can_access_conversation(uuid)') is null then
    raise exception 'can_access_conversation(uuid) is missing';
  end if;
  if to_regprocedure('public.current_seller_accessible_account_ids()') is null then
    raise exception 'current_seller_accessible_account_ids() is missing';
  end if;
  if to_regprocedure('public.is_conversation_participant(uuid)') is null then
    raise exception 'is_conversation_participant(uuid) is missing';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'can_access_conversation' and prosecdef
  ) then
    raise exception 'can_access_conversation must be SECURITY DEFINER';
  end if;
end $$;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: FAIL com `can_access_conversation(uuid) is missing`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20260615130300_whatsapp_multi_access_helpers.sql`:

```sql
-- Multi-instância — helpers de acesso. SECURITY DEFINER STABLE search_path=''
-- para bypassar a RLS das tabelas-base (sem recursão) e ser cacheável no plano.

-- Instâncias que o seller atual acessa (OU das regras + papel/loja do claim).
create or replace function public.current_seller_accessible_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select a.id
  from public.whatsapp_accounts a
  where a.store_id = public.current_store_id()
    and (
      public.is_staff()  -- owner/manager veem todas as instâncias da loja
      or exists (
        select 1 from public.whatsapp_account_access_rules r
        where r.whatsapp_account_id = a.id
          and (
            (r.kind = 'seller' and r.target_value = public.current_seller_id()::text)
            or (r.kind = 'role'   and r.target_value = public.current_app_role())
            or (r.kind = 'store'  and r.target_value = public.current_store_id()::text)
          )
      )
    );
$function$;

-- O seller atual é co-responsável (participante) da conversa?
create or replace function public.is_conversation_participant(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = conv
      and p.seller_id = public.current_seller_id()
  );
$function$;

-- Ponto ÚNICO de decisão de acesso a uma conversa.
create or replace function public.can_access_conversation(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.conversations c
    where c.id = conv
      and c.store_id = public.current_store_id()
      and (
        public.is_staff()
        or c.assigned_seller_id = public.current_seller_id()
        or public.is_conversation_participant(conv)
        -- Pool de uma instância que o seller acessa:
        or (
          c.assigned_seller_id is null
          and c.whatsapp_account_id is not null
          and c.whatsapp_account_id in (select public.current_seller_accessible_account_ids())
        )
        -- Pool de canal não-WhatsApp (sem instância): preserva o comportamento atual
        -- (qualquer seller da loja vê o pool).
        or (
          c.assigned_seller_id is null
          and c.whatsapp_account_id is null
        )
      )
  );
$function$;
```

- [ ] **Step 4: Aplicar e rodar o teste**

Run: `npx supabase db push` então `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: `ALL RLS REGRESSION TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260615130300_whatsapp_multi_access_helpers.sql supabase/tests/rls-regression.sql
git commit -m "feat: add can_access_conversation access helpers (security definer)"
```

---

## Task 5: Reescrita das policies — delegar a `can_access_conversation` (FIX #0)

**Files:**
- Create: `supabase/migrations/20260615130400_whatsapp_multi_rls_delegate.sql`
- Test: `supabase/tests/rls-regression.sql`

- [ ] **Step 1: Escrever o assert de segurança que falha (prova o vazamento)**

No bloco do **lucas** (não-staff), após os asserts existentes de `orders`/`customers`, adicionar — e também garantir o acesso legítimo do owner. Inserir este bloco dentro da seção do lucas (com o JWT do lucas já configurado):

```sql
  -- Multi-instância FIX #0: lucas não pode ler o CONTEÚDO de mensagens de uma
  -- conversa atribuída a OUTRO vendedor (vazamento que existia em messages).
  if (
    select count(*) from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where c.assigned_seller_id is not null
      and c.assigned_seller_id <> lucas
      and not public.is_conversation_participant(c.id)
  ) <> 0 then
    raise exception 'lucas: must not read messages of conversations owned by other sellers (leak)';
  end if;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: FAIL com `lucas: must not read messages of conversations owned by other sellers (leak)` — confirma o vazamento descrito no bloqueio #0. (Se por acaso passar, registrar: prod já tinha hardening não-versionado; o fix abaixo padroniza mesmo assim.)

- [ ] **Step 3: Escrever a migration de reescrita**

`supabase/migrations/20260615130400_whatsapp_multi_rls_delegate.sql`:

```sql
-- Multi-instância FIX #0 — toda RLS de leitura/escrita de conversas e mensagens
-- passa a delegar ao ponto único can_access_conversation. Fecha o vazamento de
-- messages (policy poc_temp using(true)) e estende o pool para "instância acessível".

-- ============================ messages ============================
-- Remove a policy permissiva legada e qualquer policy poc.
drop policy if exists messages_select_poc_temp on public.messages;
drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated
  using ((select public.can_access_conversation(conversation_id)));

create policy messages_insert on public.messages
  for insert to authenticated
  with check ((select public.can_access_conversation(conversation_id)));

create policy messages_update on public.messages
  for update to authenticated
  using ((select public.can_access_conversation(conversation_id)))
  with check ((select public.can_access_conversation(conversation_id)));

create policy messages_delete on public.messages
  for delete to authenticated
  using ((select public.can_access_conversation(conversation_id)));

-- ========================== conversations ==========================
-- SELECT passa a usar can_access (own + participante + pool-da-instância + staff).
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using ((select public.can_access_conversation(id)));

-- UPDATE: USING usa can_access (fecha o pool por instância); WITH CHECK mantém o
-- invariante de não reatribuir para outro (reivindicar null->self, ou staff).
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using ((select public.can_access_conversation(id)))
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or assigned_seller_id = (select public.current_seller_id())
      or assigned_seller_id is null
    )
  );
```

> **Limitação conhecida (MVP):** um participante puro (não-dono) tem leitura e INSERT de mensagem, mas o `WITH CHECK` do UPDATE de `conversations` impede que ele altere a conversa mantendo outro dono (ex.: marcar como lida). Refinamento futuro, fora deste plano.

- [ ] **Step 4: Aplicar e rodar o teste**

Run: `npx supabase db push` então `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql`
Expected: `ALL RLS REGRESSION TESTS PASSED` — o assert anti-leak agora passa e o owner segue vendo tudo.

- [ ] **Step 5: Rodar o advisor de segurança**

Run (MCP, com autorização): `get_advisors(type: "security")`
Expected: nenhum aviso novo de "policy permissiva"/"RLS disabled" em `messages`/`conversations`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260615130400_whatsapp_multi_rls_delegate.sql supabase/tests/rls-regression.sql
git commit -m "fix: delegate messages/conversations RLS to can_access_conversation (close read leak)"
```

---

## Self-Review

**1. Spec coverage (§5 e §6 #0 do spec):**
- §5.1 `purpose` → Task 1 ✅
- §5.2 `whatsapp_account_access_rules` (kind seller/role/store, unique) → Task 2 ✅
- §5.3 `conversation_participants` (PK conv+seller, FK seller NO ACTION) → Task 3 ✅
- §5.4 helpers (`current_seller_accessible_account_ids`, `is_conversation_participant`, `can_access_conversation`, guard `whatsapp_account_id is not null`) → Task 4 ✅
- §6 #0 vazamento de `messages` + auditoria prod → Task 0 + Task 5 ✅
- Adiados corretamente: `department` (pós-211), tipos TS (Plano 2), índices únicos de instância + webhook/send (Plano 3), UI (Plano 4). ✅

**2. Placeholder scan:** sem TBD/“handle errors”/código omitido — todo SQL e todo assert estão completos. ✅

**3. Type/identifier consistency:** helpers chamados na Task 5 (`can_access_conversation`) e nas policies de participants (Task 3 não os usa, por desenho) batem com as assinaturas criadas na Task 4. Colunas (`assigned_seller_id`, `whatsapp_account_id`, `store_id`, `conversation_id`) conferem com `IConversation`/`IMessage` e com a policy de pool existente. Helpers de identidade (`current_store_id`, `current_seller_id`, `current_app_role`, `is_staff`) existem em `20260608230658_*`. ✅

**Gap conhecido e aceito:** os asserts de existência (Tasks 1–4) são fracos por natureza; o teste **forte** é o anti-leak da Task 5, que é o objetivo de segurança do plano.

---

## Próximos planos (visão geral)
- **Plano 2 — Contrato & providers:** tipos TS (`purpose`, `IWhatsAppAccountAccessRule`, `IConversationParticipant`), `create` no `IWhatsAppAccountsProvider` (mock + supabase + mapper), `formatPhone` aditivo. Testável com Vitest.
- **Plano 3 — Roteamento server-side:** índices únicos parciais em `provider_config->>instanceName`/`phoneNumberId`, webhook exatamente-1-match, arm de participante + pool-por-instância no `send/core.ts`. Engines testáveis.
- **Plano 4 — UI:** Hub, Adicionar número (wizard + `POST /instance/create`), Configurar acesso (Sheet + preview do OU), Nova conversa (provider-aware), OriginChip.
