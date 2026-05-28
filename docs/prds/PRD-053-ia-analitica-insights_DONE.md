# PRD-053: IA Analítica / Insights Automáticos

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                  |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                       |
| **Objetivo**          | Hub de insights automáticos detectando padrões cross-PRDs (queda de margem, churn, vendedor em risco, produto em queda, oportunidades) via heurísticas no MVP — preparado para LLM real na Fase 2 — com priorização, drill-down e dismiss |
| **Tipo**              | Feature                                                                                                                                                                                                                                   |
| **Complexidade**      | Alta                                                                                                                                                                                                                                      |
| **Total de Fases**    | 5                                                                                                                                                                                                                                         |
| **Prioridade**        | Alta                                                                                                                                                                                                                                      |
| **Épico**             | Bloco 4b — Gestão B (Onda 2)                                                                                                                                                                                                              |
| **PRDs Relacionados** | PRD-014 (Painel), PRD-040 (Cockpit), PRD-041 (Vendas), PRD-042 (Metas), PRD-044 (Positivação), PRD-045 (ABC), PRD-046 (Carteira), PRD-049 (Rentabilidade), PRD-050 (Estoque)                                                              |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                        |
| **Padrão de código**  | Feature-based; código em `src/features/insights/`                                                                                                                                                                                         |

### Critérios de Complexidade

> **Justificativa de Alta:** sistema cross-cutting que consome dados de **8+ PRDs analíticos**, 10+ heurísticas de detecção de padrões cada uma com lógica específica, priorização automática (crítico/médio/oportunidade), categorização (financeiro/comercial/operacional/cliente), dismiss persistente, drill-down universal, integração com PRD-014 (widget de alertas críticos) e PRD-040 (banner de insights no cockpit), e arquitetura preparada para substituição por LLM real (interface estável).

---

## Contexto do Problema

Owner João Gallo tem **8+ painéis analíticos** — cockpit, vendas, rentabilidade, DRE, carteira, ABC, metas, comissões. Mas:

**Padrões cruzados passam despercebidos.** "Margem do filtro Volvo caiu 15% E aumentou churn de clientes que compravam filtro Volvo — coincidência ou correlação?" Sem análise cruzada, Owner não conecta. **Volume de dados sobrecarrega.** Owner abre 5 painéis para entender uma situação. **Sem priorização inteligente.** Tudo tem o mesmo peso visual; o que merece atenção HOJE não é evidente.

Este PRD entrega: hub de insights automáticos com heurísticas que detectam padrões importantes, priorização visual, drill-down para painéis específicos. **Arquitetura prepara LLM real na Fase 2** sem refatorar consumidores.

---

## Conceito da Solução

### O que é um "insight"

Padrão detectado automaticamente que merece atenção. Não é apenas KPI — é **inferência** com contexto e ação sugerida.

Exemplos:

- "**Margem de Filtros caiu 12% no último trimestre** — investigue precificação ou custos de fornecedor"
- "**Carlos teve queda de 30% em positivação** — pode estar precisando de apoio"
- "**Cliente 'Frota Express' não compra há 45 dias** — considere ação proativa"
- "**Produto X tem cobertura de 245 dias** — capital parado R$ 15k, considere promoção"
- "**Conversão SDR caiu 18%** — revise templates ou regras de identificação"

### Modelo

```typescript
IInsight {
  id: ID;
  type: InsightType;               // ver categorias abaixo
  priority: 'critico' | 'medio' | 'oportunidade' | 'info';
  category: 'financeiro' | 'comercial' | 'operacional' | 'cliente';
  title: string;                   // título curto
  description: string;             // explicação
  context: Record<string, unknown>; // dados que sustentam o insight
  // Sugestão de ação
  suggestedAction?: {
    label: string;
    drillDownUrl: string;
  };
  // Validade
  detectedAt: ISO8601;
  validUntil?: ISO8601;            // expira (insight pode ficar irrelevante)
  // Dismiss
  dismissedBy?: ID;
  dismissedAt?: ISO8601;
  dismissReason?: string;
  storeId: ID;
}

type InsightType =
  | 'margin_drop'
  | 'churn_spike'
  | 'seller_at_risk'
  | 'customer_at_risk'
  | 'product_decline'
  | 'product_excess'
  | 'sdr_conversion_drop'
  | 'meta_at_risk'
  | 'top_seller_overload'
  | 'opportunity_segment'
  // ...
```

### Engine de detecção (heurísticas MVP)

Função `detectInsights(context)` em `src/features/insights/engine/` roda diariamente (mock no front; Fase 2 com cron):

