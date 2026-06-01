# DELTAS — Atualizações Cruzadas entre PRDs

**Projeto:** GALLO BASE DIESEL — Plataforma de Inteligência Comercial
**Versão:** 1.0
**Data:** 25/05/2026
**Autor:** AILA Sistemas Inteligentes

---

## 1. Propósito

Este documento consolida **todas as atualizações** que PRDs posteriores fazem em PRDs anteriores. Durante a redação dos 50 PRDs, identificamos que vários PRDs do meio/final do índice **estendem, substituem ou modificam** partes de PRDs do início.

**Objetivo:** orientar o agente desenvolvedor (Claude Code CLI) sobre quais PRDs anteriores precisam ser ajustados ao implementar um PRD posterior, evitando inconsistências, stubs órfãos ou dependências quebradas.

---

## 2. Convenções de leitura

Cada entrada de delta segue o formato:

| Campo             | Significado                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| **PRD impactado** | PRD que precisa ser ajustado                                                         |
| **Origem**        | Qual PRD posterior introduz a mudança                                                |
| **Tipo**          | `extend` (adiciona) / `replace` (substitui) / `enhance` (melhora) / `migrate` (move) |
| **Descrição**     | O que muda                                                                           |
| **Fase**          | Quando aplicar (durante implementação do PRD origem)                                 |

---

## 3. Deltas por PRD impactado

### 3.1 PRD-002 — Modelo Conceitual

**Origem múltipla** — PRD-002 é o registry de tipos; PRDs posteriores adicionam tipos novos.

| Origem   | Tipo    | Descrição                                                                                                                     |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PRD-031  | extend  | Adicionar `IQuote`, `IQuoteItem`, `QuoteStatus`, `QuoteOrigin`                                                                |
| PRD-032  | extend  | Adicionar `IOrder`, `IOrderItem`, `ICommissionPreview`, `OrderStatus`, `IAddress`                                             |
| PRD-042  | extend  | `IGoal` já modelado no PRD-002; adicionar `IGoalProgress`, `GoalType`, `GoalScope`, `GoalPeriod`                              |
| PRD-043  | extend  | Adicionar `IBadge`, `ISellerBadge`, `ISellerScore`, `BadgeCategory`, `BadgeRarity` (catálogo seed em `mocks/seeds/badges.ts`) |
| PRD-044  | extend  | Adicionar `IPositivationMetrics`, `ISellerPositivation`                                                                       |
| PRD-045  | extend  | Adicionar `ICustomerABC`, `IABCMetrics`, `ABCClass`                                                                           |
| PRD-046  | extend  | Adicionar `IPortfolioMetrics`, `ISellerPortfolio`                                                                             |
| PRD-047  | replace | `ICommissionPreview` (de PRD-032) substituído por `ICommissionRule` + `ICommission` + `ICommissionSplitDetails`               |
| PRD-048  | extend  | Adicionar `IDREPeriod`, `IDREComparison`                                                                                      |
| PRD-049  | extend  | Adicionar types de rentabilidade (multi-dimensão)                                                                             |
| PRD-050  | extend  | Adicionar `IInventoryAnalysis`, `IInventoryMetrics`, classe XYZ                                                               |
| PRD-051  | extend  | Adicionar `ICustomerServiceMetrics`, `IChannelMetrics`, `ISellerServiceMetrics`                                               |
| PRD-052  | extend  | Adicionar `IInventoryMovement`, `MovementType`                                                                                |
| PRD-053  | extend  | Adicionar `IInsight`, `InsightType`, `InsightPriority`, `InsightCategory`                                                     |
| PRD-060+ | extend  | Tipos do storefront (configs, hero, etc.) — manter coesos                                                                     |
| PRD-064  | extend  | Adicionar `ICartItem` em store global                                                                                         |
| PRD-070  | extend  | Adicionar `IVisit` (visita do vendedor externo)                                                                               |
| PRD-025  | extend  | Adicionar `ICopilotSuggestion`, `ICopilotBriefing`, `ICopilotSummary`, `ICopilotPanelData` e tipos auxiliares em `src/shared/types/copilot.ts` |
| PRD-071  | extend  | Adicionar `IPortalUser`, `IPortalRequest`, `IPortalContract`, `PortalUserRole`                                                |

