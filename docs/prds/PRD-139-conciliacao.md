# PRD-139: Conciliação Financeira

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/finance-reconciliation/` + Edge `payment-settlement-sync`_ |
| **Objetivo** | Fechar o caixa: transformar os sinais que a onda inteira já produz (`payment_amount_mismatch` do 134, `refund_amount_mismatch` do 138, órfãs, pago-manual-com-charge-viva, encargos de boleto vencido) em uma **fila conciliável** com resolução rastreada. Nova tabela `crm.payment_reconciliation_items` alimentada nos pontos de detecção (DELTA leve em 134/138 via função compartilhada), ingestão diária do **extrato do gateway** (`crm.payment_settlements` — bruto/taxa/líquido por transação, capability `supportsSettlementApi`), tela `/app/financeiro/conciliacao` (fila de divergências, resolução com nota obrigatória, visão de taxas reais vs estimadas) e **export CSV do período para o contador** |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P1 |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-134 (**DELTA**: mismatches viram itens); PRD-138 (**DELTA**: idem + `payment_refunds` consumida); PRD-132/132B (capability + `getSettlements`); PRD-135 (encargos de overdue); PRD-137 (grupos de carnê na visão); PRD-110 (alerta de acúmulo); PRD-048 F1 (DRE — consumidor futuro das taxas reais); PRD-054/055 (Despesas/Fluxo de Caixa — taxas alimentam) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Itens criados via `registerReconciliationItem()` em `_shared/payment-cascade.ts`; tela em feature própria |

### Critérios de Complexidade

> **Justificativa de Alta:** conciliação é onde a contabilidade encontra a engenharia — e os dois falam línguas diferentes. O sistema conhece o **bruto** (`paid_amount`); o lojista recebe o **líquido** (bruto − taxa do gateway), e a taxa só existe no extrato do gateway, não no webhook. Sem ingestão de settlement, o "conciliado" do sistema diverge do extrato bancário todo santo dia e o contador volta para a planilha. Soma-se: divergências têm naturezas distintas (taxa legítima ≠ valor adulterado ≠ órfã de sandbox), cada uma com resolução própria; e o match settlement↔charge é por `provider_charge_id` com janelas de liquidação diferentes por método (PIX D+0/D+1, cartão D+30 ou antecipado, boleto D+1 da compensação).

---

## Contexto do Problema

Ao final da Onda 7, o sistema sabe **quem pagou o quê**. O que ele ainda não responde — e o financeiro da Turbo Diesel pergunta todo dia 5:

1. *"O extrato do gateway bate com os pedidos pagos?"* — hoje: planilha manual cruzando dois mundos.
2. *"Quanto pagamos de taxa este mês, por método?"* — hoje: ninguém sabe sem abrir o painel do gateway.
3. *"Esses R$ 0,43 de diferença no pedido 042 são taxa, encargo de atraso ou problema?"* — os audits `payment_amount_mismatch` existem (134/138), mas audit é trilha, não fila de trabalho: ninguém resolve, nada acumula visivelmente.
4. *"Cadê o relatório pro contador?"* — export consolidado do período não existe.

A onda produziu os sinais; este PRD os transforma em processo.

---

## Conceito da Solução

### Duas Tabelas Novas

```sql
-- Fila de trabalho: cada divergência detectada vira um item resolvível
CREATE TABLE crm.payment_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES crm.stores(id),
  charge_id uuid REFERENCES crm.payment_charges(id),
  order_id uuid REFERENCES crm.orders(id),

  item_type text NOT NULL CHECK (item_type IN (
    'amount_mismatch',        -- pago ≠ cobrado (PRD-134 RF-070)
    'refund_mismatch',        -- estornado ≠ esperado (PRD-138 RF-061)
    'orphan_webhook',         -- evento sem charge local (PRD-134 RF-040)
    'manual_paid_with_charge',-- pago manual com charge viva (PRD-134 RF-061)
    'fee_mismatch',           -- taxa real ≠ estimada além do threshold (settlement)
    'settlement_unmatched'    -- linha do extrato sem charge correspondente
  )),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),

  expected_amount numeric(12,2),
  actual_amount numeric(12,2),
  delta numeric(12,2),

  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolution_note text,           -- obrigatória ao resolver/ignorar
  resolved_by uuid REFERENCES crm.sellers(id),
  resolved_at timestamptz,

  context jsonb NOT NULL DEFAULT '{}',   -- payload do detector (eventId, raw refs)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm.payment_reconciliation_items (store_id, status, created_at DESC);

