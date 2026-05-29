# PRD-071: Portal do Cliente B2B (esqueleto completo)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                           |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                |
| **Objetivo**          | Construir esqueleto completo do Portal B2B — sub-app dedicado para clientes corporativos com gestão de frota avançada, solicitações de orçamento estruturadas, aprovações internas, multi-usuário, faturamento corporativo, análise de gastos e suporte priorizado |
| **Tipo**              | Feature                                                                                                                                                                                                                                                            |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                               |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                  |
| **Prioridade**        | Média                                                                                                                                                                                                                                                              |
| **Épico**             | Bloco 6 — Auxiliares                                                                                                                                                                                                                                               |
| **Profundidade**      | **Esqueleto completo (E+)** — estrutura mais profunda preparada para Fase 2                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-012 (Cliente), PRD-016 (Veículos), PRD-031 (Orçamentos), PRD-032 (Pedidos), PRD-060 (Storefront público), PRD-065 (Conta — versão essencial e-com), PRD-067 (Integração Central)                                                                               |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                 |
| **Padrão de código**  | Feature-based; código em `src/features/b2b-portal/`; rotas `/portal/*` (separado de `/loja/*`)                                                                                                                                                                     |

### Critérios de Complexidade

> **Justificativa de Alta:** sub-app dedicado com layout próprio (não responsive do /loja), múltiplos módulos (dashboard, frota, solicitações, pedidos, faturamento, análise, usuários, perfil), 8+ telas principais, multi-usuário com hierarquia (admin do cliente vs comprador padrão), workflow de aprovação interna (gerente aprova compras > X), faturamento corporativo placeholder (limites, parcelas estendidas), catálogo personalizado por contrato (placeholder Fase 2), reuso de PRDs internos (012, 016, 031, 032), e diferenciação clara de PRD-065 (este é B2B avançado).

---

## Contexto do Problema

PRD-065 cobre conta de cliente essencial para o e-commerce (/loja/conta). Cliente B2C resolve com isso. Mas cliente **B2B corporativo grande** precisa de mais:

**Frota com 50 caminhões precisa de gestão.** Não basta listar veículos — precisa de manutenção programada, alertas, controle de quem dirige.
**Múltiplos compradores na mesma empresa.** Gerente de frota, mecânico chefe, comprador — todos precisam acessar mas com permissões diferentes.
**Aprovação interna obrigatória.** Comprador faz pedido, gerente aprova antes de ir para GALLO.
**Faturamento corporativo.** Limite de crédito, parcelamento 30/60/90, faturamento mensal.
**Catálogo personalizado.** Cliente A tem desconto 10% pelo contrato — vê preços com desconto aplicado.
**Análise de gastos.** "Quanto gastamos com filtros em 2026?" — visão corporativa.

Este PRD entrega: **estrutura completa** do portal preparada para implementação plena na Fase 2. No MVP: navegável com placeholders coerentes em features pesadas.

> **Nota:** "Esqueleto completo" significa **mais profundo que outros esqueletos** (PRD-070 PWA). Aqui há 5 fases de implementação para o esqueleto em si, com placeholders de múltiplas dimensões.

---

## Conceito da Solução

### Diferenciação clara

| Sub-app                    | Audiência                    | Características                                             |
| -------------------------- | ---------------------------- | ----------------------------------------------------------- |
| **/loja** (PRD-060)        | B2C principal + B2B simples  | Vitrine pública + checkout self-service                     |
| **/loja/conta** (PRD-065)  | Cliente logado básico        | Histórico, perfil, endereços, veículos B2B básico           |
| **/portal** (este PRD-071) | **B2B corporativo avançado** | **Gestão de frota, aprovações, faturamento, multi-usuário** |

Cliente B2B simples (frota pequena, sem complexidade) usa /loja/conta. Cliente B2B avançado (empresa de transportes com 50+ caminhões) usa /portal.

### Estrutura de rotas

```
/portal/login                    → Login B2B dedicado
/portal/inicio                   → Dashboard executivo do cliente
/portal/frota                    → Gestão completa da frota
/portal/frota/:veiculoId         → Detalhe do veículo + histórico manutenção
/portal/solicitacoes             → Solicitações de orçamento
/portal/solicitacoes/nova        → Wizard estruturado
/portal/solicitacoes/:id         → Detalhe + aprovações
/portal/pedidos                  → Lista com filtros avançados
/portal/pedidos/:id              → Detalhe corporativo
/portal/faturamento              → Conta corrente, limites, parcelas
/portal/analise                  → Análise de gastos
/portal/usuarios                 → Gestão de usuários da empresa
/portal/perfil                   → Dados da empresa
/portal/suporte                  → Suporte priorizado
```