> **Recomendação:** manter `src/shared/types/` modular — arquivo por domínio (`catalog.ts`, `quotes.ts`, `orders.ts`, `goals.ts`, etc.) em vez de tudo no `models.ts` original do PRD-002.

---

### 3.2 PRD-005 — Provider Pattern

**Origem múltipla** — cada PRD com mutations adiciona seu provider.

| Origem  | Provider novo                                                                                 |
| ------- | --------------------------------------------------------------------------------------------- |
| PRD-031 | `useQuotesProvider`                                                                           |
| PRD-032 | `useOrdersProvider`                                                                           |
| PRD-033 | `useShippingProvider` (configurações)                                                         |
| PRD-042 | `useGoalsProvider`                                                                            |
| PRD-043 | `useBadgesProvider`, `useGamificationProvider`                                                |
| PRD-047 | `useCommissionsProvider`                                                                      |
| PRD-050 | `useInventoryAnalyticsProvider` (configurações)                                               |
| PRD-053 | `useInsightsProvider`                                                                         |
| PRD-064 | `useCartStore` (Zustand persist localStorage) — não é Provider Pattern, é state global        |
| PRD-065 | `useAuthStore` (Zustand persist) — storefront auth mock                                       |
| PRD-066 | Reusa providers de PRD-060/062                                                                |
| PRD-067 | `useEcommerceIntegrationProvider`                                                             |
| PRD-070 | Reusa providers do /app                                                                       |
| PRD-071 | `usePortalAuthStore` (Zustand persist), `usePortalRequestsProvider`, `usePortalUsersProvider` |

> **Padrão consolidado:** todos os providers seguem interface estável (`list`, `get`, `create`, `update`, `delete`) preparada para drop-in replacement Mock → Supabase na Fase 2.

---

### 3.3 PRD-006 — RBAC

**Origem múltipla** — cada PRD adiciona suas permissões.

| Origem  | Permissões adicionadas                                                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-030 | `catalog.view`, `catalog.create`, `catalog.edit`, `catalog.edit_price`, `catalog.deactivate`                                                                   |
| PRD-031 | `quote.view`, `quote.create`, `quote.edit`, `quote.approve` (descontos), `quote.convert`                                                                       |
| PRD-032 | `order.view`, `order.create`, `order.cancel`, `order.refund`, `order.mark_paid`, `order.generate_invoice`                                                      |
| PRD-033 | `shipping.config` (Owner only)                                                                                                                                 |
| PRD-042 | `goal.view`, `goal.create`, `goal.edit`, `goal.edit_target`, `goal.archive`                                                                                    |
| PRD-043 | `gamification.view`, `gamification.config` (Owner)                                                                                                             |
| PRD-044 | `positivation.view`                                                                                                                                            |
| PRD-045 | `abc.view`, `abc.config` (Owner)                                                                                                                               |
| PRD-046 | `portfolio.view`                                                                                                                                               |
| PRD-047 | `commission.view`, `commission.config`, `commission.approve`, `commission.close_period`, `commission.dispute`                                                  |
| PRD-048 | `dre.view` (Owner/Financeiro/Gestor), `financial.config` (Owner/Financeiro)                                                                                    |
| PRD-049 | `profitability.view` (Owner/Financeiro/Gestor; **Vendedor BLOQUEADO**)                                                                                         |
| PRD-050 | `inventory.view`, `inventory.config`                                                                                                                           |
| PRD-051 | `service_analytics.view` (Owner/Gestor/Financeiro)                                                                                                             |
| PRD-052 | `inventory_movement.view`                                                                                                                                      |
| PRD-053 | `insights.view`, `insights.config`, `insights.dismiss`                                                                                                         |
| PRD-040 | `cockpit.view` (Owner/Gestor/Financeiro; **Vendedor BLOQUEADO**)                                                                                               |
| PRD-041 | `sales_analytics.view`                                                                                                                                         |
| PRD-066 | `storefront_admin.view`, `storefront_admin.edit`                                                                                                               |
| PRD-067 | `ecommerce_integration.config`                                                                                                                                 |
| PRD-070 | `pwa_external.view` (Fase 2: apenas `ISeller.type='external'`)                                                                                                 |
| PRD-071 | Roles próprios: `portal_admin`, `portal_buyer`, `portal_viewer` + flags (canCreateRequests, canApproveOrders, canManageFleet, canViewFinancial, approvalLimit) |

