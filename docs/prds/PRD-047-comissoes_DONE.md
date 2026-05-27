# PRD-047: Comissões

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                               |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                    |
| **Obje­tivo**         | Construir sistema completo de cálculo de comissões — regras configuráveis (taxa base + bônus por meta + multiplicadores), cálculo automático sobre pedidos pagos, painel individual e consolidado, splits em transferências temporárias, e fechamento mensal auditável |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                   |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                      |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                   |
| **Épico**             | Bloco 4b — Gestão B (Onda 2)                                                                                                                                                                                                                                           |
| **PRDs Relacionados** | PRD-018 (Carteira/Transferências), PRD-032 (Pedido — fonte), PRD-042 (Metas — bônus), PRD-040 (Cockpit), PRD-014 (Painel Gestor)                                                                                                                                       |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                     |
| **Padrão de código**  | Feature-based; código em `src/features/commissions/`                                                                                                                                                                                                                   |

### Critérios de Complexidade

> **Justificativa de Alta:** sistema com **impacto financeiro real**, regras configuráveis (taxa base + bônus por meta + multiplicadores por categoria/produto opcional), cálculo automático em todos os pedidos pagos respeitando snapshots da meta no momento do pagamento (não retroativo), splits em transferências temporárias (cobertura recebe pedido fechado durante vigência), painel individual (vendedor) e consolidado (gestor/Owner), fechamento mensal com aprovação, histórico paginado com filtros, audit log obrigatório com integridade total, e relatórios para Financeiro.

---

## Contexto do Problema

PRD-032 (Pedido) já tem **comissão preview** simples (3% sobre subtotal). Mas comissão real envolve:

**Regras variáveis.** Vendedor A tem taxa 3%, B tem 4%, gestor pega 1% sobre vendas da equipe. **Bônus por meta.** Atingir 100% da meta dispara bônus adicional (R$ 500 fixo ou +1pp na taxa). **Splits em coberturas.** Vendedor X em férias, Y cobriu. Pedido fechado durante cobertura: quem recebe? Sem regra clara, briga interna. **Fechamento mensal auditável.** Owner precisa fechar comissões com confiança — sem audit log integro, disputas são interminantes.

Este PRD substitui o **commission preview** do PRD-032 pelo cálculo definitivo, com regras configuráveis e auditoria total.

---

## Conceito da Solução

### Regras de comissão

```typescript
ICommissionRule {
  id: ID;
  name: string;
  sellerId?: ID;                    // se específica do vendedor; null = default da loja
  storeId: ID;
  // Taxa base
  baseRate: number;                 // ex: 0.03 (3%)
  // Bônus por meta (opcional)
  goalBonus?: {
    goalType: GoalType;             // PRD-042 - qual tipo de meta dispara
    threshold: number;              // % atingimento para disparar (ex: 100)
    bonusType: 'fixed' | 'percentage_points'; // R$ fixo ou pp na taxa
    bonusValue: number;             // R$ 500 ou 1 (pp)
  };
  // Multiplicador por categoria (opcional, Fase 2)
  // categoryMultipliers?: Record<PartCategory, number>;
  // Validade
  validFrom: ISO8601;
  validUntil?: ISO8601;
  isActive: boolean;
  createdBy: ID;
  createdAt: ISO8601;
}
```

### Comissão por pedido

```typescript
ICommission {
  id: ID;
  orderId: ID;
  sellerId: ID;                     // beneficiário (pode ser cobertor em transferência temporária)
  baseValue: number;                // subtotal - discount (sem frete)
  baseRate: number;                 // taxa aplicada
  baseCommission: number;           // baseValue * baseRate
  goalBonus: number;                // se aplicável
  totalCommission: number;
  // Splits em transferência (PRD-018)
  isSplit: boolean;
  splitDetails?: {
    coverageSellerId: ID;
    titularSellerId: ID;
    coveragePct: number;            // ex: 100% para cobertor; ou split 50/50
    titularPct: number;
  };
  // Snapshot da regra
  ruleSnapshot: ICommissionRule;    // a regra completa no momento
  goalSnapshot?: IGoal;             // a meta no momento do pagamento (se bônus aplicado)
  // Status
  status: 'calculated' | 'pending_approval' | 'approved' | 'paid' | 'disputed' | 'canceled';
  closedInPeriod?: string;          // "2026-01" se foi fechado em janeiro
  paidAt?: ISO8601;
  storeId: ID;
  calculatedAt: ISO8601;
}
```