```typescript
function detectInsights(context: IInsightsContext): IInsight[] {
  const insights: IInsight[] = [];

  // Heurística 1: queda de margem
  for (const category of categories) {
    const margemAtual = getCategoryMargin(category, 'thisMonth');
    const margemAnterior = getCategoryMargin(category, 'lastMonth');
    if (margemAtual < margemAnterior * 0.85) {
      insights.push({
        type: 'margin_drop',
        priority: 'critico',
        category: 'financeiro',
        title: `Margem de ${category} caiu ${formatPercent((margemAtual/margemAnterior - 1))}%`,
        description: '...',
        suggestedAction: { label: 'Analisar produtos', drillDownUrl: `/app/rentabilidade?category=${category}` },
        ...
      });
    }
  }

  // Heurística 2: churn spike
  // Heurística 3: vendedor em risco (queda em múltiplas métricas)
  // ...
}
```

### 10+ Heurísticas MVP

| #   | Tipo                 | Critério                                             | Prioridade   |
| --- | -------------------- | ---------------------------------------------------- | ------------ |
| 1   | margin_drop          | Margem de categoria caiu > 15% vs mês anterior       | crítico      |
| 2   | churn_spike          | Churn subiu > 25% vs período anterior                | crítico      |
| 3   | seller_at_risk       | Vendedor com queda em 3+ métricas simultâneas        | médio        |
| 4   | customer_at_risk     | Cliente A/B sem compra há > 75% do dormantDays       | médio        |
| 5   | product_decline      | Produto X com queda > 30% em vendas                  | médio        |
| 6   | product_excess       | Produto Z com cobertura > 180 dias E capital > R$ 5k | médio        |
| 7   | sdr_conversion_drop  | Taxa de aceite SDR caiu > 20%                        | crítico      |
| 8   | meta_at_risk         | Meta com < 50% e < 7 dias restantes                  | crítico      |
| 9   | top_seller_overload  | Top vendedor com TMR subindo (sobrecarga)            | médio        |
| 10  | opportunity_segment  | Categoria/segmento crescendo > 30% — oportunidade    | oportunidade |
| 11  | new_customer_winning | Cliente novo entrou direto na classe A (PRD-045)     | oportunidade |
| 12  | recovery_success     | Vendedor recuperou múltiplos dormentes               | oportunidade |

Threshold de cada uma configurável em settings.

### Hub `/app/insights`

**Header**: filtros (categoria, prioridade, período de detecção, status).

**KPIs no topo:**

- Total de insights ativos
- Críticos (vermelho)
- Médios (amarelo)
- Oportunidades (verde)

**Lista priorizada** de cards de insight:

- Título + descrição
- Badge de prioridade (cor)
- Badge de categoria
- Timestamp ("há 3 dias")
- Botão drill-down (executa suggestedAction.drillDownUrl)
- Botão "Dispensar" com motivo opcional
- Botão "Ver contexto" — expande dados que sustentam o insight

**Toggle**: Ativos / Dispensados (histórico).

### Integração com PRD-014 (Painel Gestor)

Widget "Insights críticos" com top 3-5 críticos. Click leva ao `/app/insights`.

### Integração com PRD-040 (Cockpit)

Banner no topo do cockpit com contagem de críticos. Click leva ao hub.

### Dismiss e persistência

Owner/Gestor pode dispensar insights que não são acionáveis:

- Modal pede motivo opcional
- `dismissedBy`, `dismissedAt`, `dismissReason` preenchidos
- Insight some da lista ativa mas fica em "Dispensados"
- Reavaliação não recria insight dispensado (evita ruído) durante validUntil

### Geração diária

Hook `useInsightsDailyDetection()` (mock no MVP):

- Roda 1x ao dia (timer no front simulado)
- Executa `detectInsights(context)` com dados atuais
- Cria novos `IInsight` para padrões detectados
- Marca insights antigos com `validUntil` expirado

Na Fase 2: Edge Function Supabase com cron real + LLM substitui heurísticas.

### Permissões

- **Owner**: tudo
- **Gestor**: loja
- **Financeiro**: insights financeiros only
- **Vendedor**: SEM ACESSO

### Configuração `/app/configuracoes/insights`

Sub-rota PRD-019 (Owner):

- Toggle ativo (`IPlatformSettings.insightsEnabled`)
- Thresholds das heurísticas (sliders)
- Banner: "Detecção via IA real (LLM) disponível na Fase 2 — atualmente baseada em heurísticas configuráveis"

### Alternativas Consideradas