> **Recomendação:** organizar permissões em `src/shared/rbac/permissions.ts` agrupadas por domínio. Atualizar matriz visual de auditoria (PRD-006) a cada novo conjunto.

---

### 3.4 PRD-012 — Ficha do Cliente

**Origem múltipla** — fonte central que recebe tabs e badges adicionais.

| Origem  | Tipo    | Descrição                                                                                       |
| ------- | ------- | ----------------------------------------------------------------------------------------------- |
| PRD-016 | enhance | Tab "Veículos" implementada via `<CustomerVehiclesList>`                                        |
| PRD-031 | enhance | Tab "Orçamentos" via `<CustomerQuotesList>`                                                     |
| PRD-032 | enhance | Tab "Pedidos" via `<CustomerOrdersList>`                                                        |
| PRD-044 | enhance | Indicador de positivação no header                                                              |
| PRD-045 | enhance | Badge ABC (🟢/🟡/🟠) no header via `<ABCBadge customerId>`; tooltip com receita 12m + ranking   |
| PRD-046 | enhance | Indicador opcional de "lifecycle status" calculado                                              |
| PRD-049 | enhance | Tab Rentabilidade do cliente (drill-down opcional)                                              |
| PRD-071 | extend  | Flag `hasB2BPortal: boolean` + campo opcional `portalContract?: IPortalContract` em `ICustomer` |

> **Recomendação:** componentes `<CustomerXxxList>` exportados pelos PRDs respectivos e reutilizáveis na ficha + outros lugares.

---

### 3.5 PRD-014 — Painel do Gestor

**Origem múltipla** — recebe widgets de várias análises.

| Origem  | Widget adicionado                                      |
| ------- | ------------------------------------------------------ |
| PRD-042 | `<GoalsWidget>` — "Metas do mês"                       |
| PRD-043 | `<TopPerformersWidget>` — "Top performers do mês"      |
| PRD-044 | `<PositivationWidget>` — "Positivação do mês"          |
| PRD-045 | `<ABCDistributionWidget>` (opcional)                   |
| PRD-046 | `<PortfolioHealthWidget>` — saúde da carteira          |
| PRD-053 | `<CriticalInsightsWidget>` — insights críticos top 3-5 |
| PRD-067 | `<EcommerceOrdersWidget>` — pedidos via e-commerce     |

> **Recomendação:** painel é grid configurável; cada widget é card próprio que consome hook específico. Owner pode reordenar (Fase 2).

---

### 3.6 PRD-015 — Lista de Clientes

**Origem múltipla** — recebe filtros adicionais.

| Origem  | Filtro adicionado                                       |
| ------- | ------------------------------------------------------- |
| PRD-044 | "Positivado / Não positivado este mês"                  |
| PRD-045 | "Classe ABC" (multi-select A/B/C)                       |
| PRD-046 | "Status (lifecycle)" — ativo/dormente/perdido/pré-venda |
| PRD-071 | "Tem portal B2B" (toggle)                               |

> **Recomendação:** filtros são modulares; cada PRD origem injeta seu filtro via configuração da página.

---

### 3.7 PRD-016 — Veículos

**Origem múltipla** — integrações automáticas + extensões.

| Origem  | Tipo    | Descrição                                                                                                                                    |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-032 | enhance | Quando vendedor marca `appliedToVehicleId` em item de pedido, criar `IVehicleServiceEntry` automaticamente                                   |
| PRD-071 | extend  | Tela de detalhe do veículo no portal B2B tem tabs adicionais (Documentação, Quem dirige); alertas de manutenção placeholder; bulk operations |

