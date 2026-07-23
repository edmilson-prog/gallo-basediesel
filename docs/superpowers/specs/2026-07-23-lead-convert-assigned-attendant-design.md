# Converter em cliente para o atendente atribuído — Design

- **Data:** 2026-07-23
- **Feature:** `src/features/leads/` (ficha lateral no Atendimento)
- **Origem:** o botão "Converter em cliente" na ficha lateral do lead (Atendimento) não
  aparece para os demais vendedores/atendentes — só para staff (Owner/Gestor) e para o
  próprio dono do lead.

## Problema

Na ficha lateral do lead (`LeadProfileFiche`), o botão **"Converter em cliente"** é gated por:

```ts
const canConvert = canEditLeadStore || (canEditLeadOwn && isLeadOwner);
```

- `canEditLeadStore` = `lead:edit:store` → **true só para staff** (Owner/Gestor).
- `canEditLeadOwn` = `lead:edit` (own) → true para Vendedor/VendedorExterno; **false para SDR**.
- `isLeadOwner` = `lead.sellerId === mySellerId`.

Ou seja, um Vendedor/VendedorExterno que **atende a conversa mas não é o dono do lead**
não vê o botão. Isso é **intencional** hoje: a conversão escreve em `customers` (INSERT) e
`leads` (UPDATE), e a RLS dessas tabelas exige `is_staff() OR seller_id = current_seller_id()`.
Um não-dono que tentasse converter tomaria `42501`. O CTA foi escondido para nunca oferecer
uma ação que falharia.

### RLS atual (produção)

- `customers` INSERT `with_check`: `store_id = current_store_id() AND (is_staff() OR seller_id = current_seller_id())`
- `leads` UPDATE `qual`/`with_check`: `store_id = current_store_id() AND (is_staff() OR seller_id = current_seller_id())`
- `leads` SELECT: `... OR seller_handles_lead(id)` — o atendente atribuído **lê** o lead, mas **não escreve**.
- `seller_handles_lead(p_lead_id uuid)` (SECURITY DEFINER) = existe conversa com
  `lead_id = p_lead_id::text AND assigned_seller_id = current_seller_id()`. É, literalmente,
  o predicado "sou o atendente atribuído de uma conversa desse lead".

## Decisões (produto)

1. **Quem pode converter:** o **atendente atribuído** da conversa (`conversation.assigned_seller_id`),
   além de staff e do dono do lead que já podiam.
2. **A quem o cliente pertence:** **quem converteu assume**, de forma **uniforme** —
   `customer.seller_id = current_seller_id()` para todos (inclusive staff), com fallback
   para `lead.sellerId` se o convertedor não tiver `sellerId`. `convertedBySellerId` continua
   registrando quem efetivamente converteu.

Consequência importante: como o cliente passa a pertencer a **quem converteu**
(`seller_id = current_seller_id()`), o **INSERT em `customers` já passa na RLS atual**. O único
ponto que ainda esbarra na RLS é o **UPDATE do lead** (que pertence a outro vendedor).

## Abordagem escolhida

RPC `SECURITY DEFINER` **focada apenas no UPDATE do lead** — reusa o
`customersProvider.create` existente (o INSERT passa na RLS via `seller_id = current`), sem
duplicar o mapeamento de campos do customer no SQL. Alternativa descartada: uma RPC monolítica
que faz INSERT + UPDATE atômico — mais robusta quanto à atomicidade, mas exigiria transportar
todos os campos do customer para o SQL (verboso, duplicação de lógica). A não-atomicidade
INSERT→UPDATE do modo "novo" **já existe hoje** e não regride.

Descartado também alargar a policy de UPDATE de `leads` com `seller_handles_lead`: afetaria
**todas** as escritas de lead (não só conversão), amplia a superfície e repete o problema de
performance per-row já revertido no projeto (`20260619170000`). A RPC gated é o padrão do projeto
para "escrita não-staff escopada".

## Componentes

### 1. Migration — RPC `convert_lead_mark`

