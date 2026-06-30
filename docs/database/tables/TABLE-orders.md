---
objeto: orders
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: commercial
rls_enabled: true
colunas: 37
edge_functions: []
prds_relacionados: [PRD-015, PRD-031, PRD-032, PRD-033, PRD-047]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `orders`

> Pedido de venda confirmado — transação comercial definitiva. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** commercial · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/commercial.ts → IOrder + src/providers/data/impl/supabase/orders.ts + CLAUDE.md)`

Registra uma transação comercial confirmada entre a loja e um cliente. Diferencia-se do orçamento
(`quotes`) por representar um compromisso firme de compra: ao criar um pedido, o sistema calcula e
armazena uma prévia de comissão (`commission_preview`) e, quando o pagamento é confirmado, o PRD-047
emite o registro definitivo em `commissions`.

Pontos-chave de domínio:

- **Origem rastreada:** `quote_id` (convertido a partir de um orçamento) e/ou `conversation_id`
  (SDR ou inbox do WhatsApp) são os dois elos de rastreabilidade com o fluxo de vendas.
  `🔍 (IOrder.quoteId / .conversationId + CLAUDE.md)`
- **Status composto, nunca persistido:** o `OrderStatus` visível ao usuário
  (`aguardando_pagamento`, `pago_aguardando_envio`, `em_separacao`, `enviado`, `entregue`,
  `concluido`, `cancelado`, `devolvido`) é **derivado em runtime** pela função pura
  `computeOrderStatus` a partir de `payment_status`, `fulfillment_status` e `canceled_at`.
  Nenhuma coluna "status" persiste esse valor. `🔍 (orderStatus.ts → computeOrderStatus)`
- **Linhas em tabela filha:** os itens vivem em `order_items` (FK `order_id` ON DELETE CASCADE),
  hidratados via PostgREST nested select em cada leitura. `🔍 (orders.ts → COLUMNS)`
- **Comissão:** `commission_preview` (jsonb) armazena a estimativa calculada no momento da criação;
  a comissão definitiva é emitida para `commissions.order_id` quando o pagamento é confirmado.
  `🔍 (ICommissionPreview + ICommission.orderId)`
- **NF-e:** campos `nf_number`/`nf_date` existem na tabela, mas a emissão fiscal segue no DINTEC
  (PRDs 127–129 deferidos); o único código ativo é um placeholder `generateInvoicePlaceholder`
  que grava um número gerado localmente. `🔍 (CLAUDE.md — NF-e deferida + orderTransitions.ts)`
- **Cancelamento auditado:** `canceled_at`/`canceled_by`/`cancel_reason` são escritos
  atomicamente pela função `cancelOrder`; a `cancel_reason` é obrigatória na camada de aplicação
  (não há CHECK no banco). `🔍 (orderTransitions.ts → cancelOrder)`
- **Divisão multi-marca:** `division` default `'parts'`; `service`/`industrial` dormentes mas
  modelados para o crescimento da plataforma. `🔍 (CLAUDE.md — campo division)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `customer_id` | uuid | não | — | FK → `customers.id` |
