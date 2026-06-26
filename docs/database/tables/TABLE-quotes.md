---
objeto: quotes
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: commercial
rls_enabled: true
colunas: 30
edge_functions: []
prds_relacionados: [PRD-022, PRD-031, PRD-032, PRD-033, PRD-035, PRD-103]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `quotes`

> Orçamento comercial enviado a cliente ou lead. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** commercial · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/commercial.ts → IQuote + PRDs 022/031/032/033/035)`

Registro de um orçamento (proposta comercial) emitido por um vendedor a um cliente ou lead da loja.
É o nó central do fluxo **orçamento → pedido**: quando o cliente aceita, o orçamento muda para
status `convertido` e o sistema cria um `orders` apontando de volta via `quote_id`, registrando
também `converted_to_order_id` e `converted_at` nesta linha.

Pontos-chave de domínio:

- **Destinatário mutuamente exclusivo:** ou `customer_id` (cliente cadastrado) ou `lead_id` (prospect
  ainda não convertido). Ambos nulos ao mesmo tempo é estado inválido por convenção de negócio,
  porém o banco não impõe CHECK (nulo nulável nos dois campos). `🔍 (IQuote + provider supabase)`
- **Vínculo opcional a conversa:** `conversation_id` liga o orçamento ao atendimento WhatsApp ou SDR
  de onde ele surgiu, permitindo rastreabilidade comercial (PRD-022 – orçamento no SDR; PRD-031 –
  orçamento manual). `🔍 (IQuote.conversationId)`
- **Itens em tabela filha:** os itens de linha vivem em `quote_items` (FK `quote_id` ON DELETE
  CASCADE); esta tabela guarda apenas os totais agregados (`subtotal`, `discount`, `shipping`,
  `total`). O provider faz duas queries (pai + filhos) para montar `IQuote.items`.
  `🔍 (src/providers/data/impl/supabase/quotes.ts)`
- **Snapshot de preço:** cada item de linha (em `quote_items`) snapshot o SKU, nome e preço unitário
  no momento da adição — o orçamento permanece estável mesmo que o catálogo mude depois.
  `🔍 (IQuoteItem.partSku/partName/unitPrice)`
- **Fluxo de aprovação de desconto:** quando o desconto total supera o limiar configurado na
  plataforma, `requires_approval` é marcado `true` e o orçamento fica bloqueado para envio até que
  um Gestor/Owner preencha `approved_by`/`approved_at` (ou registre `rejected_reason`).
  `🔍 (IQuote.requiresApproval — PRD-031 RF-029)`
- **Kits aplicados:** `applied_kit_ids` registra os kits do catálogo (PRD-035) usados para compor
  o orçamento — usado como métrica de adoção ("% de orçamentos via Kit", Bloco 4 do PRD-035 delta).
  `🔍 (IQuote.appliedKitIds)`
- **Frete:** coluna `shipping` armazena o valor calculado de frete; em produção pode ser preenchida
  pela integração Melhor Envio planejada (PRD-033 / issue #96 — `feat/melhor-envio-cotacao`), que
  cotaria automaticamente por CEP. `🔍 (CLAUDE.md — Melhor Envio planejado; PRD-033)`
- **Numeração legível:** `number` é gerado no padrão `OR-2026-0123` (PRD-031 RF-002).
  `🔍 (IQuote.number)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `number` | text | não | — | — |
