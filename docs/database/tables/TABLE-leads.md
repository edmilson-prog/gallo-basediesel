---
objeto: leads
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: leads
rls_enabled: true
colunas: 18
edge_functions: []
prds_relacionados: [PRD-010, PRD-013, PRD-014, PRD-017, PRD-019]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `leads`

> Lead do funil comercial — oportunidade de venda antes da conversão. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** leads · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/lead.ts → ILead; src/providers/data/impl/supabase/leads.ts; docs/prds/PRD-017-pipeline-leads_DONE.md)`

> A contact that has not closed a purchase yet. On conversion, `convertedToCustomerId` points to the resulting `ICustomer`.

Núcleo do funil comercial Kanban (PRD-017). Representa uma **oportunidade de venda em aberto** —
um contato qualificado que ainda não realizou uma compra. Pontos-chave de domínio:

- **Funil por estágios configuráveis:** `stage` é um objeto `ILeadStage` (id/name/order/color)
  **snapshotado na própria linha** como jsonb — assim o histórico do estágio no momento da ação
  fica preservado mesmo que o Owner mude a configuração de estágios (PRD-019). `🔍 (supabase/leads.ts: ILeadStage embutido + índice GIN em stage)`
- **Temperatura e origem:** `temperature` (`frio|morno|quente`) é indicador heurístico sugerido
  pelo SDR e ajustável pelo vendedor; `origin` (`whatsapp|ecommerce|indicacao|google|outro`)
  registra o canal de entrada. `🔍 (lead.ts: LeadTemperature / LeadOrigin)`
- **Conversão com memória preservada:** ao converter, `converted_to_customer_id` aponta para o
  `ICustomer` gerado; o espelho inverso é `customers.converted_from_lead_id` (tipo `text`). Isso
  aciona o badge "Histórico pré-conversão" na ficha do cliente (PRD-012). `🔍 (PRD-017 / TABLE-customers.md)`
- **Conversas vinculadas:** `conversations` é `text[]` — lista de IDs de conversa associada ao
  lead. Atenção: `conversations.lead_id` é do tipo `text` (não uuid) no banco, por isso a função
  `seller_handles_lead` faz cast explícito `p_lead_id::text`. `🔍 (migration 20260614183000 / TABLE-conversations.md)`
- **Carteira por vendedor:** `seller_id` define o vendedor responsável pela oportunidade (atribuído
  via distribuição PRD-013). Ao contrário de `customers`, não existe mecanismo de transferência de
  carteira de leads no MVP — a RLS de escrita (INSERT/UPDATE/DELETE) usa somente `seller_id =
  current_seller_id()` sem tabela de transferências. `🔍 (policies.json + ausência de carteira_transfers para leads)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `seller_id` | uuid | não | — | FK → `sellers.id` |
| 4 | `name` | text | não | — | — |
| 5 | `phone` | text | não | — | — |
| 6 | `email` | text | sim | — | — |
| 7 | `stage` | jsonb | não | — | — |
| 8 | `temperature` | text | não | — | — |
| 9 | `origin` | text | não | — | — |
| 10 | `estimated_value` | numeric | sim | — | — |
| 11 | `next_action_at` | timestamptz | sim | — | — |
| 12 | `loss_reason` | text | sim | — | — |
| 13 | `loss_notes` | text | sim | — | — |
| 14 | `converted_to_customer_id` | uuid | sim | — | FK → `customers.id` |
| 15 | `conversations` | text[] | não | `'{}'::text[]` | — |
| 16 | `tags` | text[] | não | `'{}'::text[]` | — |
| 17 | `created_at` | timestamptz | não | `now()` | — |
| 18 | `updated_at` | timestamptz | não | `now()` | — |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/lead.ts → ILead + ILeadStage; docs/prds/PRD-017)`

| coluna | significado |
|--------|-------------|
| `stage` | Objeto `ILeadStage` (id/name/order/color) **snapshotado** como jsonb — estado do estágio no momento da ação; desacoplado dos estágios correntes da loja (configuráveis por Owner via PRD-019). Indexado com GIN (`leads_stage_gin_idx`) para filtro por `stage->>id`. |
| `temperature` | Temperatura da oportunidade: `frio` / `morno` / `quente`. Indicador heurístico sugerido pelo SDR, ajustável manualmente pelo vendedor. |
| `origin` | Canal de origem do lead: `whatsapp` / `ecommerce` / `indicacao` / `google` / `outro`. |
| `estimated_value` | Valor estimado da venda em centavos (`Money`). Alimenta métricas de pipeline no painel do gestor (PRD-014). |
| `next_action_at` | Data/hora do próximo follow-up acordado. Usada para ordenação e alertas de oportunidade parada. |
| `loss_reason` | Taxonomia de motivo de perda (valores configuráveis via PRD-019). Preenchida quando o lead é dado como perdido. |
| `loss_notes` | Texto livre complementar ao `loss_reason` — observações internas da perda. |
| `converted_to_customer_id` | UUID do `ICustomer` criado na conversão. Quando preenchido, sinaliza que o lead foi convertido; alimenta o índice `leads_converted_to_customer_id_idx` e o badge "Histórico pré-conversão" na ficha (PRD-012). |
| `conversations` | `text[]` com IDs de conversas WhatsApp vinculadas ao lead. Atenção: `conversations.lead_id` é `text` no banco — a função RLS `seller_handles_lead` faz cast `uuid → text` para o JOIN. |
| `tags` | Etiquetas livres (`text[]`), default `{}`. Sem taxonomia forçada no banco. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `converted_to_customer_id` → `customers.id`
- `seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `distribution_traces.lead_id` → `leads.id`
- `quotes.lead_id` → `leads.id`
- `sdr_escalations.lead_id` → `leads.id`
- `trackable_links.lead_id` → `leads.id`

