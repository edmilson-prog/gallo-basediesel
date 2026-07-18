# Migração assistida do backlog pending_review — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is SQL-only against production (via `mcp__supabase__execute_sql`) — there is no application code, no test suite, and no commit steps; treat each task as gated by an explicit go/no-go from the dono, not by an automated test passing.

**Goal:** Converter os `customer` com tag `pending_review` (importados da plataforma antiga, clientes reais) em `ICustomer` confirmado, sem passar pelo funil de Leads, atribuindo um vendedor dono a cada um.

**Architecture:** Migração administrativa em SQL puro, rodada via `mcp__supabase__execute_sql` diretamente em produção. Não usa a RPC `convert_pending_contact` (depende de `current_seller_id()`/`is_staff()`, que exigem uma sessão JWT autenticada — inexistente numa execução administrativa). Em vez disso, replica o mesmo efeito líquido com `UPDATE` + `INSERT` manual em `audit_logs`, capturando o estado "antes" numa tabela temporária para evitar reler o dado já mutado no mesmo statement.

**Tech Stack:** PostgreSQL (Supabase), executado via MCP tool `mcp__supabase__execute_sql`. Nenhum código de aplicação (`src/`) é tocado neste plano.

## Global Constraints

- Escopo: só `customer` com `'pending_review' = any(tags)` no momento da execução. Os 4 registros `reviewed_not_customer` ficam de fora (decisão humana já tomada).
- Dono resolvido: conversa mais recente vinculada (`conversations.customer_id`, `order by last_message_at desc limit 1`) com `assigned_seller_id` preenchido → usa esse vendedor; senão → fallback `622d1d2c-0223-4133-91cd-0264c1fc29aa` (Edmilson Souza).
- `type` fica `'B2C'` para todos (confirmado: nenhum registro do backlog tem CNPJ). `full_name`, `cpf`, `phone` e demais campos ficam como estão.
- Toda escrita em produção (Task 2) só roda depois de confirmação explícita do dono sobre o resultado do dry-run (Task 1) — nunca autônomo.
- Fora de escopo: mudanças no webhook, em `contact-review`, no funil de Leads, e redistribuição fina de carteira para quem cair no fallback (isso é ação manual posterior, via transferência de carteira).

---

### Task 1: Baseline e dry-run (somente leitura)

**Files:** nenhum — só consultas via `mcp__supabase__execute_sql`.

**Interfaces:**
- Produces: a contagem total do backlog e a distribuição por dono resolvido, que a Task 2 deve bater ao final.

- [x] **Passo 1: Checar que não há registro com as duas tags ao mesmo tempo**

```sql
select count(*) as both_tags
from public.customers
where 'pending_review' = any(tags) and 'reviewed_not_customer' = any(tags);
```

Esperado: `both_tags = 0`. Se vier diferente de 0, PARE — a suposição de mutuamente exclusivas está errada e o filtro da migração precisa ser revisto antes de continuar.

- [x] **Passo 2: Contagem agregada por dono resolvido (o dry-run principal)**

```sql
with resolved as (
  select
    c.id as customer_id,
    coalesce(conv.assigned_seller_id, '622d1d2c-0223-4133-91cd-0264c1fc29aa'::uuid) as resolved_seller_id,
    (conv.assigned_seller_id is not null) as via_conversation
  from public.customers c
  left join lateral (
    select assigned_seller_id
    from public.conversations
    where customer_id = c.id
    order by last_message_at desc
    limit 1
  ) conv on true
  where 'pending_review' = any(c.tags)
)
select
  resolved.via_conversation,
  resolved.resolved_seller_id,
  s.full_name as resolved_seller_name,
  count(*) as customer_count
from resolved
join public.sellers s on s.id = resolved.resolved_seller_id
group by resolved.via_conversation, resolved.resolved_seller_id, s.full_name
order by resolved.via_conversation desc, customer_count desc;
```

Esperado: uma linha com `via_conversation = false`, `resolved_seller_name = 'Edmilson Souza'` concentrando a maioria (~4.600+), e um punhado de linhas com `via_conversation = true` espalhadas entre outros vendedores (~150-200 no total). Confira que a soma de `customer_count` bate com o total do backlog (Passo 3).

- [x] **Passo 3: Total do backlog (para bater com a soma do Passo 2 e com o `migrated_count` da Task 2)**

```sql
select count(*) as total_pending_review from public.customers where 'pending_review' = any(tags);
```

- [x] **Passo 4: Amostra de 20 registros (spot check manual)**

```sql
select
  c.id,
  c.full_name,
  c.phone,
  coalesce(conv.assigned_seller_id, '622d1d2c-0223-4133-91cd-0264c1fc29aa'::uuid) as resolved_seller_id
from public.customers c
left join lateral (
  select assigned_seller_id
  from public.conversations
  where customer_id = c.id
  order by last_message_at desc
  limit 1
) conv on true
where 'pending_review' = any(c.tags)
order by c.id
limit 20;
```