| 4 | `customer_id` | uuid | sim | — | FK → `customers.id` |
| 5 | `lead_id` | uuid | sim | — | FK → `leads.id` |
| 6 | `conversation_id` | uuid | sim | — | FK → `conversations.id` |
| 7 | `seller_id` | uuid | não | — | FK → `sellers.id` |
| 8 | `subtotal` | numeric | não | `0` | — |
| 9 | `discount` | numeric | não | `0` | — |
| 10 | `discount_reason` | text | sim | — | — |
| 11 | `shipping` | numeric | não | `0` | — |
| 12 | `total` | numeric | não | `0` | — |
| 13 | `payment_condition` | text | não | `''::text` | — |
| 14 | `payment_method` | text | sim | — | — |
| 15 | `payment_terms` | text | sim | — | — |
| 16 | `delivery_address` | jsonb | sim | — | — |
| 17 | `valid_until` | timestamptz | não | — | — |
| 18 | `status` | text | não | — | — |
| 19 | `origin` | text | não | — | — |
| 20 | `division` | text | não | `'parts'::text` | — |
| 21 | `requires_approval` | boolean | sim | — | — |
| 22 | `approved_by` | uuid | sim | — | FK → `sellers.id` |
| 23 | `approved_at` | timestamptz | sim | — | — |
| 24 | `rejected_reason` | text | sim | — | — |
| 25 | `converted_to_order_id` | text | sim | — | — |
| 26 | `converted_at` | timestamptz | sim | — | — |
| 27 | `notes` | text | sim | — | — |
| 28 | `applied_kit_ids` | text[] | sim | — | — |
| 29 | `created_at` | timestamptz | não | `now()` | — |
| 30 | `updated_at` | timestamptz | não | `now()` | — |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/commercial.ts → IQuote)`

| coluna | significado |
|--------|-------------|
| `number` | Identificador legível sequencial gerado no padrão `OR-2026-0123` (PRD-031 RF-002). Não é a PK — é o número exibido na UI e impresso em propostas. |
| `customer_id` / `lead_id` | Destinatário mutuamente exclusivo: cliente convertido **ou** lead. Ambos opcionais no banco, mas exatamente um deve estar preenchido por convenção de negócio. |
| `conversation_id` | Conversa WhatsApp ou SDR que originou o orçamento — rastreabilidade comercial (PRD-022/031). Nulo quando o orçamento foi criado fora de um atendimento. |
| `subtotal` | Soma dos totais dos itens de linha (em `quote_items`), antes de desconto global e frete. |
| `discount` | Desconto global em valor monetário (R$) aplicado sobre o subtotal. Desconto por item fica no `quote_items.discount`. |
| `discount_reason` | Justificativa obrigatória quando o desconto supera o limiar da plataforma (PRD-031 RF-018). |
| `shipping` | Valor de frete em R$. Pode ser preenchido manualmente ou pela cotação automática do Melhor Envio (PRD-033 — planejado). |
| `payment_condition` | Campo de texto livre legado (PRD-022). Mantido para retrocompatibilidade; PRD-031 prefere `payment_method` + `payment_terms`. |
| `payment_method` | Método de pagamento estruturado: `pix`, `boleto`, `cartao`, `prazo` ou `outro` (PRD-031 RF-016). |
| `payment_terms` | Condições de pagamento em texto livre ("à vista", "30/60/90"). PRD-031 RF-016. |
| `delivery_address` | Endereço de entrega em jsonb — snapshot no momento do orçamento, substitui o endereço padrão do cliente quando preenchido. |
| `valid_until` | Data/hora de validade da proposta. Após essa data o status pode transitar para `expirado`. |
| `status` | Ciclo de vida do orçamento: `rascunho` → `enviado` → `aceito` / `recusado` / `expirado` → `convertido`. |
| `origin` | Canal de criação: `sdr` (painel SDR), `vendedor` (manual), `cliente_portal` (portal B2B), `ecommerce` (loja B2C). |
| `division` | Divisão comercial: `parts` (padrão), `service` ou `industrial` (dormentes no MVP). |
| `requires_approval` | `true` quando o desconto aplicado exige aprovação de Gestor/Owner (PRD-031 RF-029). Bloqueia o envio da proposta até que `approved_by` seja preenchido. |
| `approved_by` | FK → `sellers.id` do Gestor/Owner que aprovou o desconto. `null` enquanto pendente. |
| `approved_at` | Timestamp da aprovação. `null` enquanto pendente. |
| `rejected_reason` | Motivo fornecido pelo aprovador ao recusar o desconto. Quando preenchido, o orçamento volta ao vendedor para revisão. |
| `converted_to_order_id` | ID do pedido gerado quando o status transita para `convertido`. Tipo `text` (não uuid FK). `🔍 (QuoteRow.converted_to_order_id: string | null)` |
| `converted_at` | Timestamp da conversão em pedido. |
| `applied_kit_ids` | Array de IDs dos kits (PRD-035) usados para compor o orçamento — métrica de adoção de kits. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `approved_by` → `sellers.id`
- `conversation_id` → `conversations.id`
- `customer_id` → `customers.id`
- `lead_id` → `leads.id`
- `seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `orders.quote_id` → `quotes.id`
- `quote_items.quote_id` → `quotes.id`

## RLS — Row Level Security `[regra: mecânico]`