## RLS — Row Level Security `[regra: mecânico]`

### `leads_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `leads_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `leads_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id)) OR seller_handles_lead(id)))`

### `leads_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies + migration 20260614183000 + CLAUDE.md)`
- **Isolamento por loja:** todo acesso exige `store_id = current_store_id()` — mesma âncora das
  demais entidades comerciais.
- **Escrita restrita ao dono da carteira ou staff** (INSERT/UPDATE/DELETE): apenas o vendedor que
  "possui" o lead (`seller_id = current_seller_id()`) ou staff (`is_staff()`) pode criar/alterar/
  excluir. Não há tabela de transferências de leads no MVP — a carteira se move alterando
  `seller_id` diretamente (ato de gestão).
- **SELECT mais amplo via `seller_handles_lead`:** a policy de leitura acrescenta um terceiro braço:
  vendedor atribuído a **qualquer conversa vinculada** ao lead consegue **ler** o lead (sem ser dono
  da carteira). Implementado como função `SECURITY DEFINER` para o JOIN interno em `conversations`
  não sofrer com a própria RLS de conversas. O cast `p_lead_id::text` é necessário porque
  `conversations.lead_id` é `text`, não `uuid`. `🔍 (migration 20260614183000)`
- **Assimetria leitura/escrita intencional:** um vendedor pode ler o lead de um colega quando
  está atendendo a conversa, mas **não pode editar** — a escrita exige ser o dono da carteira ou
  staff. Padrão consistente com `customers` + `seller_handles_customer`.
- **Índice de suporte:** `idx_conversations_lead_assigned ON conversations(lead_id, assigned_seller_id)`
  criado na mesma migration para tornar o EXISTS do helper eficiente.

## Índices `[mecânico]`

- `leads_converted_to_customer_id_idx` — `CREATE INDEX leads_converted_to_customer_id_idx ON public.leads USING btree (converted_to_customer_id)`
- `leads_open_by_seller_idx` — `CREATE INDEX leads_open_by_seller_idx ON public.leads USING btree (seller_id, updated_at DESC) WHERE ((converted_to_customer_id IS NULL) AND (loss_reason IS NULL))`
- `leads_pkey` — `CREATE UNIQUE INDEX leads_pkey ON public.leads USING btree (id)`
- `leads_seller_id_idx` — `CREATE INDEX leads_seller_id_idx ON public.leads USING btree (seller_id)`
- `leads_stage_gin_idx` — `CREATE INDEX leads_stage_gin_idx ON public.leads USING gin (stage)`
- `leads_store_id_idx` — `CREATE INDEX leads_store_id_idx ON public.leads USING btree (store_id)`
- `leads_temperature_idx` — `CREATE INDEX leads_temperature_idx ON public.leads USING btree (temperature)`
- `leads_updated_at_idx` — `CREATE INDEX leads_updated_at_idx ON public.leads USING btree (updated_at DESC)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**Narrativa** `🔍 inferido (fonte: src/shared/types/lead.ts; src/providers/data/impl/supabase/leads.ts; docs/prds/PRD-017-pipeline-leads_DONE.md; migration 20260614183000)`:
- **Lead "aberto" vs. "fechado":** o índice parcial `leads_open_by_seller_idx` define "aberto"
  como `converted_to_customer_id IS NULL AND loss_reason IS NULL` — ou seja, um lead está ativo
  enquanto não convertido e não perdido. Não existe coluna `status` separada: o estado terminal
  se lê por esses dois campos.
- **Conversão:** setar `converted_to_customer_id` marca a conversão. O customer resultante deve
  reciprocamente guardar `converted_from_lead_id` (coluna `text` em `customers`) para fechar o
  laço bidirecional e exibir o badge de histórico pré-conversão (PRD-012).
- **Perda:** setar `loss_reason` marca a perda (com `loss_notes` opcionais). A taxonomia de
  motivos é configurável pelo Owner via PRD-019 — o banco não impõe enum.
- **Estágio snapshotado:** `stage` é jsonb (não FK para tabela de estágios) — cada lead carrega
  o snapshot do estágio no momento da última atualização. Isso garante que refatorações nos
  estágios configurados pelo Owner não reescrevam o histórico. O filtro de lista usa
  `stage->>id` (operador jsonb), suportado pelo índice GIN.
- **Temperatura:** sem CHECK constraint no banco — validação acontece na camada de aplicação
  (`LeadTemperature = "frio" | "morno" | "quente"` em `lead.ts`).
- **`id`/`storeId`/`createdAt` são imutáveis:** `leadPatchToRow` e `createInputToRow` nunca
  os incluem no UPDATE. `updatedAt` é atualizado explicitamente pelo provider a cada PATCH.
- **Deleção é hard delete:** não existe `deleted_at` — a RLS de DELETE permite exclusão real
  pelo dono da carteira ou staff; leads históricos referenciados por `distribution_traces`,
  `quotes`, `sdr_escalations` e `trackable_links` devem ser tratados antes da deleção
  (constraints entrantes não têm ON DELETE CASCADE nessas tabelas). ❓

## Perguntas pendentes

- ❓ As constraints de FK das tabelas `distribution_traces`, `quotes`, `sdr_escalations` e
  `trackable_links` (que referenciam `leads.id`) têm ON DELETE behavior definido? Confirmar
  se deleção de lead depende de limpeza prévia ou se há CASCADE/SET NULL.
- ❓ `conversations.lead_id` é `text` (não uuid FK formal). Há intenção de tipar como `uuid`
  com FK real futuramente? Isso quebraria `seller_handles_lead` e o cast atual.
- ❓ Não há CHECK constraint em `temperature` nem em `origin` no banco — é intencional (flexibilidade
  de configuração futura) ou omissão a corrigir?

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