| Alternativa                                  | Por que descartada                                    |
| -------------------------------------------- | ----------------------------------------------------- |
| LLM real no MVP                              | Custo + complexidade; heurísticas cobrem casos óbvios |
| Sem dismiss                                  | Owner perde controle; lista vira ruído                |
| Sem priorização                              | Tudo igual visualmente — não ajuda                    |
| Insights espalhados (sem hub)                | Owner não consolida                                   |
| Notificações automáticas a cada novo insight | Spam; lista no hub é suficiente                       |
| Sem contexto expansível                      | Insight sem dados que sustentam = falta confiança     |

---

## Escopo

### Incluído

- ✅ Modelo `IInsight`, `InsightType`, settings
- ✅ Engine `detectInsights(context)` com 10+ heurísticas implementadas
- ✅ Hook `useInsightsDailyDetection()` rodando diariamente (mock no front)
- ✅ Página `/app/insights` substituindo placeholder do PRD-003
- ✅ KPIs por prioridade + lista priorizada
- ✅ Filtros (categoria, prioridade, período, status) + URL sync
- ✅ Drill-down via suggestedAction
- ✅ Dismiss com motivo
- ✅ Toggle Ativos/Dispensados
- ✅ Contexto expansível (dados que sustentam)
- ✅ Widget no PRD-014 (insights críticos top 3-5)
- ✅ Banner no PRD-040 (cockpit) com contador de críticos
- ✅ Sub-rota `/app/configuracoes/insights` para thresholds
- ✅ Permissões (Vendedor bloqueado)
- ✅ Mobile responsivo
- ✅ Audit log de dismiss

### Excluído

- ❌ LLM real (OpenAI, Claude) — Fase 2
- ❌ Geração de relatórios narrativos via IA — Fase 2
- ❌ Sugestões automatizadas de ação detalhadas — Fase 2 (apenas drill-down no MVP)
- ❌ Chat com IA sobre insights — Fase 2
- ❌ Notificações automáticas via email/push — Fase 2
- ❌ Aprendizado da preferência (insights que Owner gosta) — Fase 2

---

## Requisitos Funcionais

### Modelo e settings

- **RF-001:** Tipos `IInsight`, `InsightType`, `InsightPriority`, `InsightCategory`.
- **RF-002:** Settings: thresholds configuráveis por heurística + toggle `insightsEnabled`.

### Engine

- **RF-003:** `detectInsights(context)` função pura.
- **RF-004:** 10+ heurísticas implementadas com lógica clara.
- **RF-005:** Cada insight inclui contexto (dados que sustentam) para transparência.
- **RF-006:** Suggested action com URL drill-down para PRD apropriado.

### Hook diário

- **RF-007:** `useInsightsDailyDetection()` roda a cada 24h (timer no MVP).
- **RF-008:** Cria novos insights; marca antigos com validUntil expirado.
- **RF-009:** Não recria insights dispensados durante validUntil.

### Hub `/app/insights`

- **RF-010:** `InsightsHubPage` em `src/features/insights/pages/`.
- **RF-011:** Header com filtros + URL sync.
- **RF-012:** 4 KPIs (total ativos, críticos, médios, oportunidades).
- **RF-013:** Toggle Ativos/Dispensados.
- **RF-014:** Lista de cards priorizados por prioridade > timestamp.
- **RF-015:** Cada card com expand de contexto (accordion).
- **RF-016:** Botão drill-down executa suggestedAction.drillDownUrl.
- **RF-017:** Botão "Dispensar" abre modal com motivo opcional; audit log.

### Integrações

- **RF-018:** Widget `<CriticalInsightsWidget>` no PRD-014:
  - Top 3-5 insights críticos
  - Click leva ao /app/insights
- **RF-019:** Banner no topo do PRD-040 (Cockpit) com contador: "X insights críticos requerem atenção".
- **RF-020:** Hook `useInsights(filters)` exportado.

### Configuração

- **RF-021:** `InsightsConfigPage` em `/app/configuracoes/insights` (Owner).
- **RF-022:** Sliders para thresholds de cada heurística.
- **RF-023:** Toggle global ativo/inativo.
- **RF-024:** Banner sobre LLM Fase 2.

### Permissões

- **RF-025:** Vendedor BLOQUEADO via GuardedRoute.
- **RF-026:** Financeiro vê apenas categoria 'financeiro'.
- **RF-027:** Gestor vê loja.
- **RF-028:** Owner cross-store.

### Audit