-- Extrato do gateway: a verdade sobre taxas e líquido
CREATE TABLE crm.payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES crm.stores(id),
  provider text NOT NULL CHECK (provider IN ('asaas','mercado_pago','mock')),
  provider_charge_id text NOT NULL,
  charge_id uuid REFERENCES crm.payment_charges(id),   -- match (NULL até casar)

  gross_amount numeric(12,2) NOT NULL,
  fee_amount numeric(12,2) NOT NULL,
  net_amount numeric(12,2) NOT NULL,
  settled_at date NOT NULL,
  raw_entry jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_charge_id, settled_at, gross_amount)  -- idempotência da ingestão
);
CREATE INDEX ON crm.payment_settlements (store_id, settled_at DESC);
-- RLS em ambas (estende PRD-103): Owner/Manager da store; mutações service_role
```

### Detecção → Fila (DELTA leve em 134/138)

Função compartilhada em `_shared/payment-cascade.ts`:

```typescript
export async function registerReconciliationItem(item: ReconciliationItemInput): Promise<void>
```

Os pontos que hoje fazem **apenas** audit passam a também criar o item: PRD-134 RF-070 (`amount_mismatch` — severity por threshold: `|delta| ≤ R$1` info, acima warning), RF-040 (`orphan_webhook`), RF-061 (`manual_paid_with_charge` info), PRD-138 RF-061 (`refund_mismatch`). Audit permanece (trilha); o item é a fila. Como 134/138 ainda não foram implementados, o DELTA custa uma linha em cada ponto — declarado nos dois PRDs via nota nos `_DONE`.

### Ingestão de Settlement

Extensão da interface (DELTA PRD-132, capability nova):

```typescript
// IPaymentProvider — método opcional gated por capability
getSettlements?(date: string): Promise<SettlementEntry[]>
// SettlementEntry { providerChargeId, grossAmount, feeAmount, netAmount, settledAt, raw }
capabilities.supportsSettlementApi: boolean   // Asaas: true (/financialTransactions) · MP: true (releases) · Mock: true
```

Cron diário `payment-settlement-sync` (pg_cron `0 6 * * *`):

1. Para cada store com `payment_config`: `getSettlements(ontem)` no(s) provider(s) com capability
2. INSERT idempotente (UNIQUE) em `payment_settlements`
3. **Match** por `(provider, provider_charge_id)` → preenche `charge_id`
4. Sem match → item `settlement_unmatched` (warning)
5. Com match: `fee_amount` real vs estimada (`payment_config.feeEstimates` por método, opcional) — desvio > threshold → item `fee_mismatch` (info; taxas mudam por negociação)
6. Audit agregado `settlement_sync { provider, entries, matched, unmatched }`

Provider sem capability ou API fora: dia fica sem extrato — banner na tela ("Extrato de <data> pendente") + retry no próximo cron com janela retroativa de 7 dias (busca dias faltantes).

### Tela `/app/financeiro/conciliacao`

```
┌──────────────────────────────────────────────────────────────────┐
│ Conciliação Financeira            [Período ▾] [Store ▾] [Export ⬇]│
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ │
│ │ Recebido    │ │ Taxas pagas │ │ Líquido     │ │ Divergências │ │
│ │ R$ 84.320   │ │ R$ 1.512    │ │ R$ 82.808   │ │ 7 abertas    │ │
│ │ (bruto)     │ │ (1,79%)     │ │             │ │ R$ 312,40    │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └──────────────┘ │
│                                                                   │
│ [ Divergências ] [ Extrato ] [ Resolvidas ]                       │
│ ┌───────────────────────────────────────────────────────────────┐│
│ │ ⚠ amount_mismatch · Pedido #042 · esperado 430,00 · pago      ││
│ │   429,57 · Δ −0,43 · 09/06        [Resolver] [Ignorar]        ││
│ │ ⚠ settlement_unmatched · asaas pay_88x · R$ 150,00 · 08/06    ││
│ │ ℹ manual_paid_with_charge · Pedido #038 · charge PIX viva     ││
│ └───────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**Resolver/Ignorar:** modal com nota obrigatória (≥10 chars) → `resolved_by/at` + audit. Itens `critical` exigem nota ≥30. **Tab Extrato:** linhas de settlement com match (link para a charge/pedido) ou sem (CTA criar item já existe). **Export:** CSV do período — charges pagas, refunds, settlements, divergências e status — separadores e encoding pt-BR (`;` + UTF-8 BOM, paridade com a lição do PRD-122).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Job varrendo `audit_logs` para gerar itens | Audit é trilha imutável de propósito geral; INSERT direto no ponto de detecção é síncrono, tipado e barato (1 linha de DELTA) |
| Settlement por upload CSV manual | Ambos os gateways têm API; CSV vira fallback documentado se a API falhar repetidamente — não o caminho primário |
| Conciliação bancária (extrato do banco) | Camada além do MVP: gateway→banco é transferência agregada; gateway↔sistema é onde mora 95% do valor. Banco fica para o GALLO ERP (Fase 4/5) |
| Auto-resolver mismatches ≤ R$ 1 | Mesmo info precisa de olho humano uma vez (taxa? arredondamento?); filtro por severity + resolução em lote dá a mesma agilidade sem cegar |
| Tela dentro do PRD-055 (Fluxo de Caixa) | Fluxo de caixa é projeção; conciliação é fila operacional de exceções — papéis distintos; integração via consumo das taxas reais |

