# PRD-051: Atendimento (Análise Histórica)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Construir análise histórica do atendimento — métricas evolutivas de TMA/TMR, volume por canal, taxa de resolução, motivos de escalação, conversão pós-atendimento — diferenciado do PRD-014 (operacional tempo real) |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 4b — Gestão B (Onda 2) |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-011 (Conversa), PRD-014 (Painel Gestor — operacional), PRD-023 (Escalonamento SDR), PRD-024 (Painel SDR), PRD-040 (Cockpit) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/customer-service-analytics/` |

### Critérios de Complexidade

> **Justificativa de Alta:** análise multidimensional do atendimento com evolução temporal (12 meses), 6+ métricas (TMA, TMR, taxa resolução, volume canal, motivos escalação, conversão pós-atendimento), drill-down por vendedor com comparativo entre membros da equipe, integração com PRD-023 (escalonamentos) e PRD-024 (SDR), gráficos temporais múltiplos, e diferenciação clara do PRD-014 (operacional vs histórico).

---

## Contexto do Problema

PRD-014 mostra "como está agora" (operacional). Owner precisa **histórico** para tomada de decisão estratégica:

**TMA está melhorando ou piorando?** Sem evolução temporal, não sabe direção. **Qual canal cresce mais?** WhatsApp dobrou volume, telefone caiu? Cobertura por canal precisa adaptar. **Qual vendedor resolve mais sem escalar?** Identifica top performers em atendimento (diferente de top em vendas). **Motivos de escalação SDR mais comuns?** Informa onde melhorar templates do SDR (PRD-020/024).

Este PRD entrega: dashboard histórico com gráficos evolutivos, drill-down comparativo entre vendedores, análise de motivos.

---

## Diferenciação clara

| Painel | Pergunta | Tempo |
|--------|----------|-------|
| **PRD-014** (Painel Gestor) | Como vai o atendimento **agora**? | Tempo real |
| **PRD-024** (Painel SDR) | Como vai o SDR especificamente? | Histórico + tempo real |
| **PRD-051** (este) — Atendimento Histórico | Como vai o atendimento ao longo do tempo? | Histórico estratégico |

---

## Conceito da Solução

### Página `/app/atendimento-analise`

Header: filtros (período mês/trim/ano/personalizado, loja Owner, vendedor).

### 4 abas

1. **Visão Geral** — KPIs + tendências
2. **Por Canal/Origem** — análise por meio (WhatsApp/Telefone/SDR/Outros)
3. **Por Vendedor** — comparativo de performance
4. **Escalações SDR** — análise dos motivos

---

### Aba 1 — Visão Geral

KPIs:
- TMA médio (Tempo Médio de Atendimento — desde abertura até resolução)
- TMR médio (Tempo Médio de Resposta — primeira resposta humana)
- Conversas totais no período
- Taxa de resolução (% resolvidas sem precisar transferir)
- Conversão pós-atendimento (% que viraram pedido)
- NPS placeholder (card "Em breve — Fase 2")

Gráfico: evolução temporal de TMA e TMR (linhas, 12 meses).

Gráfico: volume diário de conversas (linha).

Card "Comparativo": atual vs período anterior com Δ% (positivos = melhoria para TMA/TMR é redução).

---

### Aba 2 — Por Canal/Origem

Bar chart: volume de conversas por canal (WhatsApp / Telefone / SDR / Outros).

Tabela com colunas:
- Canal
- Volume
- TMA médio
- TMR médio
- Taxa de resolução
- Conversão

Identifica canais de alta performance vs problemáticos.

---

### Aba 3 — Por Vendedor

Tabela comparativa:
- Avatar + nome
- Conversas atendidas
- TMA / TMR médios
- Taxa de resolução
- Conversão pós-atendimento
- Health score (composto)

Indicador visual de quem está acima/abaixo da média da equipe.

Drill-down individual `/app/atendimento-analise/:sellerId`:
- KPIs do vendedor
- Evolução de TMA/TMR no tempo
- Comparativo com média da loja

---

### Aba 4 — Escalações SDR

Consome PRD-023 (escalonamentos).

KPIs:
- Total escalações no período
- Por motivo (customer_requested / negotiation_detected / sdr_failed / complexity / out_of_scope)

Pie chart de motivos.

Tabela top vendedores que mais recebem escalações (com indicador se está sobrecarregado).

Click em motivo → drill-down de sessões SDR (PRD-024).

---

### Métricas e cálculo

```typescript
ICustomerServiceMetrics {
  period: { start: ISO8601; end: ISO8601 };
  totalConversations: number;
  averageHandleTime: number;       // ms - desde abertura até última mensagem
  averageResponseTime: number;     // ms - primeira resposta humana
  resolutionRate: number;          // % sem transferência
  conversionRate: number;          // % que viraram pedido pago
  byChannel: Record<string, IChannelMetrics>;
  bySeller: ISellerServiceMetrics[];
  escalations: {
    total: number;
    byReason: Record<string, number>;
  };
}
```

### Permissões

- **Owner**: tudo cross-store
- **Gestor**: loja
- **Vendedor**: SEM ACESSO (estratégico)
- **Financeiro**: read-only

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|---------------------|
| Misturar com PRD-014 | Tempo real ≠ análise histórica |
| Sem aba escalações | Motivos SDR são insight crítico para melhoria |
| Apenas KPIs sem evolução | Tendência é o core |
| Vendedor vê dados de colegas | Compare-and-shame não é construtivo aqui |

---

## Escopo

### Incluído