| 4 | `seller_id` | uuid | não | — | FK → `sellers.id` |
| 5 | `number` | text | sim | — | — |
| 6 | `quote_id` | uuid | sim | — | FK → `quotes.id` |
| 7 | `conversation_id` | uuid | sim | — | FK → `conversations.id` |
| 8 | `subtotal` | numeric | não | — | — |
| 9 | `discount` | numeric | não | — | — |
| 10 | `shipping` | numeric | não | — | — |
| 11 | `total` | numeric | não | — | — |
| 12 | `payment_condition` | text | não | — | — |
| 13 | `payment_method` | text | sim | — | — |
| 14 | `payment_terms` | text | sim | — | — |
| 15 | `payment_status` | text | não | — | — |
| 16 | `paid_at` | timestamptz | sim | — | — |
| 17 | `fulfillment_status` | text | não | — | — |
| 18 | `delivery_address` | jsonb | sim | — | — |
| 19 | `carrier` | text | sim | — | — |
| 20 | `tracking_code` | text | sim | — | — |
| 21 | `shipped_at` | timestamptz | sim | — | — |
| 22 | `delivered_at` | timestamptz | sim | — | — |
| 23 | `returned_at` | timestamptz | sim | — | — |
| 24 | `return_reason` | text | sim | — | — |
| 25 | `origin` | text | não | — | — |
| 26 | `division` | text | não | `'parts'::text` | — |
| 27 | `nf_number` | text | sim | — | — |
| 28 | `nf_date` | timestamptz | sim | — | — |
| 29 | `canceled_at` | timestamptz | sim | — | — |
| 30 | `canceled_by` | uuid | sim | — | FK → `sellers.id` |
| 31 | `cancel_reason` | text | sim | — | — |
| 32 | `internal_notes` | text | sim | — | — |
| 33 | `customer_notes` | text | sim | — | — |
| 34 | `commission_preview` | jsonb | sim | — | — |
| 35 | `notes` | text | sim | — | — |
| 36 | `created_at` | timestamptz | não | `now()` | — |
| 37 | `updated_at` | timestamptz | não | `now()` | — |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/commercial.ts → IOrder + IOrderItem + orderTransitions.ts)`

| coluna | significado |
|--------|-------------|
| `number` | Identificador legível sequencial exibido ao usuário (ex.: `PD-2026-0042`). Nulo enquanto não gerado pelo sistema (PRD-032 RF-003). |
| `quote_id` | Orçamento de origem, quando o pedido foi criado por conversão (`status='convertido'`). Nulo para pedidos criados diretamente. |
| `conversation_id` | Conversa WhatsApp/SDR que originou o pedido (rastreabilidade comercial). Nulo para pedidos criados fora do inbox. |
| `subtotal` | Soma bruta dos itens (quantidade × preço unitário), antes de desconto e frete. |
| `discount` | Desconto total a nível de pedido (em R$). Soma-se aos descontos de linha de `order_items`. |
| `shipping` | Valor do frete cobrado; pode ser zero (retirada em balcão, frete grátis, etc.). |
| `total` | Valor final = `subtotal − discount + shipping`. Gravado como snapshot no momento da criação. |
| `payment_condition` | Campo livre herdado da compatibilidade com PRD-022 (ex.: "30/60/90 dias"). Quando disponível, preferir `payment_method` + `payment_terms`. |
| `payment_method` | Método estruturado: `pix`, `boleto`, `cartao`, `prazo` ou `outro` (PRD-032). |
| `payment_terms` | Condição livre ("à vista", "30/60/90") — combinada com `payment_method` para legibilidade. |
| `payment_status` | Ciclo de pagamento: `pendente` → `parcial` → `pago` → `estornado`; `vencido` quando prazo venceu sem pagamento. Nenhum valor é derivado — é escrito diretamente pelas transições. |
| `paid_at` | Carimbo de tempo do pagamento confirmado; dispara a emissão da comissão definitiva (PRD-047). |
| `fulfillment_status` | Ciclo de entrega: `pendente` → `separacao` → `expedido` → `entregue` / `cancelado` / `devolvido`. |
| `delivery_address` | Snapshot jsonb do endereço de entrega no momento da criação (estrutura `ICustomerAddress`); editável até o pedido ser expedido. |
| `carrier` | Nome da transportadora (texto livre no MVP; sem integração de API). |
| `tracking_code` | Código de rastreio fornecido pela transportadora (texto; sem consulta ativa). |
| `shipped_at` / `delivered_at` / `returned_at` | Carimbos de tempo de cada marco do ciclo de entrega; preenchidos pelas funções de transição (`shipOrder`, `deliverOrder`, `returnOrder`). |
| `return_reason` | Motivo da devolução; obrigatório na camada de aplicação quando `fulfillment_status='devolvido'`. |
| `origin` | Canal de entrada do pedido: `whatsapp`, `ecommerce`, `portal`, `pwa_externo` ou `manual`. |
| `division` | Divisão comercial: `parts` (padrão), `service` ou `industrial`. Default `parts`; as outras dormentes no MVP. |
| `nf_number` / `nf_date` | Número e data da Nota Fiscal emitida. Preenchidos pelo placeholder `generateInvoicePlaceholder` no MVP (emissão real via DINTEC; NF-e própria deferida). |
| `canceled_at` / `canceled_by` / `cancel_reason` | Trio de cancelamento: `canceled_at` é o marcador primário (verificado por `canCancelOrder` e `computeOrderStatus`); `canceled_by` registra o seller que executou o ato (FK → `sellers.id`); `cancel_reason` é obrigatória na aplicação mas sem CHECK no banco. Cancelamento só é permitido nos status `pendente` ou `separacao`. |
| `internal_notes` | Notas internas visíveis apenas ao staff (não impressas em documentos ao cliente). |
| `customer_notes` | Notas voltadas ao cliente (impressas em recibos, corpo de e-mail). |
| `commission_preview` | Jsonb com `ICommissionPreview`: `{baseValue, commissionRate, estimatedCommission, rules, finalCalculationInPRD047}`. Snapshot calculado na criação; a comissão definitiva vive em `commissions`. |
| `notes` | Campo legado de notas genéricas; mantido para retro-compatibilidade. Preferir `internal_notes` ou `customer_notes`. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `canceled_by` → `sellers.id`
- `conversation_id` → `conversations.id`
- `customer_id` → `customers.id`
- `quote_id` → `quotes.id`
- `seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `commissions.order_id` → `orders.id`
- `media_assets.linked_order_id` → `orders.id`
- `order_items.order_id` → `orders.id`

## RLS — Row Level Security `[regra: mecânico]`

### `orders_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `orders_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `orders_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `orders_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies + CLAUDE.md + migration rls_per_seller_carteira_scope)`
- **Isolamento por loja:** todo acesso exige `store_id = current_store_id()` — um usuário autenticado
  só enxerga pedidos da loja selecionada no momento.