```sql
create or replace function public.convert_lead_mark(
  p_lead_id     uuid,
  p_customer_id uuid,
  p_stage       jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_store  uuid;
begin
  select seller_id, store_id into v_seller, v_store
  from leads where id = p_lead_id;
  if not found then
    raise exception 'lead % not found', p_lead_id using errcode = 'P0002';
  end if;

  -- Same-store guard (mirror of the RLS store predicate).
  if v_store is distinct from current_store_id() then
    raise exception 'cross-store conversion blocked' using errcode = '42501';
  end if;

  -- Authorization: staff, the lead owner, or the assigned attendant of a
  -- conversation anchored on this lead.
  if not (
    is_staff()
    or v_seller = current_seller_id()
    or seller_handles_lead(p_lead_id)
  ) then
    raise exception 'not authorized to convert lead %', p_lead_id using errcode = '42501';
  end if;

  -- Target customer must exist in the same store (guards the "link" mode and a
  -- newly-inserted customer alike).
  if not exists (
    select 1 from customers c where c.id = p_customer_id and c.store_id = v_store
  ) then
    raise exception 'customer % not found in store', p_customer_id using errcode = 'P0002';
  end if;

  update leads
     set stage = p_stage,
         converted_to_customer_id = p_customer_id,
         updated_at = now()
   where id = p_lead_id;
end;
$$;

revoke all on function public.convert_lead_mark(uuid, uuid, jsonb) from public, anon;
grant execute on function public.convert_lead_mark(uuid, uuid, jsonb) to authenticated;
```

- Versionada em `supabase/migrations/` (regra do projeto: todo `apply_migration` é espelhado no Git no mesmo PR).
- **Aplicada em prod só com o OK do dono** (via MCP; `version` = nome do arquivo).

### 2. Camada de dados — `ILeadsProvider.markConverted`

Novo método no contrato:

```ts
markConverted(leadId: ID, args: { stage: ILeadStage; customerId: ID }): Promise<void>;
```

- **mock** (`impl/mock/leads.ts`): atualiza o lead no store (`stage` + `convertedToCustomerId`),
  sem RLS — tudo permitido.
- **supabase** (`impl/supabase/leads.ts`): `rpc("convert_lead_mark", { p_lead_id, p_customer_id, p_stage })`.
- `leadsProvider.update` genérico permanece **intocado** (edição normal de lead).

### 3. `ConvertLeadModal`

- `baseCustomer.sellerId = currentUser?.sellerId ?? lead.sellerId` (quem converteu assume; fallback dono).
- Trocar as duas chamadas `leadsProvider.update(lead.id, { stage, convertedToCustomerId })`
  (modos "novo" e "vincular") por `leadsProvider.markConverted(lead.id, { stage, customerId })`.
- Fluxo do modo "novo": `customersProvider.create(...)` (INSERT via RLS) → `markConverted(...)` (RPC).
- Fluxo do modo "vincular": só `markConverted(...)` (nenhuma escrita no cliente).

### 4. `LeadProfileFiche` — gate

Extrair a decisão para um **helper puro testável** em `src/features/leads/utils/`:

```ts
export function canConvertLead(perms: {
  canEditLeadStore: boolean;
  canEditLeadOwn: boolean;
  isLeadOwner: boolean;
  isAssignee: boolean;
}): boolean {
  return perms.canEditLeadStore || (perms.canEditLeadOwn && (perms.isLeadOwner || perms.isAssignee));
}
```

`isAssignee` já é computado no componente (`conversation.assignedSellerId === mySellerId`).
Atualizar o comentário de gating (hoje "v1 nunca oferece um CTA que daria 42501") para refletir
a RPC gated e o novo caso do atendente atribuído.

## Escopo / não-escopo

- **SDR** continua **sem** o botão (não tem `lead:edit`), coerente com o papel — mesmo sendo atendente.
- Modo "vincular" segue **sem escrever no cliente** (só marca o lead), agora via RPC.
- Não-atomicidade INSERT→UPDATE do modo "novo": **pré-existente**, mantida.
- Sem alteração na RLS de `leads`/`customers` (apenas a nova RPC).

## Testes

- **Unit (Vitest):** `canConvertLead` — matriz de casos (staff / dono / atendente / nenhum;
  com e sem `lead:edit`).
- **Manual (dono):** com um Vendedor **não-dono mas atribuído** à conversa, converter (novo B2C/B2B
  e vincular) → cliente criado com `seller_id` do atendente, lead marcado como convertido, sem 42501.
  Verificar que um Vendedor **não-dono e não-atribuído** continua sem o botão.

## Rollout

1. PR (draft) com: migration versionada + provider + modal + fiche + teste.
2. Dono aprova → aplicar a migration em prod (MCP) → merge.
3. Smoke manual conforme acima.