- ✅ Página `/app/atendimento-analise` substituindo placeholder do PRD-003
- ✅ 4 abas com hook agregador `useCustomerServiceMetrics(filters)`
- ✅ KPIs evolutivos com tendência vs período anterior
- ✅ Gráficos temporais (TMA, TMR, volume)
- ✅ Análise por canal/origem
- ✅ Comparativo por vendedor com drill-down individual
- ✅ Análise de motivos de escalação (PRD-023)
- ✅ Conversão pós-atendimento (cruzamento com PRD-032)
- ✅ NPS card placeholder Fase 2
- ✅ Hooks consumíveis pelo PRD-040
- ✅ Permissões granulares
- ✅ URL sync de filtros
- ✅ Mobile responsivo

### Excluído

- ❌ NPS real (pesquisa com clientes) — Fase 2
- ❌ Análise de sentimento via IA — Fase 2
- ❌ Cohort analysis avançada — Fase 2
- ❌ Sugestões automáticas de melhoria — Fase 2 (PRD-053)
- ❌ Análise de tópicos das conversas — Fase 2
- ❌ Export PDF — Fase 2

---

## Requisitos Funcionais

### Engine

- **RF-001:** `calculateCustomerServiceMetrics(period, context)` função pura.
- **RF-002:** Calcula TMA: média de `(conversa.lastMessageAt - conversa.startedAt)`.
- **RF-003:** Calcula TMR: média de `(primeira mensagem out humana - mensagem in inicial)`.
- **RF-004:** resolutionRate = % sem transfer/escalation registrada.
- **RF-005:** conversionRate = % de conversas que tiveram pedido pago vinculado (via customerId + período).
- **RF-006:** Por canal: agrupa por origem da conversa.
- **RF-007:** Por vendedor: agrupa por assignedSellerId.
- **RF-008:** Escalações: agrega ISdrEscalation por reason.

### Página e abas

- **RF-009:** `CustomerServiceAnalyticsPage` em `src/features/customer-service-analytics/pages/`.
- **RF-010:** Tabs com 4 abas.
- **RF-011:** Header com filtros + URL sync.

### Aba Visão Geral

- **RF-012:** 5 KPIs principais + 1 card NPS placeholder Fase 2.
- **RF-013:** LineChart TMA/TMR (eixo Y duplo).
- **RF-014:** LineChart volume diário.
- **RF-015:** Card comparativo cross-período.

### Aba Por Canal

- **RF-016:** BarChart volume por canal.
- **RF-017:** Tabela com 6 colunas (canal, volume, TMA, TMR, resolução, conversão).

### Aba Por Vendedor

- **RF-018:** Tabela comparativa com health score composto.
- **RF-019:** Drill-down `/app/atendimento-analise/:sellerId`.

### Aba Escalações

- **RF-020:** KPIs + PieChart por motivo + tabela top vendedores que recebem.
- **RF-021:** Drill-down para PRD-024 (Painel SDR) ao clicar em motivo.

### Permissões

- **RF-022:** Vendedor bloqueado.
- **RF-023:** Gestor: loja.
- **RF-024:** Owner: cross-store.

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo < 600ms para 12 meses de conversas.
- **RNF-002:** Memorização agressiva.
- **RNF-003:** Mobile responsivo.
- **RNF-004:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO 300 conversas no período
QUANDO calculateCustomerServiceMetrics executa
ENTÃO TMA, TMR, resolutionRate, conversionRate calculados corretamente

DADO Owner acessa /app/atendimento-analise
QUANDO observa Visão Geral
ENTÃO vê 5 KPIs + 2 gráficos evolutivos + card comparativo

DADO aba Escalações
QUANDO observa pie chart
ENTÃO vê distribuição entre 5 motivos
  E click em "negotiation_detected" leva ao PRD-024 filtrado

DADO Vendedor tenta acessar
QUANDO GuardedRoute valida
ENTÃO bloqueado
```

---

## Fases de Implementação

| Fase | Objetivo |
|------|----------|
| 1 | Engine + hook |
| 2 | Aba Visão Geral + Por Canal |
| 3 | Aba Por Vendedor + drill-down |
| 4 | Aba Escalações + integração PRD-024 |
| 5 | Polish + mobile |

---

## Dependências

| PRD | Status |
|-----|--------|
| PRD-010/011 (conversas) | 📝 |
| PRD-023 (escalonamentos) | 📝 |
| PRD-024 (drill-down) | 📝 |
| PRD-032 (conversão) | 📝 |
| PRD-040 (consome) | 📝 |

---

## Cadeia

| Ordem | PRD |
|-------|-----|
| 1-30 | 010-050 |
| **31** | **PRD-051 ATUAL** |
| 32+ | 052, 053 |

---

## Considerações de Segurança

- Dados de atendimento contêm PII — visibilidade por permissão
- Comparativo entre vendedores: Owner/Gestor only

---

## Convenções

| Elemento | Convenção |
|----------|-----------|
| Página | `CustomerServiceAnalyticsPage` |
| Hook | `useCustomerServiceMetrics` |
| Pasta | `customer-service-analytics/` |

---

## Notas para o Agente Desenvolvedor

- Diferenciação CLARA de PRD-014 (operacional) — este é histórico/estratégico
- 4 abas separam dimensões — não tentar unificar
- Drill-down para PRD-024 nas escalações
- NPS é placeholder visual — não implementar lógica
- Cálculos pesados memoizar

---

## Status

| Campo | Valor |
|-------|-------|
| Status | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 25/05/2026 | v1 | Criação inicial — análise histórica do atendimento com 4 abas |

---

**AILA - Sistemas Inteligentes**