### Layout

```
┌─────────────────────────────────────────────────┐
│ HEADER PORTAL                                   │
│ Logo GALLO B2B  [Empresa: X]  [Avatar] [Sair]   │
├──────────┬──────────────────────────────────────┤
│ SIDEBAR  │ MAIN                                 │
│          │                                      │
│ • Início │ [Conteúdo da rota]                   │
│ • Frota  │                                      │
│ • Solic. │                                      │
│ • Pedid. │                                      │
│ • Fatur. │                                      │
│ • Anális.│                                      │
│ • Usuár. │                                      │
│ • Perfil │                                      │
│ • Suport.│                                      │
└──────────┴──────────────────────────────────────┘
```

Layout próprio `<PortalLayout>` com identidade institucional (tema principal GALLO — preto técnico + dourado diesel, não submarca PARTS).

### Multi-usuário e hierarquia

```typescript
IPortalUser {
  id: ID;
  customerId: ID;          // empresa (PRD-012)
  name: string;
  email: string;
  role: 'admin' | 'comprador' | 'visualizador';
  // Permissões derivadas
  canCreateRequests: boolean;
  canApproveOrders: boolean;
  approvalLimit?: number;  // R$ máximo que pode aprovar
  canManageFleet: boolean;
  canViewFinancial: boolean;
  isActive: boolean;
}
```

**Roles:**

- **admin**: tudo (gerente da frota geralmente)
- **comprador**: cria solicitações, vê pedidos próprios
- **visualizador**: read-only

### Dashboard `/portal/inicio`

KPIs corporativos:

- Pedidos em andamento
- Gastos do mês
- Frota: total veículos / em manutenção / parados
- Solicitações pendentes de aprovação
- Limite de crédito disponível (placeholder)

Atalhos:

- Nova solicitação
- Adicionar veículo
- Falar com consultor

### Gestão de Frota `/portal/frota`

Versão **avançada** do PRD-016:

- Lista de veículos com filtros (em uso / parado / em manutenção / vendido)
- Cada veículo: placa, marca/modelo/ano, motor, km atual, próxima manutenção sugerida (placeholder), histórico de peças aplicadas (PRD-016)
- Bulk operations (selecionar múltiplos para ação)
- Adicionar/editar veículo
- Importação CSV de frota (placeholder Fase 2)

### Detalhe do veículo `/portal/frota/:veiculoId`

- Header: dados completos
- Tabs: Geral / Manutenção / Documentação / Quem dirige (placeholder)
- Histórico de manutenção (IVehicleServiceEntry do PRD-016) com filtros
- Alertas: próxima manutenção sugerida (heurística simples baseada em km/tempo placeholder)
- Botão "Solicitar peças para este veículo" → /portal/solicitacoes/nova com veículo pré-selecionado

### Solicitações de Orçamento `/portal/solicitacoes`

Diferente de /loja/checkout (compra direta), solicitações são **processo estruturado**:

1. Comprador cria solicitação (não vira pedido direto)
2. Lista de items desejados (catálogo personalizado ou texto livre)
3. Pode marcar veículo de destino
4. GALLO envia orçamento (vira IQuote do PRD-031)
5. Cliente aceita ou recusa
6. Se aceita E valor > approvalLimit do comprador: aprovação interna obrigatória
7. Após aprovação: vira IOrder (PRD-032)

### Wizard de nova solicitação `/portal/solicitacoes/nova`

4 telas:

1. Items: busca em catálogo personalizado + qty + opcionalmente veículo de destino
2. Urgência: padrão / urgente / programada (data futura)
3. Observações: textarea + anexar fotos placeholder
4. Revisão e envio

Cria entrada `IPortalRequest` (modelo novo).

### Lista de pedidos `/portal/pedidos`

Filtros avançados (mais que PRD-065):

- Status, período, valor, veículo de destino, comprador interno
- Export CSV placeholder

### Detalhe do pedido `/portal/pedidos/:id`