- **Escopo por seller:** vendedor comum acessa apenas os próprios pedidos (`seller_id = current_seller_id()`);
  staff (`is_staff()`) enxerga todos os pedidos da loja.
- **Simetria USING/WITH CHECK nas escritas:** insert, update e delete exigem a mesma predicada no
  `USING` e no `WITH CHECK`, o que impede um seller de criar ou mover um pedido para outro seller
  (ambos os lados do UPDATE são checados).
- **`order_items` herda o escopo indiretamente:** a policy de `order_items` (gerada dinamicamente em
  `rls_policies_derived_global.sql`) delega ao `orders` pai — um item é visível se e somente se
  o pedido pai for visível.

## Índices `[mecânico]`

- `idx_orders_canceled_by` — `CREATE INDEX idx_orders_canceled_by ON public.orders USING btree (canceled_by)`
- `orders_conversation_id_idx` — `CREATE INDEX orders_conversation_id_idx ON public.orders USING btree (conversation_id)`
- `orders_created_at_idx` — `CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC)`
- `orders_customer_id_idx` — `CREATE INDEX orders_customer_id_idx ON public.orders USING btree (customer_id)`
- `orders_fulfillment_status_idx` — `CREATE INDEX orders_fulfillment_status_idx ON public.orders USING btree (fulfillment_status)`
- `orders_payment_status_idx` — `CREATE INDEX orders_payment_status_idx ON public.orders USING btree (payment_status)`
- `orders_pkey` — `CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)`
- `orders_quote_id_idx` — `CREATE INDEX orders_quote_id_idx ON public.orders USING btree (quote_id)`
- `orders_seller_id_idx` — `CREATE INDEX orders_seller_id_idx ON public.orders USING btree (seller_id)`
- `orders_store_id_idx` — `CREATE INDEX orders_store_id_idx ON public.orders USING btree (store_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- _nenhum_ — os valores de enum de `payment_status`, `fulfillment_status` e `origin` não têm CHECK
  constraint no banco; a validação vive nos tipos TypeScript (`OrderPaymentStatus`,
  `OrderFulfillmentStatus`, `OrderOrigin`) e na camada de aplicação.

**Narrativa** `🔍 inferido (commercial.ts + orderTransitions.ts + orderStatus.ts + CLAUDE.md)`:

- `OrderStatus` (o status "composto" visível ao usuário) **não é persistido** — é derivado em
  runtime por `computeOrderStatus(order)` com base em `payment_status`, `fulfillment_status` e
  `canceled_at`. A derivação segue precedência: cancelado > devolvido/estornado > entregue+pago
  (concluído) > entregue > expedido > separação > pago/parcial > pendente.
- Cancelamento é restrito aos status de fulfillment `pendente` e `separacao`. Pedidos já
  `expedido` ou `entregue` só podem receber devolução (`returnOrder`), não cancelamento.
- `cancel_reason` é obrigatória na camada de aplicação (`cancelOrder` lança erro se vazia);
  a mesma regra se aplica a `return_reason` em `returnOrder`.
- Edição de campos (itens, endereço, pagamento) é bloqueada pelo helper `isOrderEditable` quando
  o pedido está cancelado, devolvido, entregue ou já pago (exceto se ainda pendente de entrega).
- A comissão do vendedor segue o fluxo: `commission_preview` (snapshot na criação) →
  `commissions` (emissão definitiva quando `paid_at` é preenchido) → ciclo PRD-047
  (cálculo com regra configurável, split se carteira transferida, fechamento mensal).
- `order_items` usa ON DELETE CASCADE — excluir um pedido remove todos os seus itens
  automaticamente; a atualização dos itens na camada supabase é "delete + reinsert" (sem
  upsert granular).
- A tabela `storefront_top_selling` (RPC de BI) lê `order_items` via função SECURITY DEFINER
  para expor ranking de peças mais vendidas ao storefront anônimo sem expor a tabela de pedidos.
- Nenhuma Edge Function é associada diretamente a `orders` no MVP; as transições são executadas
  client-side pelo provider `orders` via PostgREST.

## Perguntas pendentes

- ❓ Os campos de enum (`payment_status`, `fulfillment_status`, `origin`, `division`) não têm
  CHECK constraint no banco. É intencional (validação só na aplicação) ou falta adicionar
  constraints de guarda para integridade direta via SQL?
- ❓ `number` (ex.: `PD-2026-0042`) é nulo na migration; como e quando é gerado — aplicação ou
  trigger/sequência DB? Confirmar se há risco de colisão em alta concorrência.
- ❓ `commission_preview` é calculado na criação pelo cliente; existe ou está planejada uma RPC/
  trigger server-side para recalcular em caso de alteração de itens pós-criação?
- ❓ Confirmar se a ausência de `updated_at` trigger (tabela sem trigger) implica que o campo só
  é atualizado quando o provider chama explicitamente `.update({ updated_at: now() })` — e se há
  risco de desatualização em updates parciais.

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