### `quotes_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `quotes_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `quotes_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `quotes_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies + CLAUDE.md)`
- **Isolamento por loja:** todo acesso (SELECT/INSERT/UPDATE/DELETE) exige `store_id = current_store_id()` — um usuário jamais enxerga orçamentos de outra loja.
- **Escrita própria ou staff:** criar, ler, atualizar e excluir são permitidos ao próprio `seller_id` **ou** a qualquer staff (`is_staff()`). O vendedor opera seus próprios orçamentos sem precisar de papel elevado; o gestor acessa todos da loja.
- **Simetria total:** diferente de algumas tabelas (ex.: `sellers`), aqui as quatro policies (SELECT/INSERT/UPDATE/DELETE) usam exatamente a mesma guarda `store_id AND (is_staff() OR seller_id = current_seller_id())` — design intencional para que o vendedor tenha CRUD completo sobre seus orçamentos.
- ❓ Confirmar se o fluxo de aprovação de desconto (`requires_approval`) é enforçado apenas na UI (PRD-031) ou se alguma policy/trigger impede o UPDATE de `status` enquanto `requires_approval = true` e `approved_by IS NULL` — nenhum trigger existe na tabela hoje.

## Índices `[mecânico]`

- `idx_quotes_approved_by` — `CREATE INDEX idx_quotes_approved_by ON public.quotes USING btree (approved_by)`
- `quotes_conversation_id_idx` — `CREATE INDEX quotes_conversation_id_idx ON public.quotes USING btree (conversation_id)`
- `quotes_customer_id_idx` — `CREATE INDEX quotes_customer_id_idx ON public.quotes USING btree (customer_id)`
- `quotes_lead_id_idx` — `CREATE INDEX quotes_lead_id_idx ON public.quotes USING btree (lead_id)`
- `quotes_origin_idx` — `CREATE INDEX quotes_origin_idx ON public.quotes USING btree (origin)`
- `quotes_pkey` — `CREATE UNIQUE INDEX quotes_pkey ON public.quotes USING btree (id)`
- `quotes_seller_id_idx` — `CREATE INDEX quotes_seller_id_idx ON public.quotes USING btree (seller_id)`
- `quotes_status_idx` — `CREATE INDEX quotes_status_idx ON public.quotes USING btree (status)`
- `quotes_store_id_idx` — `CREATE INDEX quotes_store_id_idx ON public.quotes USING btree (store_id)`
- `quotes_updated_at_idx` — `CREATE INDEX quotes_updated_at_idx ON public.quotes USING btree (updated_at DESC)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- _nenhuma_ — o banco não impõe CHECK sobre `status`, `origin`, `payment_method` ou `division`.

**Narrativa** `🔍 inferido (commercial.ts + provider supabase + CLAUDE.md)`:
- O campo `number` (`OR-2026-NNNN`) é gerado pela camada de aplicação no momento do `create` — não
  há sequence ou trigger de banco garantindo unicidade formal (sem UNIQUE index em `number`).
- Itens de linha vivem em `quote_items` (FK `ON DELETE CASCADE`): deletar um orçamento cascateia
  a exclusão dos itens. O provider Supabase não faz delete manual dos filhos. `🔍 (provider supabase — comentário explicit)`
- O UPDATE de orçamento via provider **não altera os itens**: substituir o conjunto de itens exige
  delete + reinsert manual, operação orquestrada por camada superior quando PRD-031 landing
  completo no Supabase. `🔍 (provider: "Items are intentionally not mutated by update")`
- A transição de status para `convertido` cria um `orders` apontando para este orçamento via
  `quote_id`, e registra `converted_to_order_id` / `converted_at` de volta nesta linha — dualidade
  intencional para rastrear a conversão nos dois sentidos. `🔍 (IQuote.convertedToOrderId + IOrder.quoteId)`
- O fluxo de aprovação de desconto é **client-side** na UI (PRD-031 RF-029): `requires_approval`
  é calculado pelo front ao montar o orçamento; nenhum trigger de banco bloqueia o envio.
- `shipping` pode ser `0` (default) ou cotado via integração Melhor Envio futura (PRD-033);
  nenhuma lógica de frete vive no banco hoje.
- `applied_kit_ids` é somente métrica de adoção de kits — não gera restrições relacionais com
  a tabela `model_kits` (sem FK array). `🔍 (IQuote.appliedKitIds — PRD-035 delta)`

## Perguntas pendentes

- ❓ `converted_to_order_id` é `text` no banco (não uuid/FK) — é intencional para aceitar IDs de sistemas externos (DINTEC), ou é descuido de schema que deveria migrar para `uuid REFERENCES orders(id)`?
- ❓ O fluxo de aprovação de desconto (`requires_approval`) é enforçado server-side por algum mecanismo além da UI, ou depende inteiramente da camada de apresentação (PRD-031)?
- ❓ `number` não tem UNIQUE constraint — duplicatas são prevenidas apenas pela geração da aplicação? Confirmar se isso é intencional.
- ❓ `customer_id` e `lead_id` são ambos anuláveis sem CHECK — nada no banco impede um orçamento sem destinatário. Isso é tolerado como rascunho intermediário?

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