- **RF-029:** Audit em dismiss (`action='insight_dismiss'` com motivo).
- **RF-030:** Audit em mudança de threshold (`action='insight_config_update'`).

---

## Requisitos Não-Funcionais

- **RNF-001:** Detecção de insights < 2s para todos os dados mock.
- **RNF-002:** Memorização agressiva.
- **RNF-003:** Mobile responsivo.
- **RNF-004:** WCAG 2.1 AA.
- **RNF-005:** Compatibilidade Fase 2: substituir `detectInsights` por chamada a LLM sem refatorar consumidores.

---

## Critérios de Aceitação

```gherkin
DADO margem de filtros caiu 18% vs mês anterior (heurística 1)
QUANDO detectInsights roda
ENTÃO insight criado com type='margin_drop', priority='critico'
  E description detalha a queda
  E suggestedAction leva ao PRD-049 filtrado por categoria

DADO Owner acessa /app/insights
QUANDO observa
ENTÃO vê 4 KPIs + lista priorizada
  E pode filtrar e expandir contexto

DADO Owner dispensa insight com motivo "Já sabia, ação em andamento"
QUANDO submete
ENTÃO insight some da lista ativa
  E aparece em "Dispensados"
  E audit log

DADO próxima detecção diária roda
QUANDO heurística detectaria o mesmo insight dispensado
ENTÃO NÃO recria (respeitando validUntil)

DADO Vendedor tenta acessar /app/insights
QUANDO valida
ENTÃO bloqueado

DADO PRD-040 Cockpit
QUANDO há 3 insights críticos ativos
ENTÃO banner topo: "3 insights críticos requerem atenção"
  E click leva ao hub
```

---

## Fases de Implementação

| Fase | Objetivo                                           |
| ---- | -------------------------------------------------- |
| 1    | Modelo + engine com 5 heurísticas básicas          |
| 2    | Hub com lista + dismiss + filtros                  |
| 3    | Demais heurísticas (até 10+) + contexto expansível |
| 4    | Integrações PRD-014 + PRD-040 + configuração       |
| 5    | Polish + mobile + audit + documentação             |

---

## Dependências

| PRD                                 | Status |
| ----------------------------------- | ------ |
| Múltiplos PRDs analíticos (consome) | 📝     |
| PRD-040 (banner)                    | 📝     |
| PRD-014 (widget)                    | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-32   | 010-052           |
| **33** | **PRD-053 ATUAL** |

> **Marco:** Bloco 4 (Gestão A + B) completo — **Onda 2 do MVP fecha aqui**.

---

## Considerações de Segurança

- Insights contêm dados sensíveis (margem, vendedor em risco, cliente em risco) — permissões granulares
- Dismiss exige audit log (Owner não pode esconder insights sem deixar registro)
- Vendedor bloqueado (insights sobre próprio risco poderiam ser desmotivantes; gestão deve mediar)

---

## Convenções

| Elemento    | Convenção                                   |
| ----------- | ------------------------------------------- |
| Página      | `InsightsHubPage`, `InsightsConfigPage`     |
| Engine      | `detectInsights`                            |
| Componentes | `<InsightCard>`, `<CriticalInsightsWidget>` |
| Pasta       | `insights/`                                 |

---

## Notas para o Agente Desenvolvedor

### Princípios

- **Heurísticas no MVP, LLM na Fase 2** — interface estável para drop-in
- **Contexto sempre visível** — Owner precisa entender o porquê
- **Dismiss é importante** — controle do usuário evita ruído
- **Drill-down universal** — cada insight leva ao PRD relevante
- **Priorização clara** — crítico > médio > oportunidade
- **Vendedor bloqueado** — gestão de risco do próprio vendedor é responsabilidade do Gestor

### Não Fazer

- LLM real no MVP (Fase 2)
- Notificações push (Fase 2)
- Chat com IA (Fase 2)
- Recriar insights dispensados durante validUntil
- Permitir dismiss sem audit
- Mostrar insights sobre o vendedor para o próprio vendedor

---

## Status

| Campo  | Valor                            |
| ------ | -------------------------------- |
| Status | ✅ CONCLUÍDO — v0.38.0 (Compass) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                                                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — hub de insights com 10+ heurísticas, priorização, dismiss, integrações cross-painel                                                                                                            |
| 27/05/2026 | v1.1   | Implementação concluída — engine puro com 12 heurísticas, hub `/app/insights`, dismiss persistente, widget no PRD-014, banner no PRD-040, config em `/app/configuracoes/insights`, version bump 0.38.0 (Compass) |

---

**AILA - Sistemas Inteligentes**