### Trigger de cálculo

Quando `IOrder.paymentStatus` muda para `paid`:

- Hook `useCommissionTrigger()` detecta
- Chama `calculateCommission(order)`
- Cria `ICommission` automaticamente
- Substitui o `commissionPreview` mockado no PRD-032

### Lógica de splits

```typescript
function determineCommissionBeneficiary(order: IOrder): {
  sellerId: ID;
  isSplit: boolean;
  splitDetails?: ICommissionSplitDetails;
} {
  // Verifica se havia transferência temporária ativa em order.paidAt
  const activeTransfer = findActiveTemporaryTransfer(order.customerId, order.paidAt);

  if (activeTransfer) {
    // Política configurável: cobertor recebe 100%, ou split 50/50
    const splitPolicy = settings.commissionSplitPolicy; // 'coverage_full' | 'split_50_50'
    if (splitPolicy === "coverage_full") {
      return { sellerId: activeTransfer.toSellerId, isSplit: false };
    } else {
      // Cria 2 ICommission ou usa splitDetails
      return {
        sellerId: activeTransfer.toSellerId,
        isSplit: true,
        splitDetails: {
          coverageSellerId: activeTransfer.toSellerId,
          titularSellerId: activeTransfer.fromSellerId,
          coveragePct: 0.5,
          titularPct: 0.5,
        },
      };
    }
  }

  return { sellerId: order.sellerId, isSplit: false };
}
```

### Bônus por meta

No cálculo, verificar se vendedor atingiu meta no período:

```typescript
const sellerGoals = useSellerGoals(sellerId, period); // PRD-042
const eligibleGoal = sellerGoals.find(
  (g) =>
    g.type === rule.goalBonus.goalType &&
    g.status === "concluida" &&
    calculateGoalProgress(g).percentage >= rule.goalBonus.threshold,
);

if (eligibleGoal) {
  if (rule.goalBonus.bonusType === "fixed") {
    goalBonus = rule.goalBonus.bonusValue;
  } else {
    // percentage_points: aumenta a taxa
    effectiveRate = baseRate + rule.goalBonus.bonusValue / 100;
    baseCommission = baseValue * effectiveRate;
  }
  goalSnapshot = eligibleGoal; // imutável
}
```

### Página `/app/comissoes`

**Header**: filtros (período mensal default, vendedor para Gestor/Owner, loja Owner).

**Para Vendedor — Visão individual:**

KPIs:

- Comissão do mês (acumulado)
- Pedidos contabilizados
- Bônus por meta (se aplicável)
- Status (em apuração / fechada / paga)

Tabela: pedidos do período com comissão calculada (orderId, total, taxa aplicada, comissão, status).

**Para Gestor/Owner — Visão consolidada:**

KPIs:

- Total a pagar no período
- Por vendedor (tabela)
- Comparativo com mês anterior

Tabela "Por vendedor":

- Avatar + nome
- Pedidos contabilizados
- Comissão base
- Bônus
- Total
- Status

Click em vendedor leva a `/app/comissoes/:sellerId` (drill-down).

### Drill-down `/app/comissoes/:sellerId`

Lista completa de todas comissões do vendedor no período:

- Pedido (link PRD-032)
- Cliente
- Data pagamento
- Base, taxa, comissão
- Bônus (se aplicável)
- Status individual
- Indicador de split se houver

### Configuração `/app/configuracoes/comissoes`

Sub-rota PRD-019 (Owner only):

- Taxa default da loja
- Regras específicas por vendedor (CRUD)
- Configuração de bônus por meta (tipo, threshold, valor)
- Política de split em transferências (`coverage_full` ou `split_50_50`)

### Fechamento mensal

Botão "Fechar período" no painel consolidado (Gestor/Owner):

- Aparece após o dia 1 do mês seguinte
- Modal de confirmação resumindo total a pagar
- Ao confirmar:
  - Todas as comissões `calculated` do período viram `approved`
  - `closedInPeriod` preenchido
  - Audit log obrigatório
  - Visualmente, período fica "fechado" (não pode mais ser recalculado)
- Pagamento (`status='paid'`) é evento manual posterior (Financeiro registra)