---

## Escopo

### Incluído

- ✅ Migrations: `payment_reconciliation_items` + `payment_settlements` + RLS + índices
- ✅ `registerReconciliationItem()` no módulo compartilhado + **DELTAs declarados** nos pontos de detecção de 134/138 (4 pontos, 1 linha cada)
- ✅ DELTA PRD-132: método opcional `getSettlements` + capability `supportsSettlementApi`; implementações Asaas (`/financialTransactions`), MP (releases), Mock (sintético determinístico)
- ✅ Cron `payment-settlement-sync` (diário 06:00) com janela retroativa de 7 dias, ingestão idempotente, match, geração de `fee_mismatch`/`settlement_unmatched`
- ✅ `payment_config.feeEstimates` opcional por método (para o delta de taxa) + threshold de `fee_mismatch`
- ✅ Tela `/app/financeiro/conciliacao` (Owner/Manager): cards do período, 3 tabs, filtros, resolução/ignorar com nota obrigatória, resolução em lote (selecionar N itens info → uma nota)
- ✅ Export CSV pt-BR do período (contador): pagas + refunds + settlements + divergências
- ✅ Badge no menu financeiro com contagem de itens `open` (warning+critical)
- ✅ Alerta (PRD-110): itens `critical` abertos > 48h OU acúmulo > 20 abertos → email Owner
- ✅ Audit: `reconciliation_item_resolved/ignored`, `settlement_sync`
- ✅ Realtime nos itens (badge e fila atualizam ao vivo)
- ✅ Testes: registerReconciliationItem nos 4 pontos (fixtures dos PRDs de origem), ingestão idempotente, match/unmatched, fee_mismatch por threshold, resolução com nota, export com encoding, E2E mock (mismatch do 134 → aparece na fila → resolve)
- ✅ Documentação `docs/dev/payment-reconciliation.md`

### Excluído

- ❌ Conciliação bancária (extrato do banco) — Fase 4/5 (GALLO ERP)
- ❌ Antecipação de recebíveis e seu efeito em taxas — operação do lojista no gateway
- ❌ Lançamentos contábeis automáticos (integração contábil futura)
- ❌ DRE/Fluxo de Caixa (PRDs 048/055 — consomem as taxas daqui, não o contrário)
- ❌ Auto-resolução de qualquer item
- ❌ Upload manual de extrato CSV (fallback documentado, não construído no MVP)

---

## Requisitos Funcionais

### Fila de Itens

