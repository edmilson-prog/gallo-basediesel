# PRD-067: Integração E-commerce ↔ Central

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                              |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                   |
| **Objetivo**          | Integrar pedidos do e-commerce com a Central de Atendimento — atribuição automática de vendedor, notificações, conversa vinculada, status bidirecional, visão consolidada para gestão |
| **Tipo**              | Feature                                                                                                                                                                               |
| **Complexidade**      | Alta                                                                                                                                                                                  |
| **Total de Fases**    | 5                                                                                                                                                                                     |
| **Prioridade**        | Alta                                                                                                                                                                                  |
| **Épico**             | Bloco 5 — E-commerce (Onda 3)                                                                                                                                                         |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-011 (Conversa), PRD-013 (Distribuição), PRD-032 (Pedido), PRD-064 (Carrinho/Checkout), PRD-014 (Painel Gestor)                                                   |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                    |
| **Padrão de código**  | Feature-based; código em `src/features/ecommerce-integration/`                                                                                                                        |

### Critérios de Complexidade

> **Justificativa de Alta:** integração cross-PRDs garantindo coerência entre /loja (público) e /app (interno), atribuição automática via PRD-013 (round-robin específico para e-com), criação automática de IConversation vinculada (PRD-010/011) para o vendedor acompanhar, notificações em tempo real, badges visuais distinguindo pedidos e-com no CRM, status bidirecional (vendedor atualiza no CRM e cliente vê no /loja/conta), templates de notificação ao cliente placeholders WhatsApp, e visão consolidada de Owner/Gestor.

---

## Contexto do Problema

PRD-064 cria `IOrder` com `origin='ecommerce'` quando checkout conclui. Mas sem integração explícita:

**Vendedor não sabe que tem pedido novo.** IOrder criado mas ninguém é notificado — pedido fica órfão.
**Cliente não recebe confirmação proativa.** Página de confirmação aparece, mas WhatsApp/email não dispara.
**Owner não distingue pedidos e-com vs SDR vs manuais.** Sem badge visual claro na inbox/lista de pedidos, mistura.
**Conversa de acompanhamento não existe.** Vendedor não tem canal pré-aberto para falar com o cliente.

Este PRD entrega: orquestração completa do "depois do checkout" — vendedor atribuído, notificado, conversa criada, cliente comunicado.

---

## Conceito da Solução

### Fluxo completo

```
1. Cliente confirma pedido em /loja/checkout
   ↓
2. PRD-064 chama createOrderFromCart() → IOrder criado com origin='ecommerce'
   ↓
3. Este PRD-067 dispara:
   a) Atribuição de vendedor via PRD-013 (round-robin específico e-com)
   b) Criação de IConversation vinculada
   c) Notificação para vendedor (toast + badge)
   d) Notificação para cliente (placeholder WhatsApp)
   ↓
4. Vendedor acessa inbox → vê conversa nova com badge "🛒 E-commerce"
   ↓
5. Vendedor acompanha pedido via inbox + status no /app/pedidos
   ↓
6. Mudanças de status (paid → shipped → delivered) refletem em /loja/conta do cliente
```

### Round-robin específico para e-commerce

Setting `IPlatformSettings.ecommerceAssignmentMode`:

- `round_robin` (default): distribui sequencialmente entre vendedores ativos
- `manager_distributes`: cria sem sellerId, Gestor distribui manualmente
- `specific_seller`: setting `ecommerceSpecificSellerId` recebe todos

Distribuição respeita:

- Vendedores ativos da loja
- Carga atual (próximo na fila com menor número de e-com aberto)

### Criação de IConversation automática

Quando IOrder e-com é criado:

```typescript
const conversation: IConversation = {
  id: generateId(),
  customerId: order.customerId,
  assignedSellerId: order.sellerId,
  status: "aberta",
  origin: "ecommerce",
  topic: `Pedido #${order.number} via E-commerce`,
  channel: "system", // Origem do contato
  startedAt: now,
  storeId: order.storeId,
  // Mensagem inicial automática
  initialMessage: {
    text: `Novo pedido via e-commerce — ${order.items.length} itens — R$ ${order.total}`,
    direction: "system",
    timestamp: now,
  },
  // Vínculos
  linkedOrderId: order.id,
};
```

Aparece na inbox do vendedor com badge "🛒 E-commerce" distinto.

### Notificação para vendedor

Toast prominente quando vendedor logado:

- "🛒 Novo pedido via e-commerce — [Cliente] — R$ X"
- Botão "Ver pedido" → /app/pedidos/:id
- Botão "Abrir conversa" → /app/atendimento/:conversationId

Badge no menu lateral: contador de pedidos e-com pendentes.

Se vendedor offline: notificação fica em "Central de notificações" placeholder (mostra próximo login).

### Notificação para cliente (placeholder)

Template mock no MVP, sem disparar real:

- WhatsApp:

  ```
  Olá [nome]! Seu pedido #PD-2026-0042 foi recebido.
  Valor: R$ 430,00
  Forma de pagamento: PIX
  Em breve enviaremos as instruções de pagamento.

  GALLO BASE DIESEL
  ```

- Email placeholder (sem envio real no MVP)

Audit log registra envio placeholder. Fase 2: integração Meta API + email service.

### Status bidirecional

Mudanças no `IOrder` refletem em `/loja/conta/pedidos/:id` automaticamente (mesmo backend mock).

Quando vendedor atualiza status (PRD-032: marcar pago, marcar enviado, etc.):

- Cliente em /loja/conta vê atualizado
- Notificação placeholder ao cliente (mockada) para cada transição relevante

### Visão consolidada

PRD-014 (Painel Gestor) ganha widget "Pedidos via E-commerce":

- Contador de pedidos e-com no período
- Pendentes de processamento
- Click leva à inbox filtrada por origin='ecommerce'

PRD-040 (Cockpit) ganha KPI no card "Total Pedidos": breakdown por origem (SDR / Manual / E-commerce / Portal).

### Badge visual e-commerce

Em todas as listagens:

- Inbox (PRD-010): conversa com origin='ecommerce' tem badge "🛒"
- Lista de pedidos (PRD-032): pedido com origin='ecommerce' tem badge
- Lista de clientes (PRD-015): customer com pedido recente e-com tem indicador opcional

### Configuração `/app/configuracoes/ecommerce-integracao`

Sub-rota PRD-019 (Owner):

- Modo de atribuição (3 opções)
- Vendedor específico (se aplicável)
- Templates de notificação placeholder (editável textarea)
- Toggle "Criar conversa automática"
- Banner: "Notificações reais (WhatsApp/Email) disponíveis na Fase 2"

### Pedido de visitante (sem customer existente)

PRD-064 permite guest checkout — cria customer placeholder. Aqui:

- Customer placeholder marcado com flag `isGuestCheckout=true`
- Vendedor recebe conversa normalmente
- Customer pode posteriormente fazer cadastro (PRD-065) e ser "promovido" para customer normal vinculando histórico

### Permissões

- **Vendedor**: vê suas conversas/pedidos e-com normalmente
- **Gestor**: configura modo de atribuição na sua loja
- **Owner**: configura cross-store

### Alternativas Consideradas

| Alternativa                   | Por que descartada                                             |
| ----------------------------- | -------------------------------------------------------------- |
| Sem conversa automática       | Vendedor perde canal pré-aberto                                |
| Atribuição manual obrigatória | Atrito; round-robin automatiza bem                             |
| Sem notificação ao cliente    | Cliente fica órfão pós-checkout (apenas página de confirmação) |
| Sem distinção visual e-com    | Owner perde tracking de origem                                 |
| Notificações reais no MVP     | Complexidade WhatsApp/email; placeholders coerentes            |

---

## Escopo

### Incluído

- ✅ Hook `useEcommerceOrderTrigger()` reagindo a criações de IOrder com origin='ecommerce'
- ✅ Atribuição automática de vendedor via 3 modos configuráveis (round-robin/manager/specific)
- ✅ Criação automática de IConversation vinculada com badge e-commerce
- ✅ Notificação toast para vendedor (online) + central de notificações (offline)
- ✅ Notificação placeholder ao cliente (WhatsApp + email mockados)
- ✅ Templates configuráveis de notificação
- ✅ Status bidirecional (mudanças em IOrder refletem em /loja/conta)
- ✅ Badge "🛒 E-commerce" em inbox (PRD-010), lista de pedidos (PRD-032), conversas (PRD-011)
- ✅ Widget "Pedidos via E-commerce" no Painel Gestor (PRD-014)
- ✅ Breakdown por origem no Cockpit (PRD-040)
- ✅ Sub-rota `/app/configuracoes/ecommerce-integracao` (Owner)
- ✅ Suporte a guest checkout (customer placeholder com flag)
- ✅ "Promoção" de customer placeholder a customer normal quando faz cadastro
- ✅ Audit log em atribuição, notificações, mudanças de status
- ✅ Permissões granulares

### Excluído

- ❌ Notificações reais via WhatsApp (Meta API) — Fase 2 (PRD-100)
- ❌ Notificações reais via email — Fase 2
- ❌ Push notifications mobile — Fase 2
- ❌ Webhook para sistemas externos — Fase 2
- ❌ Customização avançada de templates (variáveis dinâmicas, MJML) — Fase 2
- ❌ Sequência de drip marketing pós-compra — Fase 2
- ❌ Reengajamento de carrinho abandonado — Fase 2
- ❌ Distribuição inteligente por especialidade do vendedor — Fase 2

---

## Requisitos Funcionais

### Hook trigger

- **RF-001:** Criar `useEcommerceOrderTrigger()` em `src/features/ecommerce-integration/hooks/`.
- **RF-002:** Subscreve eventos de criação de IOrder.
- **RF-003:** Quando IOrder criado com origin='ecommerce':
  - Chama `assignSeller(order)` se sellerId não preenchido
  - Chama `createConversationForOrder(order)`
  - Chama `notifySellerOfNewOrder(seller, order)`
  - Chama `notifyCustomerOfOrderConfirmation(customer, order)` (placeholder)

### Atribuição de vendedor

- **RF-004:** `assignSeller(order, mode)`:
  - **round_robin**: vendedores ativos da loja ordenados por menor número de e-com abertos (round-robin com fairness)
  - **manager_distributes**: deixa sellerId vazio, dispara notificação para gestores
  - **specific_seller**: usa `settings.ecommerceSpecificSellerId`
- **RF-005:** Atualiza `order.sellerId` via provider; audit log.

### Conversa automática

- **RF-006:** `createConversationForOrder(order)`:
  - Cria IConversation com origin='ecommerce', topic descritivo, linkedOrderId
  - Adiciona mensagem inicial system
  - Salva via provider
- **RF-007:** Conversa aparece na inbox do vendedor (PRD-010) automaticamente.

### Notificações para vendedor

- **RF-008:** `notifySellerOfNewOrder(seller, order)`:
  - Se vendedor online (estado de presença mock): toast prominente
  - Se offline: cria entrada em "central de notificações" mockada (placeholder de PRD-100 Fase 2)
- **RF-009:** Toast inclui CTA "Ver pedido" + "Abrir conversa".
- **RF-010:** Badge contador no menu lateral incrementa.

### Notificações para cliente

- **RF-011:** `notifyCustomerOfOrderConfirmation(customer, order)`:
  - Renderiza template (mock no MVP)
  - Loga audit "ecommerce_notification_sent" com canal e conteúdo
  - SEM envio real
- **RF-012:** Templates editáveis em settings.

### Status bidirecional

- **RF-013:** Não exige sincronização especial — ambos lados (CRM e /loja/conta) leem mesmo IOrder via providers.
- **RF-014:** Quando vendedor muda status (PRD-032), `notifyCustomerOfStatusChange()` placeholder:
  - paid → "Pagamento confirmado"
  - shipped → "Pedido enviado"
  - delivered → "Pedido entregue"
  - canceled → "Pedido cancelado: [motivo]"

### Badges visuais

- **RF-015:** Atualizar PRD-010 (Inbox): conversa com origin='ecommerce' mostra badge "🛒".
- **RF-016:** Atualizar PRD-011 (Conversa): header da conversa mostra banner "Conversa criada via E-commerce — [link pedido]".
- **RF-017:** Atualizar PRD-032 (Lista pedidos): badge "🛒" em pedidos com origin='ecommerce'.

### Widgets de gestão

- **RF-018:** Adicionar `<EcommerceOrdersWidget>` no PRD-014 (Painel Gestor):
  - Contador de pedidos e-com no período
  - Pendentes de processamento
  - Click → inbox filtrada
- **RF-019:** Atualizar PRD-040 (Cockpit): KPI "Total Pedidos" com breakdown por origem em hover/tooltip.

### Configuração

- **RF-020:** `EcommerceIntegrationConfigPage` em `/app/configuracoes/ecommerce-integracao` (Owner).
- **RF-021:** Editor:
  - Modo de atribuição (radio 3 opções)
  - Vendedor específico (autocomplete, se aplicável)
  - Templates de notificação (textareas editáveis com variáveis: {customerName}, {orderNumber}, {total})
  - Toggle "Criar conversa automática" (default true)
  - Banner sobre Fase 2

### Guest checkout

- **RF-022:** Customer criado em guest checkout (PRD-064) tem `isGuestCheckout=true`.
- **RF-023:** Quando guest faz cadastro posteriormente (PRD-065):
  - Detecta email/CPF/CNPJ matching
  - Pergunta "Encontramos um pedido em seu nome — vincular?"
  - Se confirmado: faz merge dos dados, remove flag isGuestCheckout, vincula histórico

### Audit log

- **RF-024:** Audit em:
  - Atribuição de vendedor (`action='ecommerce_seller_assign'`)
  - Criação de conversa (`action='ecommerce_conversation_create'`)
  - Notificação enviada (`action='ecommerce_notification_sent'` com canal e conteúdo)
  - Mudança de modo de atribuição (`action='ecommerce_config_update'`)
  - Merge de guest com cadastrado

### Permissões

- **RF-025:** Configuração: Owner.
- **RF-026:** Modo de atribuição respeita loja (Gestor configura sua loja).

---

## Requisitos Não-Funcionais

- **RNF-001:** Trigger pós-checkout completa em < 500ms (atribuição + conversa + notificações mock).
- **RNF-002:** Atomicidade: se algum passo falha, log de erro + reprocessamento manual via Gestor.
- **RNF-003:** Templates renderizam corretamente com variáveis substituídas.
- **RNF-004:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO cliente confirma pedido em /loja/checkout
QUANDO IOrder é criado com origin='ecommerce'
ENTÃO useEcommerceOrderTrigger dispara
  E sellerId é atribuído via round-robin
  E IConversation é criada com badge '🛒'
  E vendedor recebe toast + badge contador
  E audit log de notificação ao cliente registrado

DADO vendedor online quando pedido e-com chega
QUANDO trigger executa
ENTÃO toast prominente aparece com CTAs
  E badge no menu lateral incrementa

DADO vendedor abre inbox
QUANDO observa
ENTÃO conversa com origin='ecommerce' tem badge '🛒'
  E click abre conversa com banner "Criada via E-commerce — link pedido"

DADO modo de atribuição = 'manager_distributes'
QUANDO pedido e-com chega
ENTÃO sellerId fica vazio
  E gestores recebem notificação para distribuir
  E badge especial "Pendente distribuição"

DADO modo = 'specific_seller' e ecommerceSpecificSellerId = X
QUANDO pedido chega
ENTÃO sellerId = X automaticamente

DADO guest checkout cria customer placeholder
  E mesmo guest faz cadastro depois com mesmo email
QUANDO sistema detecta match
ENTÃO pergunta "Vincular pedido anterior?"
  E ao confirmar, merge dos dados + flag removida

DADO vendedor marca pedido como 'enviado'
QUANDO ação processa
ENTÃO notifyCustomerOfStatusChange dispara
  E cliente em /loja/conta/pedidos/:id vê status atualizado
  E audit log registra notificação enviada (placeholder)

DADO Owner edita template de notificação
QUANDO salva
ENTÃO próximas notificações usam novo template
  E audit log
```