---

### 3.8 PRD-019 — Configurações Administrativas

**Origem múltipla** — sub-rotas adicionadas + migração no PRD-066.

| Origem  | Sub-rota                                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PRD-022 | Settings do SDR (já no PRD-019 original)                                                                                         |
| PRD-033 | `/app/configuracoes/frete`                                                                                                       |
| PRD-043 | `/app/configuracoes/gamificacao`                                                                                                 |
| PRD-045 | `/app/configuracoes/curva-abc`                                                                                                   |
| PRD-047 | `/app/configuracoes/comissoes`                                                                                                   |
| PRD-048 | `/app/configuracoes/financeiro`                                                                                                  |
| PRD-050 | `/app/configuracoes/estoque-analise`                                                                                             |
| PRD-053 | `/app/configuracoes/insights`                                                                                                    |
| PRD-066 | **MIGRATE**: `/app/configuracoes/storefront` e `/app/configuracoes/storefront/categorias` → `/app/storefront-admin?tab=conteudo` |
| PRD-067 | `/app/configuracoes/ecommerce-integracao`                                                                                        |

> **Atenção crítica para PRD-066:** redirects 301 das rotas antigas (PRDs 060 e 062 originais) para `/app/storefront-admin?tab=conteudo&subtab=*` evitam quebrar bookmarks.

---

### 3.9 PRD-021 — Identificação de Peça (SDR)

**Stubs destravados por PRD-030.**

| Origem  | Tipo    | Descrição                                                                                                                                                                                                            |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-030 | replace | Substituir stubs (`searchPartsByApplication`, `findByOemCode`, `getEquivalents`, `findByAlternativeCode`, `searchPartsByText`) por implementação real. Funções já exportadas em `src/features/catalog/api/search.ts` |

---

### 3.10 PRD-022 — Orçamento via SDR

**Stubs destravados por múltiplos.**

| Origem  | Tipo    | Descrição                                                                                                     |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| PRD-031 | replace | `generateSdrQuote()` agora chama `useQuotesProvider().create()` real, persistindo `IQuote` com `origin='sdr'` |
| PRD-032 | replace | Stub `stubCreateOrder` (aceite SDR cria order) substituído por `createOrderFromQuote()` real                  |
| PRD-033 | replace | `calculateShippingPlaceholder` substituído por `calculateShipping(input): IShippingResult` real               |

---

### 3.11 PRD-030 — Catálogo

**Estendido por PRDs financeiros.**

| Origem  | Tipo    | Descrição                                                                                                                                                                                             |
| ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-048 | extend  | Adicionar `unitCost?: number` em `IPart` (custo de aquisição). Editável apenas por Owner/Gestor/Financeiro. Mock 70% das peças preenchido. Formulário de edição ganha campo (não visível ao Vendedor) |
| PRD-049 | enhance | Usa `unitCost` para cálculo de margem em rentabilidade. Sem extensão própria — apenas leitura                                                                                                         |
| PRD-050 | enhance | Usa `unitCost` + estoque para análise. Sem extensão própria                                                                                                                                           |
| PRD-061 | enhance | Reusa engines `searchPartsByApplication`, `searchPartsByText` no e-commerce                                                                                                                           |
| PRD-063 | enhance | Reusa `getEquivalents` para mostrar equivalências na ficha do e-com                                                                                                                                   |

---

### 3.12 PRD-031 — Orçamento (Quote)

**Stubs destravados por PRD-032.**

| Origem  | Tipo    | Descrição                                                                                                                                                                      |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRD-032 | replace | Stub interno `stubCreateOrder` (botão "Converter em pedido") substituído por `createOrderFromQuote(quoteId, additionalData)` real, criando `IOrder` com referência a `quoteId` |
| PRD-033 | replace | Cálculo de frete via PRD-033 real                                                                                                                                              |
| PRD-067 | enhance | Quando IQuote criada respondendo `IPortalRequest` (PRD-071), preencher `relatedQuoteId` na request                                                                             |

---

### 3.13 PRD-032 — Pedido (Order)

**Preview substituído por PRD-047.**