Versão B2B do PRD-032:

- Header com status + número + total + comprador
- Items com veículos de destino
- Endereço de entrega + data prevista
- Faturamento (NF, condições)
- Aprovação interna (quem aprovou, quando)
- Botão "Repetir pedido" + "Adicionar nota fiscal" placeholder

### Faturamento `/portal/faturamento`

Esqueleto profundo:

- Conta corrente: limite, utilizado, disponível (placeholders)
- Parcelas em aberto (placeholder)
- Histórico de pagamentos (placeholder)
- Notas fiscais (placeholder)
- Banner: "Sistema completo de faturamento corporativo disponível na Fase 2"

### Análise de gastos `/portal/analise`

Gráficos:

- Gastos por mês (real — soma de IOrder pagos)
- Gastos por categoria de peça (real, drill-down)
- Gastos por veículo (real)
- Top 10 peças compradas
- Comparativo cross-período

Reuso de hooks do PRD-041 filtrados por customerId.

### Gestão de usuários `/portal/usuarios`

Admin do cliente gerencia:

- Lista de usuários (`IPortalUser`)
- CRUD com modal
- Definir role e approvalLimit
- Convidar novo usuário placeholder (email, Fase 2)

### Perfil da empresa `/portal/perfil`

- Dados cadastrais (razão social, CNPJ, endereço fiscal)
- Contatos
- Termos de pagamento (placeholder)
- Histórico de mudanças

### Suporte `/portal/suporte`

- Botão grande "Falar via WhatsApp" (link direto)
- Lista de tickets abertos (placeholder Fase 2)
- FAQ B2B placeholder
- Telefone consultor dedicado

### Catálogo personalizado (placeholder)

Setting `IPortalContract`:

- `discountPct`: desconto fixo por contrato
- `categoryDiscounts`: por categoria
- `paymentTermsExtended`: condições especiais

Aplicado na exibição de preços nas solicitações (mock no MVP).

### Auth e sessão

Auth próprio do portal (independente de /loja/conta no MVP):

- Hierarquia: customer (empresa) → portalUsers (funcionários)
- Login com email + senha
- Sessão própria

Fase 2: integração Supabase Auth com customs claims para role.

### Permissões granulares

Cada rota verifica `IPortalUser.role` e flags:

- /portal/usuarios: apenas admin
- /portal/faturamento: apenas roles com canViewFinancial
- /portal/frota edição: apenas canManageFleet
- /portal/solicitacoes/nova: apenas canCreateRequests
- Aprovação de pedidos: apenas canApproveOrders + approvalLimit

### Diferenciação visual

Tema institucional GALLO (preto técnico + dourado diesel) — não submarca PARTS. Sinaliza ambiente corporativo profissional.

### Alternativas Consideradas

| Alternativa                              | Por que descartada                                                 |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Misturar /loja/conta com /portal         | Audiências e fluxos diferentes; sub-app dedicado é melhor UX       |
| Sem multi-usuário no MVP                 | Diferencial B2B; estrutura preparada é importante                  |
| Implementar tudo no MVP                  | Impossível sem real customer demo; esqueleto navegável faz sentido |
| Workflow de aprovação sem placeholders   | Modelo correto mas implementação Fase 2                            |
| Faturamento real com integração contábil | Fase 2; placeholders coerentes                                     |
| Sem catálogo personalizado modelado      | Diferencial central B2B; modelar desde já                          |
| Sem identidade visual distinta           | Profissionalismo corporativo requer                                |

---

## Escopo

### Incluído

- ✅ Sub-app `/portal/*` com layout dedicado (tema institucional)
- ✅ Modelo `IPortalUser`, `IPortalRequest`, `IPortalContract`, hierarquia customer ↔ users
- ✅ Auth próprio mock (Fase 2 com Supabase Auth + roles)
- ✅ Login `/portal/login`
- ✅ Dashboard executivo `/portal/inicio` com KPIs corporativos
- ✅ Frota avançada `/portal/frota` + detalhe `/portal/frota/:id`
- ✅ Wizard de solicitações `/portal/solicitacoes/nova` (4 telas)
- ✅ Lista e detalhe de pedidos com filtros avançados
- ✅ Faturamento placeholder com estrutura
- ✅ Análise de gastos (real, consumindo PRD-041 filtrado)
- ✅ Gestão de usuários (CRUD admin)
- ✅ Perfil da empresa editável
- ✅ Suporte com link WhatsApp + placeholders
- ✅ Permissões granulares por role + approvalLimit
- ✅ Catálogo personalizado modelado (placeholder de aplicação real)
- ✅ Banners "Disponível na Fase 2" em features pesadas
- ✅ Reuso de PRDs internos (012, 016, 031, 032, 041)
- ✅ Mobile responsivo (sidebar vira drawer)
- ✅ Audit log em todas as ações

