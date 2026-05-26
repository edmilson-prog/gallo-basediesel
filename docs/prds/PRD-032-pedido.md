# PRD-032: Pedido (Order)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                               |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                    |
| **Objetivo**          | Construir o sistema completo de pedidos — lista, criação via conversão de orçamento, ficha de detalhe rica, lifecycle de pagamento/entrega, integração com veículos (geração automática de histórico de manutenção) e comissão preview |
| **Tipo**              | Feature                                                                                                                                                                                                                                |
| **Complexidade**      | Alta                                                                                                                                                                                                                                   |
| **Total de Fases**    | 5                                                                                                                                                                                                                                      |
| **Prioridade**        | Alta                                                                                                                                                                                                                                   |
| **Épico**             | Bloco 3 — Comercial Operacional                                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-012 (Ficha — tab Pedidos), PRD-016 (Veículos — service history), PRD-022 (SDR), PRD-030 (Catálogo), PRD-031 (Orçamento — origem), PRD-047 (Comissões — Onda 2)                                                                     |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                     |
| **Padrão de código**  | Feature-based; código em `src/features/orders/`; reutiliza `DetailLayout` e snapshots de `IQuote`                                                                                                                                      |

### Critérios de Complexidade

> **Justificativa de Alta:** lifecycle de 8 estados com transições controladas e regras específicas; criação via 2 caminhos (conversão de orçamento PRD-031 ou aceite SDR PRD-022); ficha de detalhe com 7 seções (cliente, items, pagamento, entrega, status, comissão preview, histórico); integração com PRD-016 (gera `IVehicleServiceEntry` automaticamente se peças foram para veículo do cliente); comissão preview calculada (cálculo real e regras complexas ficam para PRD-047 Onda 2); métodos de pagamento placeholders preparados para integração Fase 2; NF placeholder com estrutura para integração com sistemas fiscais; audit log obrigatório em cada transição; cancelamentos com regras (antes/depois do pagamento, antes/depois do envio).

---

## Contexto do Problema

Pedido é o **fechamento do ciclo comercial** — onde orçamento vira venda real. Sem PRD-032:

**Orçamento aceito vira "limbo".** PRD-031 marca status `convertido` e referencia `convertedToOrderId`, mas sem PRD-032 esse ID aponta para nada. Stub atual cria placeholder coerente, mas não é real. **Sem visualização de pipeline pós-venda.** Owner não sabe "quanto está em fulfillment pendente?", "qual o ticket médio aceito este mês?". Métricas operacionais ficam incompletas. **Histórico de manutenção do veículo não evolui.** PRD-016 espera que pedidos com peças aplicadas em veículos do cliente alimentem `IVehicleServiceEntry`. Sem PRD-032 implementado, esse histórico fica estagnado. **Comissão fica em aberto.** Vendedor que vendeu não sabe quanto vai ganhar; sem preview, motivação cai.

Este PRD entrega: lista de pedidos navegável, conversão estruturada de orçamento, ficha rica em 7 seções, lifecycle de pagamento/entrega, geração automática de service history para veículos, comissão preview (cálculo definitivo no PRD-047).

---

## Conceito da Solução

### Modelo (revisão PRD-002)

```typescript
IOrder {
  id: ID;
  number: string;                  // "#PD-2026-0042"
  quoteId?: ID;                     // se veio de orçamento (PRD-031)
  conversationId?: ID;              // se veio de SDR (PRD-022)
  customerId: ID;
  sellerId: ID;
  // Items (snapshot do orçamento)
  items: IOrderItem[];
  // Valores
  subtotal: number;
  discount: number;
  shippingCost: number;
  total: number;
  // Pagamento
  paymentMethod: 'pix' | 'boleto' | 'cartao' | 'prazo' | 'outro';
  paymentTerms?: string;
  paymentStatus: 'pending_payment' | 'paid' | 'overdue' | 'refunded';
  paidAt?: ISO8601;
  // Entrega
  deliveryAddress: IAddress;
  fulfillmentStatus: 'pending' | 'fulfillment_pending' | 'shipped' | 'delivered' | 'returned';
  shippedAt?: ISO8601;
  deliveredAt?: ISO8601;
  trackingCode?: string;
  carrier?: string;                 // transportadora
  // Status agregado
  status: OrderStatus;              // calculado a partir de paymentStatus + fulfillmentStatus
  // Notas
  internalNotes?: string;
  customerNotes?: string;
  // Cancelamento
  canceledAt?: ISO8601;
  canceledBy?: ID;
  cancelReason?: string;
  // NF placeholder (Fase 2)
  invoiceNumber?: string;
  invoiceIssuedAt?: ISO8601;
  // Comissão preview
  commissionPreview?: ICommissionPreview;
  // Multi-loja
  storeId: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

IOrderItem {
  partId: ID;
  partName: string;
  partOemCode: string;
  quantity: number;
  unitPrice: number;
  itemDiscount: number;
  subtotal: number;
  // Aplicação ao veículo (opcional — para gerar service history)
  appliedToVehicleId?: ID;
}

ICommissionPreview {
  baseValue: number;
  commissionRate: number;          // %
  estimatedCommission: number;
  rules: string[];                  // descrição das regras aplicadas
  finalCalculationInPRD047: boolean;// indicador de que é preview
}

type OrderStatus =
  | 'aguardando_pagamento'      // paymentStatus=pending_payment
  | 'pago_aguardando_envio'     // paymentStatus=paid AND fulfillment=pending
  | 'em_separacao'              // fulfillment=fulfillment_pending
  | 'enviado'                   // fulfillment=shipped
  | 'entregue'                  // fulfillment=delivered
  | 'concluido'                 // delivered + paid (ciclo OK)
  | 'cancelado'                 // canceledAt preenchido
  | 'devolvido';                // returned
```

