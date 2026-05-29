# PRD-054: Despesas (Lançamentos)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Construir o sistema de gestão de despesas operacionais — CRUD de lançamentos, categorias, recorrências, regime de competência (alimenta DRE) e pagamento (alimenta Fluxo de Caixa) — substituindo os valores fixos mockados do PRD-048 |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 4 — Gestão B (Onda 2) |
| **PRDs Relacionados** | PRD-019 (Configurações), PRD-032 (Pedido), PRD-047 (Comissões — despesa derivada), PRD-048 (DRE — consome), PRD-055 (Fluxo de Caixa — consome) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/expenses/`; rota `/app/gestao/despesas` |
| **Origem** | Gap identificado no double-check de 28/05/2026 — slot originalmente planejado como PRD-050 no INDEX v1.0, deslocado durante redação do Bloco 4b; recuperado como PRD-054 |

### Critérios de Complexidade

> **Justificativa de Alta:** CRUD com 9 categorias que mapeiam para as linhas do DRE, sistema de recorrências (mensal/trimestral/anual com geração automática de lançamentos futuros), dupla temporalidade (competência para DRE + pagamento para Fluxo de Caixa), status lifecycle (pendente/pago/atrasado/cancelado) com transição automática de atraso, drill-down a partir do DRE, filtros combinados, e **substituição crítica** dos valores fixos do PRD-048 por agregação real (delta que afeta cálculo do resultado da empresa).

---

## Contexto do Problema

O PRD-048 (DRE) calcula o resultado da empresa, mas a linha "Despesas Operacionais" usa **3 valores fixos mockados** em `financialSettings.fixedExpenses` (folha, aluguel+infra, outros). Isso é placeholder — não reflete a realidade. Três problemas concretos:

**Owner não lança despesas reais.** Conta de luz de R$ 2.300 em janeiro, R$ 1.800 em fevereiro — variam mês a mês. Valor fixo no settings não captura isso. **DRE mente sobre o resultado.** Se despesas reais foram R$ 95k mas o settings diz R$ 80k, o resultado líquido está errado em R$ 15k. **Fluxo de Caixa (PRD-055) não tem o que mostrar.** Sem lançamentos de despesa com data de pagamento, não há saídas para compor o caixa.

Este PRD entrega: gestão real de despesas com lançamentos individuais, categorização, recorrências, e as duas datas que alimentam DRE (competência) e Caixa (pagamento). É a fundação financeira que faltava — confirmada ausente no double-check de 28/05/2026.

---

## Conceito da Solução

### Dupla temporalidade (decisão central)

Cada despesa tem **duas datas** que servem a dois regimes contábeis:

| Data | Regime | Alimenta | Significado |
|------|--------|----------|-------------|
| `competenceDate` | Competência | DRE (PRD-048) | Mês a que a despesa se refere (ex: luz de janeiro) |
| `paymentDate` | Caixa | Fluxo de Caixa (PRD-055) | Quando o dinheiro saiu de fato |

Exemplo: conta de luz de janeiro (competência) paga em 10/fevereiro (pagamento). No DRE de janeiro ela aparece; no Caixa de fevereiro ela sai. Essa distinção é fundamento contábil — sem ela, DRE e Caixa ficam errados.

### Categorias que mapeiam para o DRE

9 categorias que se agregam nas 3 linhas de despesa do DRE (PRD-048):

| Categoria | Linha no DRE |
|-----------|--------------|
| `folha` | payroll |
| `aluguel` | rentInfra |
| `infraestrutura` (água, luz, internet, telefone) | rentInfra |
| `marketing` | otherExpenses |
| `impostos` (não sobre venda/lucro — ex: IPTU, taxas) | otherExpenses |
| `fornecedores` (serviços terceirizados não-CMV) | otherExpenses |
| `logistica` (frete próprio, combustível entregas) | otherExpenses |
| `manutencao` (equipamentos, veículos próprios) | otherExpenses |
| `outros` | otherExpenses |

> **Nota:** Comissões (PRD-047) continuam sendo calculadas, não lançadas como `IExpense`. No DRE, a linha de comissões vem do PRD-047; as demais despesas operacionais vêm deste PRD.

### Modelo

```typescript
IExpense {
  id: ID;
  description: string;             // "Conta de luz - janeiro/2026"
  category: ExpenseCategory;
  amount: number;                  // R$
  // Dupla temporalidade
  competenceDate: ISO8601;         // mês de competência (DRE)
  paymentDate?: ISO8601;           // quando foi paga (Caixa); null se pendente
  // Status
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  dueDate?: ISO8601;               // vencimento (para detectar atraso)
  // Recorrência
  isRecurring: boolean;
  recurrenceParentId?: ID;         // se gerada por uma recorrência-mãe
  recurrenceConfig?: IExpenseRecurrence;
  // Detalhes
  supplier?: string;               // fornecedor/credor
  paymentMethod?: ExpensePaymentMethod;
  attachmentUrl?: string;           // comprovante (placeholder Fase 2 — Supabase Storage)
  notes?: string;
  // Multi-loja + auditoria
  storeId: ID;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

type ExpenseCategory =
  | 'folha' | 'aluguel' | 'infraestrutura' | 'marketing'
  | 'impostos' | 'fornecedores' | 'logistica' | 'manutencao' | 'outros';

type ExpensePaymentMethod =
  | 'pix' | 'boleto' | 'transferencia' | 'dinheiro' | 'cartao' | 'debito_automatico';

IExpenseRecurrence {
  frequency: 'mensal' | 'trimestral' | 'anual';
  dayOfMonth: number;              // dia do vencimento (1-31)
  endDate?: ISO8601;               // até quando recorre; null = indefinido
}
```

### Página `/app/gestao/despesas`

Substitui o placeholder atual (que apontava incorretamente para "PRD-050"). Header com filtros + KPIs + tabela.

**KPIs no topo:**
- Total de despesas no período (por competência)
- Pagas
- Pendentes
- Atrasadas (vermelho)

**Filtros:**
- Período (competência — mês/trimestre/ano/personalizado)
- Categoria (multi-select)
- Status (multi-select)
- Fornecedor (autocomplete)
- Forma de pagamento
- Loja (Owner)

**Tabela** (paginada, 50/página):
- Descrição
- Categoria (badge)
- Valor
- Competência (mês)
- Vencimento
- Pagamento (data ou "—" se pendente)
- Status (badge colorido)
- Recorrente (ícone se sim)
- Ações (editar, marcar pago, duplicar, cancelar)

### Criação/edição

Modal ou página com formulário:
- Descrição, categoria, valor (obrigatórios)
- Competência (date picker — default mês atual)
- Vencimento (date picker)
- Fornecedor (opcional)
- Forma de pagamento (opcional)
- Toggle "Despesa recorrente" → expande config de recorrência (frequência, dia do mês, data fim)
- Comprovante (upload placeholder Fase 2)
- Notas

Ao salvar despesa recorrente, gera os lançamentos futuros conforme config (até `endDate` ou 12 meses à frente se indefinido).

### Status lifecycle

```
pendente → pago        (botão "Marcar como pago" → pede paymentDate)
pendente → atrasado    (automático: dueDate < hoje e ainda pendente)
atrasado → pago        (regulariza)
qualquer → cancelado   (com confirmação)
```

Hook `useExpenseStatusTimer()` roda diariamente marcando `atrasado` despesas vencidas não pagas.

### Recorrências

Despesa recorrente cria uma "mãe" + N "filhas" (`recurrenceParentId`):
- Mensal: 12 lançamentos à frente
- Trimestral: 4
- Anual: 1-2
- Editar a mãe oferece: "Aplicar só nesta / nesta e futuras / em todas"
- Cancelar a mãe oferece cancelar série futura

### Drill-down do DRE (integração reversa)

Ao clicar em "Despesas Operacionais" no DRE (PRD-048), navega para `/app/gestao/despesas` pré-filtrado pelo período do DRE — o Owner vê exatamente quais lançamentos compõem o número.

### Configuração

A sub-rota `/app/configuracoes/financeiro` (criada no PRD-048) ganha:
- Gestão de categorias (ativar/desativar, sem CRUD livre no MVP — 9 fixas)
- Banner: "Despesas agora são lançadas individualmente em Gestão > Despesas. Os valores fixos anteriores foram descontinuados."

### Permissões

| Papel | Listar | Criar/Editar | Marcar pago | Cancelar |
|-------|--------|--------------|-------------|----------|
| **Owner** | ✅ | ✅ | ✅ | ✅ |
| **Financeiro** | ✅ | ✅ | ✅ | ✅ |
| **Gestor** | ✅ (read-only) | ❌ | ❌ | ❌ |
| **Vendedor** | ❌ BLOQUEADO | ❌ | ❌ | ❌ |

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|---------------------|
| Manter valores fixos do PRD-048 | Placeholder; DRE mente sobre resultado real |
| Data única (sem competência vs pagamento) | DRE e Caixa precisam de regimes distintos — fundamento contábil |
| Categorias livres (texto) | Vira bagunça; quebra mapeamento para o DRE |
| Comissões como IExpense | Comissões são calculadas (PRD-047); duplicaria fonte |
| Sem recorrência | Folha/aluguel/luz são recorrentes — lançar manual todo mês é fricção |
| Anexo real de comprovante no MVP | Supabase Storage é Fase 2; placeholder coerente |
| Despesa muta estoque/CMV | CMV vem do catálogo (PRD-030/048); despesa é operacional, não mercadoria |

**Decisão consolidada:** **CRUD com 9 categorias mapeadas ao DRE, dupla temporalidade (competência/pagamento), recorrências, status com atraso automático, drill-down do DRE, substituindo os valores fixos do PRD-048.**

---

## Escopo

### Incluído

- ✅ Modelo `IExpense`, `IExpenseRecurrence`, `ExpenseCategory`, `ExpensePaymentMethod` em `src/shared/types/expenses.ts`
- ✅ Geradores de mock: ~120 despesas (12 meses de histórico, mix de categorias, recorrentes + avulsas, status variados)
- ✅ Página `/app/gestao/despesas` substituindo o placeholder
- ✅ KPIs, filtros, tabela paginada com URL sync
- ✅ Criação/edição com config de recorrência
- ✅ Geração automática de lançamentos recorrentes
- ✅ Status lifecycle com atraso automático via timer
- ✅ Marcar como pago (com paymentDate)
- ✅ Duplicar despesa
- ✅ Cancelamento com confirmação
- ✅ Drill-down reverso do DRE (PRD-048)
- ✅ Hook `useExpenses(filters)` exportado (consumido por PRD-048 e PRD-055)
- ✅ Hook `useExpensesByCompetence(period)` para o DRE
- ✅ Hook `useExpensesByPayment(period)` para o Fluxo de Caixa
- ✅ **DELTA PRD-048**: substituir `fixedExpenses` por agregação real de despesas
- ✅ Permissões (Vendedor bloqueado; Gestor read-only)
- ✅ Audit log em todas as mutations
- ✅ Comprovante: upload placeholder (Fase 2)

### Excluído

- ❌ Upload real de comprovante — Fase 2 (Supabase Storage)
- ❌ Conciliação bancária automática — Fase 2
- ❌ Importação de OFX/extrato bancário — Fase 2
- ❌ Aprovação de despesa (workflow) — Fase 2
- ❌ Centro de custo — Fase 2
- ❌ Rateio entre lojas — Fase 2
- ❌ Categorias customizáveis pelo Owner — Fase 2 (9 fixas no MVP)
- ❌ Integração com contas a pagar de ERP — Fase 2
- ❌ Previsão de despesa via IA — Fase 2
- ❌ Despesas em moeda estrangeira — fora do escopo

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Tipos `IExpense`, `IExpenseRecurrence`, `ExpenseCategory`, `ExpensePaymentMethod`.
- **RF-002:** Geradores de mock: ~120 despesas em 12 meses:
  - Folha mensal recorrente (~R$ 35k/mês)
  - Aluguel mensal recorrente (~R$ 8k/mês)
  - Infraestrutura: luz/água/internet variáveis mensais
  - Marketing, fornecedores, logística, manutenção: avulsas variadas
  - Mix de status: ~70% pago, ~15% pendente, ~10% atrasado, ~5% cancelado
- **RF-003:** Recorrentes geram série com `recurrenceParentId` ligando filhas à mãe.

### Página

- **RF-004:** `ExpensesPage` em `src/features/expenses/pages/`, rota `/app/gestao/despesas`.
- **RF-005:** Substitui o `PlaceholderPage` atual.
- **RF-006:** 4 KPIs no topo (total competência, pago, pendente, atrasado).
- **RF-007:** 6 filtros (período competência, categoria, status, fornecedor, forma pagamento, loja).
- **RF-008:** Tabela paginada com 9 colunas + ações; URL sync.

### Criação/edição

- **RF-009:** Formulário (modal ou página — decisão do agente; recomendação: página `/app/gestao/despesas/nova` pela recorrência).
- **RF-010:** Campos obrigatórios: descrição, categoria, valor, competência.
- **RF-011:** Toggle "Recorrente" expande: frequência, dia do mês, data fim (opcional).
- **RF-012:** Validações: valor > 0, competência válida, dueDate ≥ competência se informada.
- **RF-013:** Comprovante: botão upload desabilitado com tooltip "Fase 2".

### Recorrência

- **RF-014:** Ao salvar recorrente, gerar lançamentos:
  - Mensal: 12 à frente (ou até `endDate`)
  - Trimestral: 4
  - Anual: 2
- **RF-015:** Editar mãe oferece escopo: "só esta / esta e futuras / todas".
- **RF-016:** Cancelar mãe oferece cancelar série futura (filhas não pagas).

### Status lifecycle

- **RF-017:** `useExpenseStatusTimer()` roda diariamente: despesas com `dueDate < hoje` e status `pendente` → `atrasado`.
- **RF-018:** Botão "Marcar como pago" abre modal pedindo `paymentDate` (default hoje) + forma de pagamento.
- **RF-019:** Cancelamento exige confirmação + opcional motivo em `notes`.

### Hooks consumíveis (integração)

- **RF-020:** `useExpenses(filters)`: lista geral filtrada.
- **RF-021:** `useExpensesByCompetence(period)`: agrega por categoria no período de **competência** — consumido pelo DRE (PRD-048).
- **RF-022:** `useExpensesByPayment(period)`: lista despesas com `paymentDate` no período — consumido pelo Fluxo de Caixa (PRD-055).
- **RF-023:** Helper `aggregateExpensesForDRE(period)`: retorna `{ payroll, rentInfra, otherExpenses }` mapeando as 9 categorias nas 3 linhas do DRE.

### DELTA — Integração com PRD-048 (DRE)

- **RF-024:** **Substituir** o uso de `financialSettings.fixedExpenses` no cálculo do DRE pela agregação real via `aggregateExpensesForDRE(period)`.
- **RF-025:** Linhas do DRE (`payroll`, `rentInfra`, `otherExpenses`) passam a vir de despesas com `competenceDate` no período.
- **RF-026:** `commissions` no DRE continua vindo do PRD-047 (inalterado).
- **RF-027:** Drill-down: clicar em "Despesas Operacionais" no DRE navega para `/app/gestao/despesas?competencia=YYYY-MM`.
- **RF-028:** Settings `fixedExpenses` marcado como deprecated (manter para retrocompat de leitura, mas DRE não usa mais). Banner na config financeira.

### Permissões

- **RF-029:** `<GuardedRoute>` bloqueia Vendedor totalmente.
- **RF-030:** Gestor: read-only (tabela visível, ações desabilitadas).
- **RF-031:** Owner/Financeiro: CRUD completo.

### Audit log

- **RF-032:** Audit em: criação (`expense_create`), edição (`expense_update`), mudança de status (`expense_status_change`), marcar pago (`expense_mark_paid`), cancelamento (`expense_cancel`), geração de recorrência (`expense_recurrence_generate`).

---

## Requisitos Não-Funcionais

- **RNF-001:** Listagem com 120 despesas + filtros < 350ms.
- **RNF-002:** `aggregateExpensesForDRE` < 100ms.
- **RNF-003:** Geração de série recorrente (12 lançamentos) < 200ms.
- **RNF-004:** Memorização agressiva nos agregadores.
- **RNF-005:** Tipagem rigorosa; zero `any`.
- **RNF-006:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO Owner acessa /app/gestao/despesas
QUANDO a página carrega
ENTÃO vejo KPIs (total, pago, pendente, atrasado)
  E tabela paginada de despesas
  E NÃO vejo mais o placeholder "será implementada no PRD-050"

DADO lanço despesa "Luz janeiro" categoria=infraestrutura, competência=jan/2026, vencimento=10/fev
QUANDO salvo
ENTÃO despesa criada com status='pendente'
  E aparece na listagem
  E audit log registra

DADO crio despesa recorrente mensal "Aluguel" R$ 8.000 dia 5
QUANDO salvo
ENTÃO 12 lançamentos são gerados (um por mês)
  E todos com recurrenceParentId ligando à mãe

DADO despesa com vencimento ontem ainda pendente
QUANDO useExpenseStatusTimer roda
ENTÃO status muda para 'atrasado'
  E aparece em vermelho nos KPIs

DADO marco despesa como paga com paymentDate=hoje
QUANDO confirmo
ENTÃO status='pago', paymentDate preenchido
  E despesa passa a compor o Fluxo de Caixa (PRD-055) no período do pagamento

DADO Vendedor tenta acessar /app/gestao/despesas
QUANDO GuardedRoute valida
ENTÃO bloqueado (redirect)

DADO Gestor acessa
QUANDO observa
ENTÃO vê tabela read-only
  E botões de ação desabilitados
```

### Critérios do DELTA (DRE)

```gherkin
DADO despesas reais de jan/2026 somam R$ 95.000 (por competência)
  E o settings antigo dizia fixedExpenses = R$ 80.000
QUANDO abro o DRE de jan/2026
ENTÃO "Despesas Operacionais" mostra R$ 95.000 (real, não o fixo)
  E o resultado líquido reflete o valor correto

DADO estou no DRE e clico em "Despesas Operacionais"
QUANDO ação processa
ENTÃO navego para /app/gestao/despesas?competencia=2026-01
  E vejo os lançamentos que compõem aquele número

DADO competência sem despesas lançadas
QUANDO DRE calcula
ENTÃO "Despesas Operacionais" = comissões (PRD-047) apenas
  E banner sugere "Lance despesas para um DRE preciso"
```

---

## Fases de Implementação

| Fase | Objetivo |
|------|----------|
| 1 | Modelo + mocks + hooks de agregação |
| 2 | Página com KPIs, filtros, tabela |
| 3 | Criação/edição + recorrências |
| 4 | Status lifecycle + atraso automático + marcar pago |
| 5 | DELTA DRE (substituir fixedExpenses) + drill-down + permissões + polish |

### Detalhamento

**Fase 1:** tipos, ~120 mocks, `useExpenses`, `useExpensesByCompetence`, `useExpensesByPayment`, `aggregateExpensesForDRE`.
**Fase 2:** `ExpensesPage`, KPIs, 6 filtros, tabela, URL sync.
**Fase 3:** formulário, config de recorrência, geração de série, editar série com escopo.
**Fase 4:** timer de atraso, marcar pago, cancelar, duplicar.
**Fase 5:** **substituir `fixedExpenses` no PRD-048 por `aggregateExpensesForDRE`**, drill-down reverso, permissões, mobile, `docs/expenses.md`.

---

## Dependências

| PRD | Status | Relação |
|-----|--------|---------|
| PRD-019 (Configurações) | ✅ DONE | Sub-rota financeira ganha gestão de categorias |
| PRD-032 (Pedido) | ✅ DONE | — (Caixa cruza, não Despesas) |
| PRD-047 (Comissões) | 📝 | Comissão é despesa derivada no DRE (não IExpense) |
| PRD-048 (DRE) | ✅ DONE | **DELTA**: consome agregação real |
| PRD-055 (Fluxo de Caixa) | ⏳ | Consome despesas por pagamento |

---

## Cadeia de PRDs

| Ordem | PRD | Status |
|-------|-----|--------|
| ... | Bloco 4b (040-053) | ✅ DONE |
| **54** | **PRD-054 ATUAL** | 🔄 |
| 55 | PRD-055 (Fluxo de Caixa) | ⏳ |

> Ambos recuperam temas planejados no INDEX v1.0 (slots 050/051) deslocados na redação original.

---

## Considerações de Segurança

- Dados financeiros sensíveis — Vendedor BLOQUEADO; Gestor read-only.
- Mudança de despesa afeta DRE (resultado da empresa) — audit log obrigatório.
- Comprovantes (Fase 2) conterão dados sensíveis — RLS + Storage policies no Supabase.
- `fixedExpenses` deprecated mantém retrocompat de leitura, mas não influencia cálculo.

---

## Convenções de Código

| Elemento | Convenção |
|----------|-----------|
| Página | `ExpensesPage`, `NewExpensePage` |
| Componentes | `<ExpenseForm>`, `<RecurrenceConfig>`, `<ExpenseStatusBadge>` |
| Hooks | `useExpenses`, `useExpensesByCompetence`, `useExpensesByPayment` |
| Engine | `aggregateExpensesForDRE` |
| Pasta | `expenses/` |
| Git | `feat(expenses): add expense management replacing DRE fixed values` |

---

## Notas para o Agente Desenvolvedor

### Princípios

- **Dupla temporalidade é central**: competência (DRE) ≠ pagamento (Caixa). Não colapsar.
- **9 categorias mapeiam para 3 linhas do DRE** — manter `aggregateExpensesForDRE` como fonte única do mapeamento.
- **Comissões NÃO são IExpense** — vêm do PRD-047; não duplicar.
- **DELTA do PRD-048 é obrigatório**: substituir `fixedExpenses` por agregação real ANTES de marcar este PRD como concluído.
- **Recorrência gera série real** (não calcula on-the-fly) — facilita edição individual.
- **Vendedor bloqueado** — dado financeiro estratégico.

### O que NÃO Fazer

- Upload real de comprovante (Fase 2)
- Conciliação bancária / OFX (Fase 2)
- Categorias livres (9 fixas no MVP)
- Comissões como despesa lançada
- Deixar o DRE usando `fixedExpenses` após este PRD
- Colapsar competência e pagamento numa data só

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 28/05/2026 | v1 | Criação inicial — recupera gap de Despesas identificado no double-check; substitui valores fixos do PRD-048 por lançamentos reais com dupla temporalidade |

---

**AILA - Sistemas Inteligentes**