### Excluído

- ❌ Workflow de aprovação real (com notificações e fluxo) — Fase 2
- ❌ Faturamento real (cálculo de crédito, parcelas, conciliação) — Fase 2
- ❌ Catálogo personalizado funcional (descontos por contrato) — Fase 2
- ❌ Integração contábil — Fase 2
- ❌ NF emitida automaticamente — Fase 2
- ❌ Convite de usuários via email — Fase 2
- ❌ Importação CSV de frota funcional — Fase 2
- ❌ Manutenção programada com alertas automáticos — Fase 2
- ❌ Análise preditiva de necessidades — Fase 2
- ❌ Integração com sistemas ERP do cliente — Fase 2
- ❌ Marketplace privado entre clientes B2B GALLO — Fase 2

---

## Requisitos Funcionais

### Estrutura

- **RF-001:** Rota base `/portal/*` com `PortalLayout` próprio.
- **RF-002:** Tema institucional GALLO (preto técnico + dourado diesel).
- **RF-003:** Sidebar de navegação + main; mobile drawer.

### Modelo

- **RF-004:** Tipos: `IPortalUser`, `IPortalRequest`, `IPortalContract`, `PortalUserRole`.
- **RF-005:** Estender `ICustomer` (PRD-012) com flag `hasB2BPortal: boolean` + `portalContract?: IPortalContract`.
- **RF-006:** Mocks: 2-3 clientes B2B mockados como "portal-enabled" com 3-4 usuários cada e contratos.

### Auth

- **RF-007:** `PortalLoginPage` em `/portal/login` com auth mock.
- **RF-008:** Store `usePortalAuthStore` similar ao PRD-065 mas independente.
- **RF-009:** Estrutura preparada para Supabase Auth com custom claims (role).

### Dashboard

- **RF-010:** `PortalHomePage` com 5 KPIs + 3 atalhos.
- **RF-011:** KPIs derivados de hooks reais (pedidos, gastos) + placeholders (limite crédito).

### Frota

- **RF-012:** `PortalFleetPage` consume `IVehicle` do PRD-016 filtrando por customerId.
- **RF-013:** Lista com filtros + bulk operations placeholder.
- **RF-014:** Detalhe `PortalVehicleDetailPage` com tabs (Geral/Manutenção/Documentação/Quem dirige).
- **RF-015:** Histórico de manutenção (IVehicleServiceEntry) consume PRD-016.
- **RF-016:** Botão "Solicitar peças para este veículo" → wizard pré-preenchido.

### Solicitações

- **RF-017:** Modelo `IPortalRequest`:
  ```typescript
  IPortalRequest {
    id: ID;
    customerId: ID;
    requestedBy: ID;          // IPortalUser
    items: IPortalRequestItem[];
    urgency: 'normal' | 'urgente' | 'programada';
    scheduledFor?: ISO8601;
    notes?: string;
    status: 'aberta' | 'em_orcamento' | 'orcada' | 'aprovada' | 'rejeitada' | 'convertida' | 'cancelada';
    relatedQuoteId?: ID;       // PRD-031 quando GALLO responde
    relatedOrderId?: ID;       // PRD-032 quando convertida
    approvedBy?: ID;
    approvedAt?: ISO8601;
    storeId: ID;
    createdAt: ISO8601;
  }
  ```
- **RF-018:** Lista `PortalRequestsPage` com filtros + status.
- **RF-019:** Wizard `PortalNewRequestPage` 4 telas.
- **RF-020:** Detalhe `PortalRequestDetailPage` com:
  - Items
  - Status atual
  - Quote vinculada (se já orçada — leva ao PRD-031)
  - Workflow de aprovação interna (se aplicável)
  - Botão "Aprovar" (se valor > approvalLimit do requester)