### Status agregado — derivado de paymentStatus + fulfillmentStatus

| paymentStatus   | fulfillmentStatus     | OrderStatus           |
| --------------- | --------------------- | --------------------- |
| pending_payment | pending               | aguardando_pagamento  |
| paid            | pending               | pago_aguardando_envio |
| paid            | fulfillment_pending   | em_separacao          |
| paid            | shipped               | enviado               |
| paid            | delivered             | entregue / concluido  |
| refunded        | returned              | devolvido             |
| qualquer        | qualquer + canceledAt | cancelado             |

### Listagem `/app/pedidos`

Tabela paginada (50/página) com colunas:

- Número (#PD-2026-0042)
- Cliente (link)
- Vendedor
- Total
- Status (badge colorido — usa OrderStatus agregado)
- paymentStatus (sub-badge)
- fulfillmentStatus (sub-badge)
- Data
- Origem (badge SDR / Manual / E-com)
- Ações (visualizar, editar, cancelar)

**Filtros:**

- Status agregado (multi-select)
- paymentStatus (multi-select)
- fulfillmentStatus (multi-select)
- Vendedor
- Cliente (autocomplete)
- Período
- Faixa de valor
- Origem
- Loja (Owner)

**Busca**: número, cliente, número da NF.

### Detalhe `/app/pedidos/:id`

7 seções:

1. **Header**: número grande, status badge prominente, total, origem badge, data, ações contextuais (editar, cancelar, gerar NF placeholder)
2. **Cliente**: card com link para ficha
3. **Items**: tabela com snapshots; coluna extra "Aplicado a veículo" se vendedor marcou (gera entry no histórico do veículo)
4. **Pagamento**: método, prazo, status com botões "Marcar como pago" / "Marcar como atrasado" / "Refund" (placeholder)
5. **Entrega**: endereço editável, status, transportadora (texto livre), código de rastreamento, botões de transição
6. **Comissão (Preview)**: cálculo placeholder com regras simples; banner "Cálculo definitivo no PRD-047 (Onda 2)"
7. **Histórico**: linha do tempo cronológica reversa (audit log filtrado)

### Conversão de orçamento (do PRD-031)

Botão "Converter em pedido" no PRD-031:

1. Modal `<ConvertToOrderModal>` (do PRD-031) coleta dados finais
2. Chama `createOrderFromQuote(quoteId, additionalData)` neste PRD
3. Cria `IOrder` com:
   - `quoteId` referenciado
   - Items copiados do orçamento (snapshots)
   - Endereço de entrega do orçamento (editável)
   - paymentStatus = `pending_payment`
   - fulfillmentStatus = `pending`
   - paymentMethod do orçamento (editável)
4. Atualiza orçamento: `status='convertido'`, `convertedToOrderId`
5. Calcula comissão preview
6. Audit log
7. Navega para detalhe

### Criação via SDR (do PRD-022)

Quando SDR aceita orçamento (PRD-022 aceite flow):

- Stub atual cria `IOrder` placeholder
- Este PRD substitui o stub — cria pedido real com `conversationId` referenciado
- Status inicial: `pending_payment` (cliente ainda precisa confirmar como pagar)
- Aparece no `/app/pedidos` com badge "🤖 SDR"

### Lifecycle do pagamento

| Estado          | Como muda                                                            |
| --------------- | -------------------------------------------------------------------- |
| pending_payment | Inicial                                                              |
| paid            | Botão "Marcar como pago" (Vendedor/Gestor); na Fase 2 vem do gateway |
| overdue         | Timer detecta se passou de prazo                                     |
| refunded        | Botão "Refund" placeholder no MVP                                    |

### Lifecycle de fulfillment

| Estado              | Como muda                                                        |
| ------------------- | ---------------------------------------------------------------- |
| pending             | Inicial (só muda após pagamento)                                 |
| fulfillment_pending | Botão "Iniciar separação" (após paid)                            |
| shipped             | Botão "Marcar como enviado" + entrada de transportadora e código |
| delivered           | Botão "Marcar como entregue"                                     |
| returned            | Botão "Devolver" (com motivo)                                    |

### Comissão preview

Cálculo simples no MVP:

- `commissionRate` default 3% (configurável em settings)
- Aplicado sobre `subtotal - discount` (sem frete)
- Apenas preview — banner "Cálculo definitivo no PRD-047 (Onda 2)"
- Vendedor vê quanto vai ganhar; útil para motivação

### Integração com Veículos (PRD-016)

Quando vendedor marca item com `appliedToVehicleId`:

- Cria automaticamente `IVehicleServiceEntry` (PRD-016) com:
  - `vehicleId`
  - `orderId` referenciado
  - `parts: [item.partName]` (snapshot)
  - `date: now`
  - `km: vehicle.currentKm` (snapshot)
- Aparece no histórico de manutenção do veículo (PRD-016)
- Audit log

Marcar é opcional — nem todo pedido aplica em veículo (peças vendidas para estoque do cliente, etc.).

### Cancelamento

Botão "Cancelar pedido" disponível com regras:

| Estado atual          | Pode cancelar?  | Comportamento                                              |
| --------------------- | --------------- | ---------------------------------------------------------- |
| aguardando_pagamento  | Sim             | Simples, sem refund                                        |
| pago_aguardando_envio | Sim             | Modal: "Pagamento já foi feito — refund manual necessário" |
| em_separacao          | Com confirmação | "Pedido em separação — confirma cancelar?"                 |
| enviado               | Não             | Bloqueado; orientar para devolução                         |
| entregue              | Não             | Bloqueado; apenas devolução                                |
| concluido             | Não             | Final                                                      |

Cancelamento exige `cancelReason` (textarea obrigatória).

### NF (placeholder)

Botão "Gerar NF" no detalhe:

- MVP: gera número fake (`invoiceNumber = 'NF-' + counter`), define `invoiceIssuedAt = now`
- Tooltip: "Integração com sistemas fiscais disponível na Fase 2"
- Audit log

Na Fase 2, integração com SEFAZ / sistemas fiscais via API.

### Permissões

| Papel       | Listar        | Criar | Editar                       | Cancelar                        | Marcar pago/entregue |
| ----------- | ------------- | ----- | ---------------------------- | ------------------------------- | -------------------- |
| Owner       | tudo          | ✅    | ✅                           | ✅                              | ✅                   |
| Gestor      | loja          | ✅    | ✅                           | ✅                              | ✅                   |
| Vendedor    | seus          | ✅    | ✅ (próprios, pré-pagamento) | ✅ (próprios + estado adequado) | ✅ (próprios)        |
| Financeiro  | tudo          | ❌    | ✅ pagamento                 | ❌                              | ✅ pagamento         |
| Cliente B2B | seus (portal) | ❌    | ❌                           | ❌                              | ❌                   |

### Alternativas Consideradas

| Alternativa                                                              | Por que foi descartada                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Sem status agregado (apenas paymentStatus + fulfillmentStatus separados) | Cliente quer ver "como está meu pedido?" — agregado é mais legível       |
| Sem geração automática de service history                                | Histórico de manutenção do veículo (PRD-016) vira manual e desatualizado |
| Sem comissão preview                                                     | Vendedor não sabe quanto vai ganhar; perda motivacional                  |
| NF como obrigatório no MVP                                               | Integração SEFAZ é complexa; placeholder OK                              |
| Cancelamento livre em qualquer estado                                    | Problemas comerciais; regras claras protegem operação                    |
| Edição livre após pago                                                   | Preço pago não pode mudar sem refund; lifecycle protege                  |
| Conversão automática sem modal                                           | Vendedor precisa revisar dados finais (endereço, parcelas)               |
| Métodos de pagamento via integração real no MVP                          | Complexidade alta; placeholders permitem fluxo completo                  |

**Decisão consolidada:** **lifecycle agregado de 8 estados, criação via 2 caminhos (PRD-031 e PRD-022), 7 seções no detalhe, comissão preview com banner "definitivo no PRD-047", integração automática com PRD-016 quando vendedor marca aplicação, cancelamento com regras, NF placeholder, métodos de pagamento placeholders.**

---

## Escopo

### Incluído

- ✅ Modelo `IOrder`, `IOrderItem`, `ICommissionPreview`, `OrderStatus` em `src/shared/types/orders.ts`
- ✅ Geração de número sequencial (#PD-{ano}-{seq})
- ✅ Geradores de mock: ~120 pedidos com mix de status (aguardando, pago, enviado, entregue, cancelado, devolvido)
- ✅ Página `/app/pedidos` substituindo placeholder do PRD-003
- ✅ Tabela paginada com filtros (status agregado, paymentStatus, fulfillmentStatus, vendedor, cliente, período, valor, origem, loja)
- ✅ Página de detalhe `/app/pedidos/:id` com 7 seções
- ✅ Função `createOrderFromQuote(quoteId, additionalData)` para conversão do PRD-031
- ✅ Substituição do stub do PRD-022 — pedidos SDR são criados de verdade
- ✅ Status agregado calculado dinamicamente via helper `computeOrderStatus(order)`
- ✅ Botões de transição contextual por estado:
  - "Marcar como pago"
  - "Iniciar separação"
  - "Marcar como enviado" (com modal pedindo transportadora + tracking)
  - "Marcar como entregue"
  - "Devolver" (com motivo)
  - "Cancelar pedido" (com regras e motivo)
  - "Gerar NF" (placeholder)
- ✅ Comissão preview calculada via helper simples + banner sobre PRD-047
- ✅ Integração com PRD-016: marcar item com `appliedToVehicleId` cria `IVehicleServiceEntry` automaticamente
- ✅ Permissões granulares por papel
- ✅ Audit log em todas as transições + cancelamentos + edições
- ✅ Histórico de mudanças no detalhe via audit log filtrado
- ✅ URL sync de filtros
- ✅ Empty states contextuais
- ✅ Integração com PRD-012 (tab Pedidos da ficha) — `<CustomerOrdersList>` reusado

### Excluído

- ❌ Integração real com gateways de pagamento — Fase 2
- ❌ Emissão real de NF (SEFAZ) — Fase 2
- ❌ Cálculo definitivo de comissão (regras complexas) — Bloco 4 (PRD-047)
- ❌ Cálculo real de frete (transportadora) — Fase 2 (PRD-033)
- ❌ Tracking real via transportadora — Fase 2 (apenas armazenamento de código)
- ❌ Parcelamento detalhado de boleto/cartão — Fase 2
- ❌ Devolução parcial (devolver apenas alguns items) — Fase 2
- ❌ Substituição de produto durante separação — Fase 2
- ❌ Histórico financeiro completo (entrada/saída) — Bloco 4 (PRD-048 DRE)
- ❌ Notas fiscais eletrônicas com XML/PDF — Fase 2
- ❌ Workflow de aprovação para refund — fora do MVP
- ❌ Análise de margem por pedido — Bloco 4 (PRD-049)

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Adicionar `IOrder`, `IOrderItem`, `ICommissionPreview`, `OrderStatus` em `src/shared/types/orders.ts`.
- **RF-002:** Adicionar `IAddress` se ainda não existe (PRD-002).
- **RF-003:** Helper `generateOrderNumber(storeId): string` — formato `#PD-{YYYY}-{seq}`.
- **RF-004:** Helper `computeOrderStatus(order): OrderStatus` retorna status agregado a partir de `paymentStatus` + `fulfillmentStatus` + `canceledAt`.
- **RF-005:** Mocks (PRD-004): ~120 pedidos:
  - 30% aguardando_pagamento
  - 25% concluído (todo fluxo OK)
  - 15% enviado
  - 10% em_separacao
  - 10% cancelado
  - 5% devolvido
  - 5% pago_aguardando_envio
- **RF-006:** 40% dos pedidos têm `quoteId` (vieram de orçamento); 25% têm `conversationId` (vieram de SDR); 35% criados manualmente.

### Listagem

- **RF-007:** Criar `OrdersListPage` em `src/features/orders/pages/`, rota `/app/pedidos`.
- **RF-008:** Tabela paginada (50/página) com 10 colunas configuráveis.
- **RF-009:** Filtros: status agregado (multi-select), paymentStatus, fulfillmentStatus, vendedor, cliente (autocomplete), período, faixa valor, origem, loja (Owner).
- **RF-010:** Busca em número, cliente, número de NF.
- **RF-011:** URL sync.
- **RF-012:** Indicador visual de status agregado com cores semânticas.

### Detalhe

- **RF-013:** Criar `OrderDetailPage` em `/app/pedidos/:id`.
- **RF-014:** 7 seções:

**Header:**

- Número, status badge (agregado), origem badge, total grande
- Ações contextuais por estado (lista abaixo em RF-022)

**Cliente:**

- Card com link para ficha PRD-012
- Endereço de entrega editável (botão "Editar")

**Items:**

- Tabela com items: nome + OEM + qtd + preço + subtotal
- Coluna extra "Aplicado a veículo": dropdown com veículos do cliente (vazio se cliente sem veículos)
- Vendedor pode marcar `appliedToVehicleId` por item

**Pagamento:**

- Método, prazo, status badge
- paidAt (se aplicável)
- Botão "Marcar como pago" (se pending)
- Botão "Marcar atrasado" (se pending e passou prazo)
- Botão "Refund" placeholder

**Entrega:**

- Endereço (editável até envio)
- Status badge
- Transportadora (texto livre) + Código de rastreamento (texto)
- Botões: "Iniciar separação" / "Marcar enviado" / "Marcar entregue" / "Devolver"
- Datas: shippedAt, deliveredAt (se aplicável)

**Comissão Preview:**

- Base, taxa, valor estimado
- Banner amarelo: "⚠ Preview — cálculo definitivo no PRD-047 (Onda 2)"

**Histórico:**

- Linha do tempo de mudanças via audit log filtrado
- Cada evento: timestamp, autor, ação, detalhes

### Transições de estado

- **RF-015:** Botões contextuais conforme estado atual:

| Estado                | Botões disponíveis                                                 |
| --------------------- | ------------------------------------------------------------------ |
| aguardando_pagamento  | Marcar como pago, Cancelar, Editar                                 |
| pago_aguardando_envio | Iniciar separação, Cancelar (com aviso de refund), Gerar NF        |
| em_separacao          | Marcar enviado (modal), Cancelar (com confirmação)                 |
| enviado               | Marcar entregue, (sem cancelar — bloqueado)                        |
| entregue              | Marcar como concluído, Devolver (com motivo)                       |
| concluido             | (apenas visualizar; sem ações exceto Devolver retroativo opcional) |
| cancelado             | (apenas visualizar)                                                |
| devolvido             | (apenas visualizar)                                                |

- **RF-016:** Modal "Marcar enviado":
  - Transportadora (texto)
  - Código de rastreamento (texto)
  - Data envio (date picker, default hoje)
- **RF-017:** Modal "Devolver":
  - Motivo (textarea obrigatória)
  - Data devolução
  - Pedir refund? (toggle — placeholder)
- **RF-018:** Modal "Cancelar":
  - Motivo (textarea obrigatória)
  - Aviso de refund se já pago

### Conversão de orçamento

- **RF-019:** Implementar `createOrderFromQuote(quoteId, additionalData): IOrder` em `src/features/orders/api/`:
  - Recebe `quoteId` e dados finais (endereço editado, parcelas, observações)
  - Lê quote, copia items (snapshots), endereço, método de pagamento
  - Cria `IOrder` com `paymentStatus='pending_payment'`, `fulfillmentStatus='pending'`
  - Atualiza quote: `status='convertido'`, `convertedToOrderId`
  - Calcula comissão preview
  - Audit log (entry no order + entry no quote)
- **RF-020:** Esta função substitui o stub do PRD-031 (`stubCreateOrder`) — agora cria pedidos reais.

### Criação via SDR

- **RF-021:** Quando PRD-022 aceita orçamento, em vez do stub atual, chamar `createOrderFromQuote(quote.id, captured)`:
  - `captured` inclui método de pagamento + endereço extraídos da conversa
- **RF-022:** Substitui stub do PRD-022.

### Integração com PRD-016 (Veículos)

- **RF-023:** Quando vendedor marca `appliedToVehicleId` em um item:
  - Criar `IVehicleServiceEntry` (PRD-016) automaticamente:
    - `vehicleId`
    - `orderId` referenciado
    - `parts: [item.partName]` (snapshot)
    - `date: now`
    - `km: vehicle.currentKm` (snapshot do momento)
  - Adicionar entry ao histórico do veículo
  - Audit log
- **RF-024:** Se vendedor remove o `appliedToVehicleId`, remover o `IVehicleServiceEntry` correspondente (ou marcá-lo como `removed` para preservar audit). Decisão do agente desenvolvedor.

### Comissão preview

- **RF-025:** Helper `computeCommissionPreview(order, settings): ICommissionPreview`:
  - `baseValue = subtotal - discount` (sem frete)
  - `commissionRate = IPlatformSettings.commissionRateDefault` (default 3%)
  - `estimatedCommission = baseValue * commissionRate`
  - `rules` array com regras aplicadas (no MVP: "Taxa padrão da loja: 3%")
  - `finalCalculationInPRD047 = true`
- **RF-026:** Visualizado na seção 6 do detalhe com banner amarelo.

### NF placeholder

- **RF-027:** Botão "Gerar NF" no detalhe:
  - Disponível quando `paymentStatus='paid'` e `fulfillmentStatus !== 'returned'`
  - Modal de confirmação
  - Ao confirmar: `invoiceNumber = 'NF-' + Date.now()`, `invoiceIssuedAt = now`
  - Tooltip: "Integração com SEFAZ disponível na Fase 2"
  - Audit log

### Cancelamento

- **RF-028:** Regras de cancelamento:
  - `aguardando_pagamento`: cancelamento simples, sem aviso de refund
  - `pago_aguardando_envio`: modal de confirmação com aviso "Pagamento já registrado — refund manual necessário (placeholder)"
  - `em_separacao`: confirmação reforçada
  - `enviado`, `entregue`, `concluido`: botão bloqueado com tooltip "Pedido já enviado — use 'Devolver'"
- **RF-029:** Ao cancelar:
  - `canceledAt = now`, `canceledBy = currentUser.id`, `cancelReason = motivo`
  - status agregado vira 'cancelado'
  - Audit log

### Permissões

- **RF-030:** Vendedor lista só seus pedidos (filtragem implícita).
- **RF-031:** Vendedor edita endereço apenas antes do envio.
- **RF-032:** Cancelar pedido pós-pagamento exige permissão `order.cancel` (Gestor/Owner).
- **RF-033:** Marcar como pago: Vendedor/Gestor/Owner/Financeiro.
- **RF-034:** Refund: apenas Gestor/Owner.
- **RF-035:** Gerar NF: Gestor/Owner.

### Integração com PRD-012

- **RF-036:** Componente `<CustomerOrdersList customerId>` em `src/features/orders/components/` reusado na tab Pedidos da ficha (PRD-012).

### Audit log

- **RF-037:** Audit em:
  - Criação (`action='order_create'`)
  - Mudança de paymentStatus (`action='order_payment_status_change'` com before/after)
  - Mudança de fulfillmentStatus
  - Aplicação a veículo (`action='order_vehicle_apply'`)
  - Geração de NF (`action='order_invoice_generate'`)
  - Cancelamento (`action='order_cancel'` com motivo)
  - Devolução (`action='order_return'` com motivo)
  - Edição de endereço (`action='order_address_update'`)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Listagem com 120 pedidos + filtros < 350ms.
- **RNF-002 (Snapshots):** Items, preços, endereços preservam snapshots do momento da criação.
- **RNF-003 (Status agregado):** `computeOrderStatus()` é função pura; chamada sempre que necessário.
- **RNF-004 (Tipagem):** Zero `any`; lifecycle tipado.
- **RNF-005 (Acessibilidade):** WCAG 2.1 AA.
- **RNF-006 (Atomicidade):** Transições de status + criação de entries em histórico (veículo, audit) — em uma transação.

---

## Critérios de Aceitação

### Listagem

```gherkin
DADO Vendedor com 8 pedidos
QUANDO acesso /app/pedidos
ENTÃO vejo apenas os meus 8 pedidos
  E filtros disponíveis (sem Loja)

DADO aplico filtro Status=enviado + paymentStatus=paid
QUANDO filtros aplicam
ENTÃO tabela mostra apenas pedidos que satisfazem ambos
  E URL atualiza

DADO clico em pedido convertido de orçamento
QUANDO observo linha
ENTÃO vejo badge origem "📋 Manual" ou "🤖 SDR"
```

### Conversão de orçamento

```gherkin
DADO orçamento aceito (PRD-031)
QUANDO clico "Converter em pedido" e confirmo modal
ENTÃO IOrder é criado com:
  - quoteId referenciado
  - items copiados como snapshots
  - paymentStatus='pending_payment'
  - fulfillmentStatus='pending'
  - status agregado='aguardando_pagamento'
  E quote.status='convertido', quote.convertedToOrderId atualizado
  E sou navegado para /app/pedidos/:novoId
  E audit log gerado em ambos (quote + order)
```

### Lifecycle de pagamento e entrega

```gherkin
DADO pedido em aguardando_pagamento
QUANDO clico "Marcar como pago"
ENTÃO paymentStatus='paid', paidAt=now
  E status agregado vira pago_aguardando_envio
  E botão "Iniciar separação" aparece

DADO pago_aguardando_envio
QUANDO clico "Iniciar separação"
ENTÃO fulfillmentStatus='fulfillment_pending'
  E status agregado vira em_separacao

DADO em_separacao
QUANDO clico "Marcar enviado" e preencho transportadora + tracking
ENTÃO fulfillmentStatus='shipped', shippedAt=now
  E status agregado vira enviado

DADO enviado
QUANDO clico "Marcar entregue"
ENTÃO fulfillmentStatus='delivered', deliveredAt=now
  E status agregado vira entregue
```

### Aplicação a veículo

```gherkin
DADO cliente Aurora tem 3 veículos cadastrados
  E pedido tem 1 item "Filtro óleo Volvo"
QUANDO marco appliedToVehicleId=Volvo-R450-XYZ
ENTÃO IVehicleServiceEntry é criada automaticamente
  E histórico do veículo (PRD-016) inclui essa entry
  E audit log gerado

DADO pedido sem cliente com veículos
QUANDO observo coluna "Aplicado a veículo"
ENTÃO dropdown está vazio
  E vejo placeholder "Cliente sem veículos cadastrados"
```

### Cancelamento

```gherkin
DADO pedido em aguardando_pagamento
QUANDO clico "Cancelar" e preencho motivo
ENTÃO canceledAt, canceledBy, cancelReason preenchidos
  E status agregado vira 'cancelado'
  E audit log

DADO pedido em pago_aguardando_envio
QUANDO clico "Cancelar"
ENTÃO modal alerta: "Pagamento registrado — refund manual necessário"
  E ao confirmar, pedido é cancelado

DADO pedido em enviado
QUANDO procuro botão "Cancelar"
ENTÃO botão desabilitado com tooltip "Use 'Devolver'"
```

### Comissão preview

```gherkin
DADO pedido com subtotal R$ 1000, discount R$ 50
QUANDO seção Comissão Preview renderiza
ENTÃO mostra:
  - Base: R$ 950
  - Taxa: 3%
  - Estimativa: R$ 28,50
  - Banner amarelo: "Preview — cálculo definitivo no PRD-047"
```

### NF placeholder

```gherkin
DADO pedido com paymentStatus='paid'
QUANDO clico "Gerar NF" e confirmo
ENTÃO invoiceNumber gerado e invoiceIssuedAt preenchido
  E tooltip "Integração com SEFAZ disponível na Fase 2"
  E audit log
```

### Integração SDR (substitui stub)

```gherkin
DADO SDR (PRD-022) aceita orçamento via cliente
QUANDO createOrderFromQuote é chamada
ENTÃO IOrder real é criado (não placeholder mais)
  E aparece em /app/pedidos com badge "🤖 SDR"
  E vendedor responsável recebe notificação
```

### Cenários de erro

```gherkin
DADO tento marcar como entregue um pedido ainda não enviado
QUANDO clico (botão desabilitado pela UI)
ENTÃO ação bloqueada visualmente
  E API validação: "Pedido precisa estar em status enviado primeiro"

DADO tento cancelar sem motivo
QUANDO submeto modal
ENTÃO validação: "Motivo é obrigatório"

DADO falha na conversão de orçamento
QUANDO erro acontece
ENTÃO orçamento permanece em status='aceito' (não convertido)
  E mensagem de erro clara + botão "Tentar novamente"
```

---

## Fases de Implementação

| Fase | Objetivo                                                            | Arquivos Estimados |
| ---- | ------------------------------------------------------------------- | ------------------ |
| 1    | Modelo, mocks, listagem com filtros                                 | 6-7                |
| 2    | Detalhe com 7 seções (read-only inicial)                            | 5-6                |
| 3    | Transições de estado (paymentStatus + fulfillmentStatus)            | 5-6                |
| 4    | Conversão de orçamento + integração com veículos + comissão preview | 4-5                |
| 5    | Cancelamento, NF placeholder, integração PRD-022, polish            | 4-5                |

### Detalhamento das Fases

#### Fase 1: Modelo e Listagem

- [ ] Tipos `IOrder`, `IOrderItem`, `ICommissionPreview`, `OrderStatus`
- [ ] Helpers `generateOrderNumber`, `computeOrderStatus`
- [ ] Geradores de mock (~120 pedidos)
- [ ] `OrdersListPage` com filtros + busca + URL sync

**Validação:** lista de 120 pedidos com filtros funcionais.

#### Fase 2: Detalhe

- [ ] `OrderDetailPage` com 7 seções (read-only inicial)
- [ ] Histórico via audit log filtrado
- [ ] Comissão preview (cálculo simples)

**Validação:** abrir detalhe mostra todas as informações.

#### Fase 3: Transições

- [ ] Botões contextuais por estado
- [ ] Modais: marcar enviado, devolver, cancelar
- [ ] Updates atômicos no provider
- [ ] Audit log em cada transição

**Validação:** ciclo completo aguardando_pagamento → concluido funciona.

#### Fase 4: Conversão e Integrações

- [ ] `createOrderFromQuote()` real (substitui stub PRD-031)
- [ ] Substituir stub PRD-022 (criação real a partir de aceite SDR)
- [ ] Integração com PRD-016: marcar item aplicado a veículo cria IVehicleServiceEntry
- [ ] Cálculo de comissão preview com regras simples

**Validação:** orçamento aceito vira pedido real; histórico do veículo cresce.

#### Fase 5: Cancelamento, NF, Polish

- [ ] Cancelamento com regras por estado
- [ ] NF placeholder (gerar número fake)
- [ ] Integração com PRD-012 (tab Pedidos via `<CustomerOrdersList>`)
- [ ] Mobile responsivo
- [ ] Documentação `docs/orders.md`

**Validação:** cancelamento respeita regras; tab da ficha mostra pedidos do cliente.

---

## Dependências

### PRDs Anteriores

| PRD                          | Status                   |
| ---------------------------- | ------------------------ |
| PRD-002                      | 📝 Redigido              |
| PRD-012 (tab Pedidos)        | 📝 Redigido              |
| PRD-016 (service history)    | 📝 Redigido              |
| PRD-022 (substitui stub)     | 📝 Redigido              |
| PRD-030 (Catálogo)           | 📝 Redigido (lote atual) |
| PRD-031 (Orçamento — origem) | 📝 Redigido (lote atual) |

### Dependências Futuras

| PRD                          | Como Lidar                                            |
| ---------------------------- | ----------------------------------------------------- |
| PRD-047 (Comissões)          | Comissão preview no MVP; cálculo definitivo na Onda 2 |
| Integração SEFAZ             | Fase 2                                                |
| Integração gateway pagamento | Fase 2                                                |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-17   | PRDs 010-031 | 📝           |
| **18** | **PRD-032**  | **🔄 ATUAL** |
| 19     | PRD-033      | ⏳           |

---

## Considerações de Segurança

### Pagamento sensível

Marcar como pago é evento financeiro. Audit obrigatório com `actorId`. Refund placeholder no MVP; Fase 2 com integração real exigirá controles adicionais.

### NF placeholder

`invoiceNumber` fake no MVP. Não usar em ambiente real até integração SEFAZ. Banner deixa claro.

### Comissão preview ≠ comissão final

Banner explícito evita confusão. PRD-047 trata cálculo definitivo com regras complexas (metas, bônus, splits).

### Cancelamento pós-pagamento

Refund manual no MVP. Audit log obrigatório com motivo. Fase 2 com integração de gateway terá refund automático.

---

## Fluxos de Usuário

### Fluxo Principal — Orçamento vira pedido

1. Cliente aceitou orçamento via SDR (PRD-022)
2. Carlos abre `/app/pedidos`, vê novo pedido com badge "🤖 SDR"
3. Abre detalhe → seção pagamento mostra "Aguardando pagamento - PIX"
4. Carlos confirma via WhatsApp que cliente pagou
5. Clica "Marcar como pago" → status muda
6. Clica "Iniciar separação" → fulfillment muda para pending
7. Quando peça empacotada, clica "Marcar enviado" → preenche transportadora "Mercúrio" + tracking "ME12345"
8. 3 dias depois, cliente confirma recebimento
9. Carlos clica "Marcar entregue"
10. Pedido conclui ciclo

### Fluxo Alternativo — Aplicação a veículo

1. Pedido para cliente Aurora com 2 items (filtro óleo + filtro ar)
2. Aurora tem 8 caminhões cadastrados
3. Carlos abre detalhe do pedido
4. Marca "Filtro óleo" aplicado ao Volvo R450 ABC-1234
5. Marca "Filtro ar" também ao mesmo veículo
6. Automaticamente: 2 IVehicleServiceEntry criadas para esse Volvo
7. Marina (Gestor) abre histórico do veículo (PRD-016): vê as 2 trocas registradas

### Fluxo de Cancelamento

1. Cliente arrependeu-se antes de pagar
2. Carlos abre pedido em aguardando_pagamento
3. Clica "Cancelar"
4. Preenche motivo: "Cliente desistiu — encontrou peça mais barata em outro lugar"
5. Confirma → status vira cancelado, audit log, sem refund necessário

### Fluxo Mobile

1. Vendedor em campo abre /app/pedidos no celular
2. Lista compacta
3. Toca em pedido → detalhe em tela cheia
4. Seções stack vertical
5. Atualiza status touch via botões grandes

---

## Convenções de Código

| Elemento        | Convenção           | Exemplo                                                      |
| --------------- | ------------------- | ------------------------------------------------------------ |
| **Página**      | PascalCase + `Page` | `OrdersListPage`, `OrderDetailPage`                          |
| **Componentes** | PascalCase          | `<CustomerOrdersList>`, `<OrderStatusBadge>`                 |
| **Helpers**     | camelCase           | `computeOrderStatus`, `createOrderFromQuote`                 |
| **Pasta**       | kebab-case          | `orders/`                                                    |
| **Git commits** | Conventional        | `feat(orders): add order lifecycle with vehicle integration` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                                      | Descrição                                                    |
| ---------------------------------------------- | ------------------------------------------------------------ |
| **Lifecycle agregado**                         | Status legível derivado de paymentStatus + fulfillmentStatus |
| **Snapshots imutáveis**                        | Items preservam preço/OEM mesmo se catálogo mudar            |
| **Aplicação a veículo opcional mas integrada** | Quando marcado, IVehicleServiceEntry automática              |
| **Comissão preview ≠ definitiva**              | Banner explícito; PRD-047 cuida do cálculo real              |
| **Cancelamento com regras**                    | Pós-envio bloqueado; usar devolução                          |
| **NF e pagamento placeholders**                | Fluxo completo no MVP, integração na Fase 2                  |

### O que NÃO Fazer

| ❌ Evitar                                                     |
| ------------------------------------------------------------- |
| Permitir cancelamento de pedido enviado                       |
| Esquecer audit log em transições                              |
| Esquecer IVehicleServiceEntry quando vendedor marca aplicação |
| Implementar SEFAZ — placeholder                               |
| Implementar gateway pagamento — placeholder                   |
| Implementar refund automático — Fase 2                        |
| Calcular comissão real com regras complexas — PRD-047         |
| Permitir edição de items após pagamento (snapshot é sagrado)  |
| Esquecer atomicidade em transições + entries no histórico     |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                   |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — lifecycle de 8 estados, conversão de orçamento, integração com veículos, comissão preview, NF placeholder |

---

**AILA - Sistemas Inteligentes**