### Disputas

Vendedor pode "Contestar comissão" no drill-down:

- Modal pede justificativa
- Status vira `disputed`
- Gestor recebe notificação para revisar
- Resolução: Gestor aprova/rejeita

### Permissões

- **Owner**: tudo, cross-store, fechar período, edita regras
- **Gestor**: loja, vê consolidado e drill-downs, fecha período, NÃO edita regras (apenas Owner)
- **Vendedor**: vê apenas suas comissões; pode contestar
- **Financeiro**: vê tudo, registra pagamento (status → paid)

### Alternativas Consideradas

| Alternativa                               | Por que descartada                                 |
| ----------------------------------------- | -------------------------------------------------- |
| Cálculo via planilha externa              | Defeat the purpose; precisa estar integrado        |
| Sem snapshots                             | Mudança retroativa de regra/meta gera disputas     |
| Split sempre 50/50 obrigatório            | Política deve ser configurável                     |
| Sem disputa formal                        | Conflitos viram conversa de corredor sem resolução |
| Cálculo no fechamento (não em tempo real) | Vendedor não vê acumulado durante o mês            |
| Edição livre de comissões                 | Audit log impossível com mutações arbitrárias      |

---

## Escopo

### Incluído

- ✅ Modelo `ICommissionRule`, `ICommission`, settings `IPlatformSettings.commissionSettings`
- ✅ Engine `calculateCommission(order, rules, goals)` em `src/features/commissions/engine/`
- ✅ Trigger automático ao mudar order.paymentStatus para 'paid'
- ✅ Substituir `commissionPreview` do PRD-032 por `ICommission` real
- ✅ Snapshots imutáveis de regra e meta no momento do cálculo
- ✅ Splits em transferências temporárias (PRD-018)
- ✅ Bônus por meta atingida (PRD-042)
- ✅ Página `/app/comissoes` com 2 visões (individual / consolidado)
- ✅ Drill-down `/app/comissoes/:sellerId`
- ✅ Configuração em `/app/configuracoes/comissoes` (Owner)
- ✅ Fechamento mensal com confirmação
- ✅ Disputas com workflow
- ✅ Histórico paginado
- ✅ Audit log obrigatório
- ✅ Permissões granulares (incluindo Financeiro)
- ✅ Geradores de mock: comissões para todos os pedidos pagos
- ✅ Hook consumível pelo PRD-040 (cockpit)

### Excluído

- ❌ Multiplicadores por categoria/produto — Fase 2 (estrutura preparada)
- ❌ Comissão sobre serviços (futura divisão SERVICE) — Fase 2
- ❌ Cálculo de impostos sobre comissão — Fase 2
- ❌ Integração com folha de pagamento — Fase 2
- ❌ Notificações por email — Fase 2
- ❌ Export PDF de holerite — Fase 2
- ❌ Comissão por equipe (equipes dormentes) — Fase 2

---

## Requisitos Funcionais

### Modelo e settings

- **RF-001:** Tipos `ICommissionRule`, `ICommission`, `ICommissionSplitDetails`.
- **RF-002:** Settings: `commissionDefaultRate`, `commissionSplitPolicy` ('coverage_full' | 'split_50_50'), `commissionGoalBonusEnabled`.
- **RF-003:** Mocks: gerar 1 ICommission para cada pedido pago (~85 ICommissions).
- **RF-004:** Gerar 1 ICommissionRule default da loja + 2-3 específicas por vendedor.

### Engine

- **RF-005:** `calculateCommission(order, context)`:
  - Identifica beneficiário (split ou direto)
  - Encontra regra aplicável (específica do vendedor > default da loja)
  - Calcula baseCommission = (subtotal - discount) \* baseRate
  - Verifica bônus por meta (consume PRD-042)
  - Cria snapshots de rule e goal
  - Retorna ICommission
- **RF-006:** Função pura — sem side effects.

### Trigger

- **RF-007:** Hook `useCommissionTrigger()`:
  - Subscreve mutations de orders
  - Quando paymentStatus muda para 'paid' (e antes não era), dispara calculateCommission
  - Cria ICommission via provider
- **RF-008:** Substituir `computeCommissionPreview` do PRD-032 — agora é ICommission real (banner do PRD-032 muda de "preview" para "comissão calculada" quando há ICommission).

### Splits