- **RF-021:** Quando GALLO cria IQuote (PRD-031) responding a request: vincular `relatedQuoteId`.
- **RF-022:** Cliente aceita quote → vira IOrder; vincular `relatedOrderId`.

### Pedidos

- **RF-023:** `PortalOrdersListPage` similar PRD-065 mas com filtros avançados (veículo, comprador, faixa valor).
- **RF-024:** `PortalOrderDetailPage` versão B2B do PRD-032 com info corporativa (NF, aprovação).
- **RF-025:** Export CSV placeholder.

### Faturamento

- **RF-026:** `PortalBillingPage` esqueleto:
  - Cards: limite, utilizado, disponível (placeholders)
  - Lista parcelas (placeholder)
  - Notas fiscais (placeholder)
- **RF-027:** Banner explícito sobre Fase 2.

### Análise

- **RF-028:** `PortalAnalyticsPage` consume hooks reais filtrados por customerId.
- **RF-029:** 4 gráficos reais: gastos mensais, gastos por categoria, gastos por veículo, top 10 peças.
- **RF-030:** Drill-downs para pedidos relacionados.

### Usuários

- **RF-031:** `PortalUsersPage` admin only.
- **RF-032:** CRUD de IPortalUser com modal.
- **RF-033:** Definir role e approvalLimit.
- **RF-034:** Botão "Convidar usuário" placeholder.

### Perfil

- **RF-035:** `PortalProfilePage` com dados da empresa editáveis.
- **RF-036:** Audit log em mudanças.

### Suporte

- **RF-037:** `PortalSupportPage` com:
  - Botão grande "Falar via WhatsApp" (link direto número GALLO)
  - Telefone consultor
  - FAQ placeholder
  - Tickets placeholder Fase 2

### Permissões

- **RF-038:** Cada rota tem guard verificando role:
  - /portal/usuarios: admin only
  - /portal/faturamento: canViewFinancial
  - /portal/frota edit: canManageFleet
  - /portal/solicitacoes/nova: canCreateRequests
- **RF-039:** Aprovação de solicitação > approvalLimit: requer canApproveOrders.
- **RF-040:** Visualizador: tudo read-only.

### Catálogo personalizado (modelagem)

- **RF-041:** `IPortalContract`:
  ```typescript
  IPortalContract {
    discountPct?: number;
    categoryDiscounts?: Record<PartCategory, number>;
    paymentTermsExtended?: string;
    creditLimit?: number;        // placeholder Fase 2
  }
  ```
- **RF-042:** Exibição de preços nas solicitações aplica discount placeholder (cálculo simples no MVP).
- **RF-043:** Banner: "Catálogo personalizado completo na Fase 2".

### Audit

- **RF-044:** Audit em:
  - Login/logout portal
  - Criação de IPortalRequest
  - Aprovação/rejeição
  - CRUD de usuários
  - Mudanças de perfil
  - Acesso a faturamento (sensível)

---

## Requisitos Não-Funcionais

- **RNF-001:** Sub-app renderiza < 600ms.
- **RNF-002:** Mobile responsivo (sidebar vira drawer).
- **RNF-003:** Auth mock seguro o bastante para validação visual; Fase 2 com Supabase.
- **RNF-004:** WCAG 2.1 AA.
- **RNF-005:** Permissões granulares respeitadas em todas as rotas e ações.

---

## Critérios de Aceitação

```gherkin
DADO acesso /portal/login como admin B2B
QUANDO faço login
ENTÃO sou levado a /portal/inicio
  E vejo KPIs corporativos
  E sidebar com todos os módulos

DADO sou comprador (role='comprador', approvalLimit=R$ 5.000)
QUANDO tento aprovar solicitação de R$ 8.000
ENTÃO botão "Aprovar" desabilitado com tooltip "Acima do seu limite"
  E preciso pedir admin para aprovar

DADO sou admin B2B
QUANDO acesso /portal/usuarios
ENTÃO posso adicionar/editar/remover usuários da empresa
  E definir role e approvalLimit
  E audit log

DADO sou visualizador
QUANDO tento criar solicitação
ENTÃO botão "+ Nova solicitação" desabilitado
  E rota /portal/solicitacoes/nova redirect com tooltip

DADO crio solicitação com 3 items + veículo Volvo R450
QUANDO submeto wizard
ENTÃO IPortalRequest criada com status='aberta'
  E aparece no /portal/solicitacoes
  E placeholder de notificação para GALLO registrado

DADO GALLO criou IQuote respondendo minha solicitação (PRD-031)
QUANDO acesso detalhe da request
ENTÃO vejo quote vinculada
  E posso aceitar/recusar
  E se valor > meu limit, requer aprovação interna

DADO sou admin e há solicitação pendente de aprovação
QUANDO acesso dashboard
ENTÃO vejo KPI "Solicitações pendentes" com badge
  E click leva à lista filtrada

DADO acesso /portal/analise
QUANDO observo
ENTÃO vejo 4 gráficos reais com dados da minha empresa
  E drill-down funcional para pedidos

DADO mobile (< 768px)
QUANDO acesso /portal/inicio
ENTÃO sidebar vira drawer
  E layout responde adequadamente
```