| Origem  | Tipo    | Descrição                                                                                                                                                                           |
| ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-033 | replace | Frete via PRD-033 real (snapshot mantido no pedido)                                                                                                                                 |
| PRD-047 | replace | `commissionPreview: ICommissionPreview` substituído por relação 1:N com `ICommission` (gerado automaticamente ao marcar como pago). Banner "Preview" muda para "Comissão calculada" |
| PRD-052 | enhance | Cada `IOrderItem` em pedido pago gera derivação `IInventoryMovement` tipo `saida_venda` automaticamente (via hook deriver, não mutation explícita)                                  |
| PRD-064 | extend  | `createOrderFromCart()` é nova função análoga a `createOrderFromQuote()`, criando `IOrder` com `origin='ecommerce'`                                                                 |
| PRD-067 | enhance | Hook `useEcommerceOrderTrigger()` reage à criação de IOrder com origin='ecommerce' — atribui sellerId, cria conversa, notifica                                                      |
| PRD-071 | enhance | Versão B2B do detalhe (sem alterar PRD-032 base; apenas reuso)                                                                                                                      |

---

### 3.14 PRD-010 / PRD-011 — Inbox / Conversa

**Atualizados por PRD-067.**

| Origem  | Tipo    | Descrição                                                                                                                                                |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-067 | enhance | **PRD-010 (Inbox)**: conversas com `origin='ecommerce'` recebem badge "🛒"; filtro adicional na lista                                                    |
| PRD-067 | enhance | **PRD-011 (Conversa)**: header da conversa mostra banner "Conversa criada via E-commerce — [link para pedido vinculado]" quando `linkedOrderId` presente |

---

### 3.15 PRD-040 — Cockpit Executivo

**Consome hooks de múltiplos PRDs analíticos.**

| Origem  | Hook consumido                                                         |
| ------- | ---------------------------------------------------------------------- |
| PRD-041 | `useSalesMetrics`, `useFunnelMetrics`                                  |
| PRD-042 | `useGoalsStatistics`                                                   |
| PRD-044 | `usePositivationMetrics`                                               |
| PRD-045 | `useABCMetrics`                                                        |
| PRD-046 | `usePortfolioMetrics`                                                  |
| PRD-047 | `useCommissionMetrics`                                                 |
| PRD-048 | (consome via cálculo agregado)                                         |
| PRD-049 | `useProductProfitability`, etc.                                        |
| PRD-050 | `useInventoryMetrics`                                                  |
| PRD-053 | `useInsights` + `useExecutiveAlerts` (banner topo)                     |
| PRD-067 | KPI "Total Pedidos" com breakdown por origem (SDR/Manual/E-com/Portal) |

> **Nota importante:** PRD-040 menciona "stubs aceitáveis quando PRDs dependentes ainda não implementados". Ao implementar PRDs analíticos posteriores, substituir stubs no cockpit por dados reais.

---

### 3.16 PRD-060 — Home Storefront

**Sub-config migrada para PRD-066.**

| Origem  | Tipo    | Descrição                                                                                                                                                            |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-066 | migrate | Sub-rota `/app/configuracoes/storefront` migra para `/app/storefront-admin?tab=conteudo&subtab=home`. Redirect 301 obrigatório. Editor unificado com PRD-062 configs |

---

### 3.17 PRD-062 — Listagem Categoria

**Sub-config migrada para PRD-066.**

| Origem  | Tipo    | Descrição                                                                                                                                       |
| ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-066 | migrate | Sub-rota `/app/configuracoes/storefront/categorias` migra para `/app/storefront-admin?tab=conteudo&subtab=categorias`. Redirect 301 obrigatório |

---

### 3.18 PRD-063 — Ficha de Produto (E-commerce)

**Consumido por PRD-064 via store.**

| Origem  | Tipo    | Descrição                                                                                             |
| ------- | ------- | ----------------------------------------------------------------------------------------------------- |
| PRD-064 | enhance | Botão "Adicionar ao Carrinho" usa `useCartStore.addItem()` do PRD-064. Mini-preview do header dispara |

---