Apresente os resultados dos Passos 1-4 ao dono. **Pare aqui e espere a confirmação explícita dele antes de seguir para a Task 2.** Não rode nenhum `UPDATE`/`INSERT` sem esse OK.

---

### Task 2: Execução (escrita, transacional)

**Files:** nenhum — SQL via `mcp__supabase__execute_sql`.

**Interfaces:**
- Consumes: a mesma lógica de resolução de dono da Task 1 (idêntica, recalculada no momento da execução — os números podem ter mudado levemente desde o dry-run porque o webhook continua criando `pending_review` novos em produção).
- Produces: `migrated_count` (linhas convertidas) e `remaining_pending_review` (deve ser ~0, salvo novos registros criados durante a janela de execução).

- [x] **Passo 1: Confirmar que o dono deu o OK explícito sobre o dry-run da Task 1 antes de prosseguir.**

- [x] **Passo 2: Rodar a migração completa, em uma única chamada (transação única)**

```sql
begin;

create temporary table _pending_migration as
select
  c.id as customer_id,
  c.store_id,
  c.tags as before_tags,
  c.seller_id as before_seller_id,
  c.type as before_type,
  coalesce(conv.assigned_seller_id, '622d1d2c-0223-4133-91cd-0264c1fc29aa'::uuid) as resolved_seller_id
from public.customers c
left join lateral (
  select assigned_seller_id
  from public.conversations
  where customer_id = c.id
  order by last_message_at desc
  limit 1
) conv on true
where 'pending_review' = any(c.tags);

update public.customers c
set
  type = 'B2C',
  seller_id = m.resolved_seller_id,
  tags = array_remove(c.tags, 'pending_review')
from _pending_migration m
where c.id = m.customer_id;

insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
select
  gen_random_uuid(),
  m.store_id,
  '622d1d2c-0223-4133-91cd-0264c1fc29aa'::uuid,
  'convert_pending_contact',
  'customer',
  m.customer_id::text,
  jsonb_build_object('tags', m.before_tags, 'seller_id', m.before_seller_id, 'type', m.before_type),
  jsonb_build_object('seller_id', m.resolved_seller_id, 'type', 'B2C', 'tags', array_remove(m.before_tags, 'pending_review'))
from _pending_migration m;

select count(*) as migrated_count from _pending_migration;
select count(*) as remaining_pending_review from public.customers where 'pending_review' = any(tags);

commit;
```

Esperado: `migrated_count` próximo do `total_pending_review` do dry-run (Task 1, Passo 3) — pode ser um pouco maior se novos `pending_review` chegaram entre o dry-run e a execução, o que é esperado e inofensivo (a query recalcula tudo na hora). `remaining_pending_review` deve ser 0, ou um número pequeno se mensagens novas chegaram durante a própria transação (também esperado, não é falha).

- [x] **Passo 3: Spot check pós-execução — conferir 5 registros da amostra da Task 1 (Passo 4) e seus audit_logs**

```sql
select id, full_name, type, seller_id, tags from public.customers where id = ANY(ARRAY[/* colar aqui 5 ids da amostra da Task 1 */]::uuid[]);

select action, resource_id, before, after, created_at
from public.audit_logs
where action = 'convert_pending_contact'
order by created_at desc
limit 5;
```

Esperado: os 5 `customer` da amostra aparecem com `type = 'B2C'`, `seller_id` preenchido, e sem `'pending_review'` em `tags`. As 5 linhas mais recentes de `audit_logs` mostram `before`/`after` consistentes com a mudança.

---

### Task 3: Verificação final e relatório

**Files:** nenhum.

**Interfaces:**
- Consumes: `migrated_count`/`remaining_pending_review` da Task 2.
- Produces: relatório final para o dono, e o sinal de que a Frente 2 (reestruturação do webhook/Leads) pode começar.

- [x] **Passo 1: Confirmar distribuição final por vendedor (quantos clientes cada um tem agora, para embasar a redistribuição manual de carteira)**

```sql
select s.full_name, count(*) as customer_count
from public.customers c
join public.sellers s on s.id = c.seller_id
group by s.full_name
order by customer_count desc;
```

- [x] **Passo 2: Confirmar zero pendências residuais antigas**

```sql
select count(*) as remaining from public.customers where 'pending_review' = any(tags);
```

Esperado: 0, ou só registros criados por conversas novas depois da migração (esperado e fora de escopo — seguem entrando pela tela `contact-review`, que continua ativa até a Frente 2).

- [x] **Passo 3: Reportar ao dono**

Resumo a entregar: total migrado, distribuição por vendedor (Passo 1), confirmação de zero pendência residual anômala (Passo 2), e lembrete de que a redistribuição fina de carteira para quem caiu no fallback (Edmilson Souza) é uma ação manual futura, fora deste plano. Registrar que a Frente 2 (webhook cria Lead em vez de customer placeholder; aposentar `contact-review`) pode começar agora.