---

## Fases de Implementação

| Fase | Objetivo                                                      |
| ---- | ------------------------------------------------------------- |
| 1    | Estrutura /portal + auth + layout + dashboard + perfil        |
| 2    | Frota avançada + detalhe + integração PRD-016                 |
| 3    | Solicitações wizard + lista + detalhe + workflow básico       |
| 4    | Pedidos B2B + análise (reuso PRD-041) + faturamento esqueleto |
| 5    | Usuários + permissões granulares + suporte + polish + audit   |

---

## Dependências

| PRD                                      | Status         |
| ---------------------------------------- | -------------- |
| PRD-012 (Customer com flag hasB2BPortal) | 📝 (atualizar) |
| PRD-016 (Veículos — reuso)               | 📝             |
| PRD-031 (Quote vinculação)               | 📝             |
| PRD-032 (Order vinculação)               | 📝             |
| PRD-041 (Análise hooks)                  | 📝             |
| PRD-067 (Notificação GALLO)              | 📝             |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-42   | 010-070           |
| **43** | **PRD-071 ATUAL** |

> **Marco:** **Bloco 6 completo. Toda documentação dos 50 PRDs do MVP concluída.** 🎯

---

## Considerações de Segurança

- Dados B2B contêm informações comerciais sensíveis — permissões granulares críticas
- Auth próprio é mock no MVP — Fase 2 com Supabase Auth + custom claims
- approvalLimit valida workflows (não permitir bypass)
- Audit log obrigatório em ações sensíveis (faturamento, aprovações, mudanças de usuário)
- LGPD: dados de funcionários do cliente são processados sob acordo de tratamento de dados
- Banner "Modo demonstração" em features pesadas (faturamento) para transparência

---

## Convenções

| Elemento | Convenção                                               |
| -------- | ------------------------------------------------------- |
| Páginas  | `Portal*Page` (ex: `PortalHomePage`, `PortalFleetPage`) |
| Layout   | `PortalLayout`                                          |
| Store    | `usePortalAuthStore`                                    |
| Pasta    | `b2b-portal/`                                           |
| Git      | `feat(b2b-portal): add B2B corporate portal skeleton`   |

---

## Notas para o Agente Desenvolvedor

### Princípios

- **Sub-app independente** — não confundir com /loja/conta (B2C básico)
- **Identidade institucional** — preto técnico + dourado diesel (não submarca PARTS)
- **Multi-usuário com hierarquia** — fundamental para B2B real
- **Workflow de aprovação modelado** — implementação real Fase 2
- **Reuso de PRDs internos** — Veículos (PRD-016), Quotes (PRD-031), Orders (PRD-032), Analytics (PRD-041)
- **Banners explícitos em placeholders** — transparência sobre Fase 2
- **Permissões granulares respeitadas** — nada de bypass

### Não Fazer

- Workflow de aprovação real com notificações (Fase 2)
- Faturamento funcional (cálculo de crédito) — Fase 2
- Catálogo personalizado funcional — Fase 2
- Integração com ERP do cliente — Fase 2
- Push notifications — Fase 2
- Misturar com /loja/conta (sub-app dedicado)
- Implementar tudo no MVP — esqueleto navegável é o objetivo

---

## Status

| Campo  | Valor                               |
| ------ | ----------------------------------- |
| Status | ✅ IMPLEMENTADO (v0.45.1 — Gateway) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — Portal B2B com 9 módulos, multi-usuário, workflow de aprovação, esqueleto profundo para Fase 2 |

---

**AILA - Sistemas Inteligentes**