---

## Fases de Implementação

| Fase | Objetivo                                                   |
| ---- | ---------------------------------------------------------- |
| 1    | Hook trigger + atribuição automática + criação de conversa |
| 2    | Notificações vendedor (toast + badge) + integração inbox   |
| 3    | Notificações cliente placeholders + templates editáveis    |
| 4    | Status bidirecional + badges visuais + widgets de gestão   |
| 5    | Guest checkout merge + audit + configuração + polish       |

---

## Dependências

| PRD                              | Status |
| -------------------------------- | ------ |
| PRD-010 (inbox — badge novo)     | 📝     |
| PRD-011 (conversa — banner novo) | 📝     |
| PRD-013 (distribuição)           | 📝     |
| PRD-014 (widget novo)            | 📝     |
| PRD-032 (pedidos com origin)     | 📝     |
| PRD-040 (KPI breakdown)          | 📝     |
| PRD-064 (cria IOrder)            | 📝     |
| PRD-065 (guest checkout)         | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-40   | 010-066           |
| **41** | **PRD-067 ATUAL** |

> **Marco:** Bloco 5 (E-commerce) completo — **Onda 3 do MVP fecha aqui**.

---

## Considerações de Segurança

- Templates de notificação podem conter PII — sanitizar antes de renderizar
- Atribuição automática audit log obrigatório
- Merge de guest com customer cadastrado: validação forte de identidade (email/CPF/CNPJ matching)
- Notificações placeholders NÃO disparam real no MVP — banner deixa claro

---

## Convenções

| Elemento | Convenção                        |
| -------- | -------------------------------- |
| Página   | `EcommerceIntegrationConfigPage` |
| Hook     | `useEcommerceOrderTrigger`       |
| Pasta    | `ecommerce-integration/`         |

---

## Notas para o Agente Desenvolvedor

- Orquestração centralizada: este PRD é o "cola" entre /loja e /app
- Round-robin com fairness (menor número de e-com abertos primeiro)
- Conversa automática é central — vendedor não pode ficar sem canal pré-aberto
- Badges visuais em 3 lugares: inbox, lista pedidos, header conversa
- Notificações placeholders SEMPRE auditadas (preparação Fase 2)
- Guest checkout → cadastro: merge respeita audit

---

## Status

| Campo  | Valor       |
| ------ | ----------- |
| Status | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                       |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — integração e-commerce com Central via atribuição automática, conversa vinculada, notificações |

---

**AILA - Sistemas Inteligentes**