### 3.19 PRD-011 — Tela de Conversa

**Extendida pelo copiloto (PRD-025).**

| Origem  | Tipo    | Descrição                                                                                                                                                                                                                   |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-025 | enhance | A tela de conversa (`ConversationPage`) monta a superfície do Copiloto (faixa, aba ou card, conforme `VITE_COPILOT_PLACEMENT`) via `useCopilotPanel`. A superfície é **privada ao vendedor** e nunca exposta ao cliente. O hook `useCopilotPanel` encapsula provider + dismiss + placement, sem alterar o modelo de mensagens nem o layout base da conversa. |

---

## 4. Resumo de stubs substituídos

Tabela consolidada de stubs criados em PRDs anteriores e substituídos por implementações reais em PRDs posteriores:

| Stub (PRD origem)                         | Implementação real (PRD que substitui)                |
| ----------------------------------------- | ----------------------------------------------------- |
| `searchPartsByApplication` (PRD-021)      | PRD-030                                               |
| `findByOemCode` (PRD-021)                 | PRD-030                                               |
| `getEquivalents` (PRD-021)                | PRD-030                                               |
| `findByAlternativeCode` (PRD-021)         | PRD-030                                               |
| `searchPartsByText` (PRD-021)             | PRD-030                                               |
| `generateSdrQuote` (PRD-022)              | PRD-031                                               |
| `stubCreateOrder` (PRD-022 aceite)        | PRD-032                                               |
| `stubCreateOrder` (PRD-031 conversão)     | PRD-032                                               |
| `calculateShippingPlaceholder` (PRD-022)  | PRD-033                                               |
| `calculateShipping` placeholder (PRD-031) | PRD-033                                               |
| Frete em PRD-032                          | PRD-033                                               |
| `commissionPreview` em PRD-032            | PRD-047 (substitui por `ICommission` real)            |
| Margem mockada em PRD-040                 | PRD-049                                               |
| Hooks analíticos em PRD-040 (stubs)       | PRDs 041, 042, 044, 045, 046, 047, 048, 049, 050, 053 |

---

## 5. Migrações de rotas (redirects 301)

Críticas para não quebrar bookmarks e SEO:

| Rota antiga                                | Rota nova                                              | Origem  |
| ------------------------------------------ | ------------------------------------------------------ | ------- |
| `/app/configuracoes/storefront`            | `/app/storefront-admin?tab=conteudo&subtab=home`       | PRD-066 |
| `/app/configuracoes/storefront/categorias` | `/app/storefront-admin?tab=conteudo&subtab=categorias` | PRD-066 |

---

## 6. Aplicação durante implementação

### 6.1 Ordem recomendada de implementação

Mantendo a sequência dos PRDs (001→071) e aplicando deltas conforme cada PRD posterior é implementado:

1. **Bloco 0 (PRDs 001-007)**: implementar como redigido
2. **Bloco 1 (PRDs 010-019)**: durante implementação, prever que tabs e filtros vão receber adições nos próximos blocos — manter estrutura extensível
3. **Bloco 2 (PRDs 020-024)**: ao implementar PRD-021, deixar stubs claramente marcados para substituição no PRD-030
4. **Bloco 3 (PRDs 030-033)**: SUBSTITUIR stubs do Bloco 2; adicionar tabs em PRD-012
5. **Bloco 4 (PRDs 040-053)**: ESTENDER PRD-002 com novos tipos; ESTENDER PRD-006 com permissões; ESTENDER PRD-019 com sub-rotas; ADICIONAR widgets em PRD-014; ADICIONAR filtros em PRD-015; ESTENDER PRD-030 com `unitCost` no PRD-048; SUBSTITUIR commissionPreview no PRD-047
6. **Bloco 5 (PRDs 060-067)**: BADGES em PRD-010/011 via PRD-067; MIGRAR configs no PRD-066
7. **Bloco 6 (PRDs 070-071)**: ESTENDER PRD-012 com flag B2B no PRD-071

### 6.2 Princípio operacional

> **Toda vez que o agente desenvolvedor implementar um PRD posterior que tenha entrada neste documento, deve aplicar o delta correspondente no PRD anterior ANTES de marcar o PRD posterior como concluído.**