- **RF-001:** `registerReconciliationItem()` valida tipo/severity, deduplica por `(charge_id, item_type, delta)` em janela de 24h (mesmo mismatch re-entregue não duplica item aberto), INSERT + Realtime.
- **RF-002:** DELTAs nos pontos de origem (134 RF-070/RF-040/RF-061; 138 RF-061) — audit preservado, item adicionado; severity: `|delta| ≤ 1.00` → info; `≤ 50.00` → warning; acima ou orphan → warning; adulteração suspeita (delta positivo grande) → critical.
- **RF-003:** Item carrega `context` com refs cruas (eventId, providerChargeId) para investigação.

### Settlement

- **RF-010:** `getSettlements(date)` por provider: Asaas pagina `/financialTransactions?startDate&endDate` filtrando créditos de pagamento; MP consome releases do dia; normalização para `SettlementEntry`.
- **RF-011:** Cron diário: por store × provider com capability; janela retroativa — busca dias dos últimos 7 sem nenhuma entry (cobre falha de ontem).
- **RF-012:** Ingestão idempotente via UNIQUE; re-execução não duplica.
- **RF-013:** Match por `(provider, provider_charge_id)`; preenche `charge_id`; charge inexistente → item `settlement_unmatched` com a entry no context.
- **RF-014:** `fee_mismatch`: se `feeEstimates[method]` configurada e `|fee_real − fee_estimada| > threshold (default R$ 0,50 ou 0,3pp)` → item info.
- **RF-015:** Falha total do provider no cron: audit `settlement_sync_failed` + banner na tela; 3 dias consecutivos → alerta Owner.

### Tela

- **RF-020:** Rota `/app/financeiro/conciliacao` (Owner/Manager — guarda + RLS).
- **RF-021:** Cards do período (filtro default: mês corrente): bruto recebido (charges paid), taxas (settlements), líquido, divergências abertas (qtd + soma |delta|).
- **RF-022:** Tab Divergências: fila `open` ordenada por severity+data; linha mostra tipo, pedido/charge linkados, esperado/real/Δ, idade; ações Resolver/Ignorar.
- **RF-023:** Resolver/Ignorar: nota obrigatória (≥10; critical ≥30); lote permitido para seleção homogênea de info.
- **RF-024:** Tab Extrato: settlements do período, match linkado, unmatched destacado.
- **RF-025:** Tab Resolvidas: histórico com nota, quem, quando; filtros.
- **RF-026:** Export CSV: período filtrado, 4 seções (ou 4 arquivos zip), `;`, UTF-8 BOM, datas dd/mm/aaaa, valores vírgula decimal.

### Alertas e Badge

- **RF-030:** Badge no item de menu "Financeiro" com contagem `open` warning+critical (Realtime).
- **RF-031:** Alerta PRD-110: critical aberto > 48h; ou > 20 abertos totais.

### Testes

- **RF-040:** Unitários: dedup 24h, severity por faixa, normalização settlement (fixtures Asaas/MP), match, fee_mismatch nos limiares, encoding do export.
- **RF-041:** Integração: pipeline 134-mock gera mismatch → item na fila → resolver com nota → audit; cron idempotente 2×; janela retroativa preenche dia faltante.
- **RF-042:** E2E: fluxo completo com MockPaymentProvider settlements sintéticos.

### Documentação

- **RF-050:** `payment-reconciliation.md`: taxonomia dos itens, severity, settlement por provider (endpoints, janelas de liquidação por método), fallback CSV documentado, guia do financeiro (como resolver cada tipo).

---

## Requisitos Não-Funcionais

- **RNF-001 (Nada se resolve sozinho):** todo item fechado tem nota + autor + timestamp — a fila é a memória do financeiro.
- **RNF-002 (Ingestão idempotente):** cron re-executado N vezes = mesmo estado.
- **RNF-003 (Bruto/líquido honestos):** cards distinguem sempre; taxa só de settlement real, nunca estimada silenciosamente.
- **RNF-004 (Fila leve):** dedup evita ruído; severity permite foco; lote acelera o trivial.
- **RNF-005 (Export do contador):** abre no Excel pt-BR sem mojibake nem coluna trocada.

---

## Critérios de Aceitação

### RF-002: Mismatch Vira Item