- **RF-009:** `determineCommissionBeneficiary(order, transfers)`:
  - Busca transferências temporárias ativas em order.paidAt para order.customerId
  - Se houver, aplica política (`coverage_full` ou `split_50_50`)
  - Retorna { sellerId, isSplit, splitDetails }
- **RF-010:** Se `isSplit=true`, criar 2 ICommissions (uma para cobertor, uma para titular) com `splitDetails`.

### Bônus por meta

- **RF-011:** Para cada cálculo, verificar metas concluídas do vendedor no período:
  - Se há meta com `status='concluida'` e tipo matching a `rule.goalBonus.goalType`
  - Aplicar bônus conforme tipo (fixed = R$ adicional; percentage_points = aumenta taxa)
- **RF-012:** Snapshot da meta em `goalSnapshot` para auditoria.

### Página principal

- **RF-013:** `CommissionsPage` em `src/features/commissions/pages/`, rota `/app/comissoes`.
- **RF-014:** Renderização condicional por papel:
  - **Vendedor**: visão individual (KPIs + tabela de pedidos do período)
  - **Gestor/Owner/Financeiro**: visão consolidada (KPIs + tabela por vendedor)
- **RF-015:** Filtros: período (mês default), vendedor (Gestor/Owner), loja (Owner).
- **RF-016:** Botão "Fechar período" para Gestor/Owner (visível após dia 1 do mês seguinte).

### Drill-down

- **RF-017:** `SellerCommissionsPage` em `/app/comissoes/:sellerId`.
- **RF-018:** Lista paginada de todas comissões do vendedor no período.
- **RF-019:** Indicador de split se houver.
- **RF-020:** Botão "Contestar" em cada comissão (apenas Vendedor para suas).

### Configuração

- **RF-021:** `CommissionsConfigPage` em `/app/configuracoes/comissoes` (Owner).
- **RF-022:** CRUD de regras: edição inline ou modal.
- **RF-023:** Configuração de política de split (radio).
- **RF-024:** Salvar com audit log obrigatório.

### Fechamento

- **RF-025:** Botão "Fechar período" disponível 1º do mês seguinte.
- **RF-026:** Modal com resumo: total a pagar, número de vendedores, status atual de cada.
- **RF-027:** Ao confirmar:
  - Todas comissões `calculated` viram `approved`
  - `closedInPeriod = 'YYYY-MM'`
  - Audit log obrigatório
- **RF-028:** Período fechado não pode mais ser recalculado (UI bloqueia).

### Disputas

- **RF-029:** Vendedor clica "Contestar" em comissão do drill-down.
- **RF-030:** Modal pede justificativa (textarea obrigatória).
- **RF-031:** Status vira `disputed`; Gestor notificado.
- **RF-032:** Gestor abre disputa, resolve (aprovar valor original / recalcular / outro).
- **RF-033:** Audit log de cada passo.

### Hook consumível

- **RF-034:** Exportar `useCommissionMetrics(filters)` para PRD-040 (cockpit).

### Audit log

- **RF-035:** Audit em **TODAS** operações:
  - Cálculo automático
  - Mudança de status
  - Fechamento de período
  - Disputa criada/resolvida
  - Pagamento registrado (Financeiro)
  - Edição de regra
  - Mudança de política de split

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo de comissão < 100ms por pedido.
- **RNF-002:** Memoização agressiva nas listagens.
- **RNF-003:** Snapshots imutáveis em ICommission (rule e goal).
- **RNF-004:** Audit log com integridade total (não permitir delete).
- **RNF-005:** Mobile usável.
- **RNF-006:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO pedido com subtotal R$ 1000, discount R$ 50
  E vendedor com regra baseRate=3%
QUANDO order.paymentStatus muda para 'paid'
ENTÃO ICommission é criada automaticamente
  E baseValue=950, baseRate=0.03, baseCommission=28.50
  E ruleSnapshot preserva regra completa
  E status='calculated'

DADO vendedor atingiu meta de faturamento mensal (100%)
  E regra tem goalBonus = R$ 500 fixed
QUANDO ICommission é calculada
ENTÃO goalBonus=500, totalCommission=528.50
  E goalSnapshot preserva meta no momento

DADO transferência temporária ativa: Carlos→Marina cobre cliente Aurora
  E pedido da Aurora pago durante vigência
  E política = 'coverage_full'