Exemplo:

- Implementando PRD-048 (DRE)
- Consulta este DELTAS.md
- Vê que precisa adicionar `unitCost?: number` em `IPart` (PRD-030)
- Aplica delta primeiro: estende `IPart`, atualiza formulário de edição (Owner/Gestor/Financeiro only), atualiza mocks
- Só então implementa PRD-048 propriamente

---

## 7. Princípios consolidados

### 7.1 Snapshots imutáveis

Vários PRDs preservam snapshots no momento da criação para auditoria:

- PRD-031 (Orçamento): items com snapshot de preço/OEM
- PRD-032 (Pedido): items com snapshot
- PRD-047 (Comissão): snapshot de regra + meta no momento do cálculo

**Regra:** snapshots são SAGRADOS. Mudanças em entidades-fonte (catálogo, metas, regras) NÃO alteram snapshots históricos. Audit log trilha mudanças nas entidades-fonte.

### 7.2 Audit log obrigatório

Áreas com audit log crítico (não opcional):

- Mudanças de preço (PRD-030)
- Mudanças de target de meta (PRD-042) — impacta comissões
- Aprovação de descontos (PRD-031)
- Mudanças de regra de comissão (PRD-047)
- Fechamento de período de comissão (PRD-047)
- Mudanças de configuração financeira (PRD-048)
- Cancelamento de pedido (PRD-032)
- Dismiss de insights (PRD-053)
- CRUD de usuários do portal B2B (PRD-071)

### 7.3 Banners "Modo demonstração / Fase 2"

Áreas com placeholders explícitos exigem banner visível:

- Cálculo de frete (PRD-033) — config admin
- NF (PRD-032)
- Pagamento (PRD-064)
- Notificações ao cliente via WhatsApp/email (PRD-067)
- Insights via LLM real (PRD-053)
- Faturamento corporativo (PRD-071)
- Workflow de aprovação (PRD-071)
- Customização avançada storefront (PRD-066)
- Offline-first PWA (PRD-070)
- Importação CSV (PRD-030)

### 7.4 Permissões granulares

Vendedor BLOQUEADO em (importante!):

- PRD-040 Cockpit
- PRD-048 DRE
- PRD-049 Rentabilidade
- PRD-050 Estoque Análise
- PRD-051 Atendimento Análise
- PRD-052 Estoque Movimentação
- PRD-053 Insights
- PRD-066 Storefront Admin
- PRD-067 E-commerce Integração (config)

### 7.5 Equipes dormentes

Lembrete: `ITeam` está modelado mas NÃO opera no MVP. Não implementar features de equipe (metas por equipe, comissões por equipe). Estrutura preparada para Fase 2.

### 7.6 Carteira 1:1 estrita

Cliente tem UM vendedor responsável. Transferências (PRD-018) são o mecanismo de mudança. PRD-067 e PRD-071 respeitam isso ao atribuir/exibir vendedor responsável.

---

## 8. Versionamento deste documento

| Versão | Data       | Autor | Mudança                                                                                                                                                                    |
| ------ | ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0    | 25/05/2026 | AILA  | Criação inicial — consolidação de deltas dos 50 PRDs                                                                                                                       |
| 1.1    | 27/05/2026 | AILA  | PRD-043 redigido — detalhamento do catálogo de badges + componente `<SellerBadgesGrid>` exportável; reforço de que PRD-040 já reserva slot para `<RankingHighlightWidget>` |
| 1.2    | 31/05/2026 | AILA  | PRD-025 implementado — adicionado delta em 3.1 (PRD-002: tipos do copiloto) e nova seção 3.19 (PRD-011: tela de conversa extendida pela superfície do Copiloto) |

---

## 9. Como manter este documento

Quando novos PRDs forem adicionados ou existentes revisados, atualizar este documento se houver deltas cruzados. Antes de marcar um PRD como "implementado" no INDEX, validar que todos os deltas com origem nesse PRD foram aplicados.

---

**AILA - Sistemas Inteligentes**