```gherkin
DADO webhook do 134 confirmando R$ 429,57 numa charge de R$ 430,00
QUANDO a cascata roda
ENTÃO audit payment_amount_mismatch (como antes)
  E item amount_mismatch criado: expected 430.00, actual 429.57, delta -0.43, severity info
  E badge do menu incrementa ao vivo
```

### RF-013/RF-014: Settlement Match e Taxa

```gherkin
DADO settlement Asaas { pay_88x, gross 430.00, fee 1.99, net 428.01 }
  E charge local com provider_charge_id pay_88x
QUANDO o cron ingere
ENTÃO settlement.charge_id preenchido
  E com feeEstimates.pix=1.50 e threshold 0.50 → |1.99-1.50|=0.49 ≤ 0.50 → SEM item
DADO fee real 2.40
ENTÃO item fee_mismatch info criado
```

### RF-023: Resolução com Nota

```gherkin
DADO item warning de Δ −12,50 no pedido #051
QUANDO Manager clica Resolver com nota "Encargo de atraso do boleto, conferido no extrato"
ENTÃO status resolved, resolved_by/at preenchidos
  E audit reconciliation_item_resolved
  E item sai da fila e aparece em Resolvidas
QUANDO tenta resolver SEM nota
ENTÃO bloqueado com validação inline
```

### RF-011: Janela Retroativa

```gherkin
DADO cron falhou ontem (gateway 500) e hoje executa
QUANDO roda
ENTÃO busca settlements de ontem E de hoje
  E nenhum dia fica permanentemente sem extrato
```

---

## Fases de Implementação

### Fase 1 — Schema + registerReconciliationItem (1 dia)
- Migrations + RLS
- Função + dedup + DELTAs nos 4 pontos (notas em 134/138)

### Fase 2 — Settlement Providers + Cron (2 dias)
- getSettlements Asaas/MP/Mock + capability
- Cron com retroativa, match, fee_mismatch

### Fase 3 — Tela (2 dias)
- Cards, 3 tabs, resolução/lote, badge Realtime

### Fase 4 — Export + Alertas (1 dia)
- CSV pt-BR; alertas 110

### Fase 5 — Testes + Docs (1 dia)
- E2E pipeline completo; payment-reconciliation.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-134/138 (pontos de detecção — DELTA), PRD-132/132B (getSettlements — DELTA de interface), PRD-102 (cron), PRD-105 (Realtime), PRD-110 (alertas)
- **Bloqueia:** PRD-140B (fecha a onda); PRDs 048/054/055 consomem taxas reais futuramente
- **DELTAs declarados:** 134 (3 pontos), 138 (1 ponto), 132 (método+capability)
- **Decisões Pendentes:**
  - `feeEstimates` por método: preencher com as taxas negociadas (financeiro GALLO) ou deixar vazio no MVP (sem fee_mismatch até configurar) — sugerido começar vazio
  - Thresholds de severity (R$ 1 / R$ 50) — confirmar com financeiro
  - Fallback CSV de extrato: construir só se a API falhar em produção (sugerido)

---

## Considerações de Segurança

- Dados financeiros agregados: RLS Owner/Manager estrito; seller sem acesso à tela
- `raw_entry`/`context` podem conter PII do gateway — RLS protege; export já é função de gestor
- Resolução auditada impede "limpeza" silenciosa da fila
- service_role confinado ao cron

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.9; CHANGELOG; renomear `PRD-139-conciliacao.md` → `_DONE`; anotar DELTAs nos `_DONE` de 132/134/138.

| Princípio | Descrição |
|-----------|-----------|
| **Audit é trilha; item é fila** | Os dois coexistem com papéis distintos |
| **Taxa real só do extrato** | Estimativa nunca vira número silencioso |
| **Nota obrigatória sempre** | A fila é a memória do financeiro |
| **Ingestão idempotente + retroativa** | Nenhum dia se perde |
| **Bruto ≠ líquido, sempre visível** | A diferença é a taxa, nomeada |

| ❌ Evitar |
|-----------|
| Auto-resolver qualquer item |
| Taxa estimada apresentada como real |
| Duplicar item no replay do mesmo mismatch |
| Export com encoding quebrado no Excel pt-BR |
| Fila sem dedup (ruído mata o processo) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 4d do Lote 4 (Onda 7) |

---

**AILA - Sistemas Inteligentes**