QUANDO calculateCommission executa
ENTÃO ICommission criada com sellerId=Marina (cobertor)
  E isSplit=false

DADO mesma situação com política = 'split_50_50'
QUANDO calcula
ENTÃO 2 ICommissions criadas: 50% Marina + 50% Carlos
  E splitDetails preenchido

DADO Owner clica "Fechar período" em janeiro
QUANDO confirma modal
ENTÃO todas comissões 'calculated' viram 'approved'
  E closedInPeriod='2026-01' em todas
  E audit log obrigatório
  E botão "Fechar" some até próximo dia 1

DADO Vendedor contesta comissão
QUANDO submete justificativa
ENTÃO status='disputed', gestor notificado
  E gestor pode resolver via aprovar valor ou recalcular

DADO regra é alterada (taxa de 3% para 4%)
QUANDO comissões já calculadas são consultadas
ENTÃO mantêm baseRate=3% (snapshot imutável)
  E apenas novas comissões usam 4%
```

---

## Fases de Implementação

| Fase | Objetivo                                                          |
| ---- | ----------------------------------------------------------------- |
| 1    | Modelo + engine de cálculo + trigger + substituir preview PRD-032 |
| 2    | Splits e bônus por meta (integrações PRD-018 e PRD-042)           |
| 3    | Páginas individual e consolidado + drill-down                     |
| 4    | Configuração + fechamento mensal                                  |
| 5    | Disputas + audit completo + integrações finais                    |

---

## Dependências

| PRD                         | Status                 |
| --------------------------- | ---------------------- |
| PRD-018 (transferências)    | 📝                     |
| PRD-032 (substitui preview) | 📝                     |
| PRD-042 (bônus por meta)    | 📝                     |
| PRD-040 (consome hook)      | 📝 (criado neste lote) |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-26   | 010-041           |
| **27** | **PRD-047 ATUAL** |
| 28+    | 048-053           |

---

## Considerações de Segurança

### Integridade financeira é CRÍTICA

- Snapshots imutáveis impedem alteração retroativa
- Audit log obrigatório em **todas** operações
- Disputas têm workflow formal (não conversas informais)
- Período fechado é IMUTÁVEL (UI bloqueia recálculo)

### Permissões estritas

- Edição de regras: Owner ONLY
- Fechamento: Gestor/Owner com confirmação
- Pagamento (paid): Financeiro
- Vendedor: apenas vê e contesta as suas

### LGPD

Comissão é dado salarial — visibilidade restrita. Vendedor vê só a sua. Gestor vê da loja. Owner cross-store. Auditoria total.

---

## Convenções

| Elemento | Convenção                                                                  |
| -------- | -------------------------------------------------------------------------- |
| Página   | `CommissionsPage`, `SellerCommissionsPage`, `CommissionsConfigPage`        |
| Engine   | `calculateCommission`, `determineCommissionBeneficiary`                    |
| Pasta    | `commissions/`                                                             |
| Git      | `feat(commissions): add commission calculation with goal bonus and splits` |

---

## Notas para o Agente Desenvolvedor

### Princípios

- **Snapshots são sagrados**: rule e goal preservados no momento do cálculo
- **Audit log em TUDO** (não é opcional)
- **Período fechado é imutável** — UI bloqueia recálculo
- **Splits respeitam política configurada** — não improvisar
- **Bônus consome PRD-042** — não recalcula metas aqui
- **Pagamento é evento manual** (Financeiro registra)

### Não Fazer

- Multiplicadores por categoria (Fase 2)
- Cálculo de impostos (Fase 2)
- Permitir Vendedor editar regras
- Mutar comissões já fechadas
- Implementar folha de pagamento real

---

## Status

| Campo  | Valor                                         |
| ------ | --------------------------------------------- |
| Status | ✅ IMPLEMENTADO (v0.32.0 Payout · 2026-05-27) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                          |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 25/05/2026 | v1     | Criação inicial — comissões com regras configuráveis, splits, bônus por meta, fechamento auditável                                                                 |
| 27/05/2026 | v1.1   | Implementação completa em v0.32.0 Payout — engine puro, trigger idempotente, páginas, config admin, fechamento mensal, disputas com workflow e widget para PRD-040 |

---

**AILA - Sistemas Inteligentes**
