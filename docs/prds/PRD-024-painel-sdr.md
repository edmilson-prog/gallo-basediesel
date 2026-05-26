# PRD-024: Painel de Configuração e Métricas do Agente SDR

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                            |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                 |
| **Objetivo**          | Construir o hub central do agente SDR — painel operacional com visão geral, histórico, métricas detalhadas, edição de templates, e configurações consolidadas — para Owner/Gestor monitorarem e ajustarem o comportamento do agente |
| **Tipo**              | Feature                                                                                                                                                                                                                             |
| **Complexidade**      | Alta                                                                                                                                                                                                                                |
| **Total de Fases**    | 5                                                                                                                                                                                                                                   |
| **Prioridade**        | Alta                                                                                                                                                                                                                                |
| **Épico**             | Bloco 2 — SDR (Agente IA 24/7)                                                                                                                                                                                                      |
| **PRDs Relacionados** | PRD-014 (Painel Gestor), PRD-019 (Configurações), PRD-020 (SDR engine), PRD-021/022/023 (componentes SDR), PRD-040 (Visão Executiva — Bloco 4)                                                                                      |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                  |
| **Padrão de código**  | Feature-based; código em `src/features/sdr-dashboard/`; reusa hooks de métricas dos PRDs 020-023                                                                                                                                    |

### Critérios de Complexidade

> **Justificativa de Alta:** hub navegável com 5 abas (Visão Geral / Histórico / Métricas / Templates / Configurações), múltiplos gráficos (Recharts) com filtros combinados, listagem paginada de sessões SDR com drill-down em detalhes (estado, intent, identificação, orçamento, escalação), editor de templates com preview ao vivo e variáveis, configurações consolidadas dos PRDs 020-023 em um lugar (toggle SDR global, validade orçamento, desconto autorizado, frete preliminar, escalação settings), integração com PRD-014 (Painel Gestor consome alertas), e diferenciação clara do BI estratégico da Onda 2 (PRD-040).

---

## Contexto do Problema

Os PRDs 020-023 entregam o SDR funcional, mas cada um tem sua própria UI dispersa: simulador em uma sub-rota, métricas embutidas em hooks, templates configuráveis em outro lugar, histórico inacessível. Owner que quer "ver como o SDR está indo este mês" precisa caçar informações em 5 telas. Três problemas:

**Sem visão consolidada, sintonia fina é impossível.** Owner percebe que "muita escalação" — mas escalação por quê? Qual motivo predominante? Em que horário? Sem histórico filtrado e métricas detalhadas, ajustar templates ou regras é chute. **Templates editados em silos.** PRD-020 tem 8 templates, PRD-022 tem 4, PRD-023 tem 1. Sem painel central, Owner edita um, esquece outro, mensagens ficam inconsistentes em tom. **Sem drill-down, métricas viram números abstratos.** "Taxa de escalonamento 35%" — qual sessão exemplifica isso? Owner precisa abrir conversas individuais; impossível sem lista navegável.

Este PRD entrega: hub `/app/sdr` com 5 abas que consolidam tudo, drill-down navegando para sessões individuais, gráficos visuais, edição centralizada de templates, configurações em um lugar.

---

## Diferenciação: este painel vs PRD-014 vs PRD-040

| Painel                                 | Pergunta que responde                   | Audiência            | Quando                      |
| -------------------------------------- | --------------------------------------- | -------------------- | --------------------------- |
| **PRD-014** (Painel Gestor)            | Como vai o atendimento geral agora?     | Owner + Gestor       | Tempo real, operação diária |
| **PRD-024** (Painel SDR) — este        | Como vai o agente SDR especificamente?  | Owner + Gestor       | Tempo real, foco em SDR     |
| **PRD-040** (Visão Executiva — Onda 2) | Como vai a empresa? Vendas, margem, ROI | Owner principalmente | Diário/semanal/mensal       |

PRD-014 mostra "SDR escalações" como um indicador entre vários. PRD-024 detalha o SDR inteiro. PRD-040 não trata de SDR — trata da empresa.

---

## Conceito da Solução

### Layout

Rota `/app/sdr` usando `DashboardLayout` com **5 abas**:

1. **Visão Geral** — KPIs principais + gráfico de tendência
2. **Histórico** — Lista de sessões SDR navegável com filtros
3. **Métricas** — Gráficos detalhados (volume, motivos, conversão)
4. **Templates** — Editor centralizado de todos os templates (20+ default)
5. **Configurações** — Settings consolidados (toggle SDR, validade quote, desconto, escalação, etc.)

Header global: título "Agente SDR", filtros (período, loja se Owner), botão "Abrir simulador" (atalho para PRD-020), badge "SDR Ativo" / "SDR Pausado".

### Aba 1 — Visão Geral

**Linha 1 — 4 KPIs principais:**

| KPI                         | Cálculo                                         | Tendência                          |
| --------------------------- | ----------------------------------------------- | ---------------------------------- |
| Sessões atendidas           | Contagem no período                             | Comparação com período anterior    |
| Taxa de escalação           | % com `finishReason='escalated'`                | Verde se diminui, vermelho se sobe |
| Taxa de aceite de orçamento | % de quotes SDR aceitos                         | Verde se sobe                      |
| TTFR médio                  | Tempo médio até resposta humana após escalation | Verde se diminui                   |

**Linha 2 — gráfico de linha** — Volume diário de sessões SDR (últimos 30 dias por padrão; configurável).

**Linha 3 — gráfico de distribuição** — Pizza: distribuição dos `finishReason` (escalated / completed / abandoned / paused_by_human).

### Aba 2 — Histórico

Tabela paginada de `ISdrSession` com colunas:

- Avatar do cliente
- Cliente / lead
- Início (timestamp)
- Duração
- Estado final
- Motivo do término
- Peça identificada? (badge)
- Orçamento gerado? (badge)
- Vendedor escalado (se aplicável)
- Ações: ver detalhes

Filtros:

- Período
- Estado final (multi-select)
- Motivo do escalonamento (se finishReason='escalated')
- Vendedor escalado
- Loja (Owner)
- Tem orçamento gerado / sem orçamento

Click numa linha abre **modal de detalhes da sessão**:

- Header: cliente, duração, estado
- Timeline cronológica dos turnos (cada com state, intent detectada, template usado)
- Resumo: peça identificada (se houver), orçamento gerado (link), escalação (link)
- Trace completo expansível (cada turno com input/output/decisões)
- Botão "Ir para conversa" navega para `/app/atendimento/:conversationId`

### Aba 3 — Métricas Detalhadas

**Grid 2×2 de gráficos:**

1. **Heatmap de volume por hora/dia** — 7 dias × 24 horas, intensidade por número de sessões. Mostra picos de uso do SDR — informa decisões de cobertura humana.
2. **Taxa de resolução de FAQ vs escalação** — bar chart por categoria de FAQ (horário / entrega / frete / etc.) mostrando quantos foram resolvidos pelo SDR vs escalaram.
3. **Motivos de escalação** — pie chart distribuindo entre `customer_requested`, `negotiation_detected`, `sdr_failed`, `complexity`, `out_of_scope`.
4. **TTFR por modo de escalação** — bar chart comparando urgent vs normal vs standard.

Filtros globais aplicam a todos os gráficos.

### Aba 4 — Templates

Editor centralizado de todos os templates SDR. Estrutura agrupada:

| Grupo                     | Templates                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Saudação**              | saudacao, identificacao_nome, identificacao_empresa                                                               |
| **Qualificação**          | pergunta_necessidade, request_more_info_geral                                                                     |
| **FAQ**                   | faq_horario, faq_entrega, faq_pagamento, faq_garantia                                                             |
| **Identificação de Peça** | identification_part_found, identification_part_not_found, identification_ambiguous (PRD-021)                      |
| **Orçamento**             | quote_generation, quote_accept_response, quote_reject_response, quote_negotiate_response, quote_expired (PRD-022) |
| **Escalonamento**         | escalation_customer_handoff (PRD-023)                                                                             |
| **Despedida**             | despedida_geral, despedida_apos_aceite                                                                            |

Para cada template:

- Trigger (read-only)
- Texto editável (textarea com syntax highlight para variáveis `{{var}}`)
- Lista de variáveis disponíveis com descrição
- Preview ao vivo com variáveis exemplo preenchidas
- Botão "Restaurar default"

Salvar individual ou todos juntos. Audit log em cada mudança.

### Aba 5 — Configurações Consolidadas

Settings de todos os PRDs SDR em um lugar (algumas duplicam PRD-019, mas aqui ficam contextualmente relevantes):

**Geral:**

- Toggle "SDR Ativo" (`IPlatformSettings.sdrEnabled`)
- Modo de operação (auto / SDR-first / híbrido — referência PRD-013)

**Orçamento (PRD-022):**

- Validade default (slider 1-30 dias)
- Desconto automático autorizado (slider 0-10%)
- Frete preliminar: configuração por região

**Escalonamento (PRD-023):**

- Timeout urgent na fila (minutos)
- Timeout normal na fila (minutos)
- Tempo antes de broadcast urgent (segundos)

**Identificação (PRD-021):**

- Confiança mínima para confirmar automaticamente (slider 0.7-1.0)
- Mostrar equivalências sempre / só se mais barato / nunca

**Templates:** (link cruzado para aba 4)

**Botão "Salvar configurações"** com audit log + toast.

### Drill-down — modal de detalhes da sessão

Componente reutilizável `<SdrSessionDetailModal>`:

```
┌─────────────────────────────────────────────────────┐
│ Sessão SDR — abc123                            [×]  │
├─────────────────────────────────────────────────────┤
│ Cliente: João Silva (Frota Express B2B)             │
│ Início: 25/05/2026 14:32                            │
│ Duração: 4min 23s                                   │
│ Estado final: finalizado (escalated)                │
│                                                      │
│ TIMELINE:                                            │
│  14:32 saudacao   intent="" template="saudacao"     │
│  14:33 identif.   intent="" coletou={name:"João"}   │
│  14:34 qualif.    intent=identificar_peca           │
│  14:35 → PRD-021 identificou Filtro Volvo R450      │
│  14:36 → PRD-022 quote R$ 145                       │
│  14:38 cliente:   "tem por menos?"                  │
│  14:38 detected:  negotiate                          │
│  14:38 → PRD-023 escalou para Carlos                │
│                                                      │
│ TRACE COMPLETO (expansível) ▼                       │
│                                                      │
│ [Ir para conversa]  [Baixar trace]                  │
└─────────────────────────────────────────────────────┘
```

### Alertas no painel

Banner topo da Visão Geral quando há algo crítico:

- "Taxa de escalonamento subiu 25% nos últimos 7 dias" (yellow)
- "SDR teve 5+ sessões com intent unknown na última hora" (red — indica template ou keyword precisa de atenção)
- "Templates default não personalizados" (info — primeira vez)

### Permissões

- **Owner**: tudo (visualizar + editar templates + configurar settings)
- **Gestor**: visualizar Visão Geral, Histórico, Métricas; templates read-only; settings read-only
- **Vendedor**: sem acesso (vê dados SDR apenas dentro de conversas — bubbles distinguidos)
- **Financeiro**: sem acesso

### Alternativas Consideradas

| Alternativa                                    | Por que foi descartada                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| Painel disperso (cada PRD com sua UI)          | Owner navega 5 telas pra ter visão completa            |
| Sem drill-down em sessões                      | Métricas sem exemplo concreto viram abstratas          |
| Templates editáveis só em PRD-019              | Contexto SDR perdido; ali são apenas "settings"        |
| Sem heatmap de volume                          | Padrões de uso do SDR informam cobertura humana        |
| Sem motivos de escalação                       | Owner não sabe o que melhorar                          |
| Visualização gráfica em outras telas (Bloco 4) | Aguardar Onda 2 atrasa feedback do SDR no MVP          |
| Sem alertas no painel                          | Owner descobre tarde demais quando algo está degradado |
| Painel obrigatório como página de Settings     | Misturado com configs gerais; melhor rota dedicada     |

**Decisão consolidada:** **hub dedicado `/app/sdr` com 5 abas, KPIs + gráficos + drill-down, editor centralizado de templates, settings consolidados, alertas proativos.**

---

## Escopo

### Incluído

- ✅ Rota `/app/sdr` substituindo placeholder do PRD-003 (Owner/Gestor; redirect para `/app/inicio` se sem permissão)
- ✅ `DashboardLayout` com header e 5 abas (Tabs do shadcn)
- ✅ **Aba Visão Geral**:
  - 4 KPIs principais com tendência
  - Gráfico de linha de volume diário (Recharts)
  - Gráfico pizza de `finishReason` (Recharts)
  - Banner de alertas críticos
- ✅ **Aba Histórico**:
  - Tabela paginada de `ISdrSession` (30/página)
  - 6 filtros + ordenação + URL sync
  - Modal `<SdrSessionDetailModal>` com timeline e trace completo
  - Botão "Ir para conversa" no modal
- ✅ **Aba Métricas**:
  - Heatmap de volume (7×24 em SVG nativo, reusando padrão PRD-014)
  - Bar chart FAQ resolvido vs escalado
  - Pie chart motivos de escalação
  - Bar chart TTFR por modo
- ✅ **Aba Templates**:
  - Listagem agrupada de todos templates (~20+)
  - Editor inline com syntax highlight para variáveis
  - Preview ao vivo com variáveis exemplo
  - Botão "Restaurar default"
  - Salvar individual ou em massa
- ✅ **Aba Configurações**:
  - Toggle SDR Ativo
  - Sliders e inputs consolidando settings PRDs 020-023
  - Botão "Salvar configurações" único
- ✅ Header global: filtros (período, loja), botão "Abrir simulador", badge status SDR
- ✅ Alertas calculados (taxa subindo, intent unknown frequente, templates não personalizados)
- ✅ Audit log em todas mutations (templates, settings)
- ✅ Geradores de mock: 100 sessões SDR históricas variadas
- ✅ Integração com PRD-014: alertas SDR críticos aparecem no painel do gestor

### Excluído

- ❌ Export de dados em CSV/PDF — Fase 2 (placeholder)
- ❌ Comparativo cross-período lado a lado — Fase 2
- ❌ A/B testing de templates — Fase 2
- ❌ Forecasting / predição de volume — Fase 2
- ❌ Customização da ordem de templates / criação de novos triggers — Fase 2
- ❌ Histórico de versões de templates (rollback) — Fase 2
- ❌ Análise sentimental de conversas SDR — Fase 2
- ❌ Dashboard executivo de conversão final (orçamento → pedido) — Bloco 4 (PRD-041)
- ❌ Alertas via email/SMS quando algo crítico acontece — Fase 2
- ❌ Personas de SDR por canal (WhatsApp vs Site) — Fase 2

---

## Requisitos Funcionais

### Página e abas

- **RF-001:** Criar `SdrDashboardPage` em `src/features/sdr-dashboard/pages/`, rota `/app/sdr`.
- **RF-002:** Protegida por `<GuardedRoute permission={{ resource: 'sdr', action: 'view' }}>` — Owner/Gestor.
- **RF-003:** Tabs do shadcn com 5 abas; default = Visão Geral.
- **RF-004:** Header global:
  - Título "Agente SDR"
  - Filtros: Período (hoje/7d/30d/personalizado), Loja (Owner only)
  - Botão "Abrir simulador" navegando para `/app/configuracoes/sdr/simulador` (PRD-020)
  - Badge: "SDR Ativo" (verde) / "SDR Pausado" (cinza)

### Aba Visão Geral

- **RF-005:** 4 cards de KPI (mesmo `<KpiCard>` do PRD-014):
  - Sessões atendidas: contagem total
  - Taxa de escalação: % `finishReason='escalated'` (menor é melhor)
  - Taxa de aceite de orçamento: % de quotes SDR aceitos (maior é melhor)
  - TTFR médio: tempo médio até resposta humana (menor é melhor)
- **RF-006:** Gráfico de linha (Recharts `LineChart`) mostrando volume diário no período.
- **RF-007:** Gráfico pizza (Recharts `PieChart`) com distribuição de `finishReason`.
- **RF-008:** Banner de alertas no topo (se houver):
  - "Taxa de escalonamento subiu X% nos últimos 7 dias" se variação > 20%
  - "SDR teve N+ sessões com intent='unknown' na última hora" se N > 5
  - "Templates default não personalizados" (info, primeira vez)

### Aba Histórico

- **RF-009:** Tabela paginada (30/página) de `ISdrSession`.
- **RF-010:** Colunas: avatar, cliente, início (relativo), duração, estado final, motivo término, peça? (badge), orçamento? (badge), vendedor escalado (se aplicável), ações.
- **RF-011:** Filtros:
  - Período
  - Estado final (multi-select: completed/escalated/abandoned/paused_by_human)
  - Motivo escalação (se aplicável)
  - Vendedor escalado (autocomplete)
  - Loja (Owner)
  - Tem orçamento / sem orçamento (radio)
- **RF-012:** Ordenação por colunas (default: início desc).
- **RF-013:** URL sync de filtros, ordenação, página.

### Modal de detalhes da sessão

- **RF-014:** Criar `<SdrSessionDetailModal>` em `src/features/sdr-dashboard/components/`.
- **RF-015:** Conteúdo:
  - Header: cliente, início, duração, estado final
  - Timeline cronológica com turnos: timestamp, state, intent detectada, template usado, dados coletados (diffs)
  - Resumo: peça identificada (link para detalhe se houver), orçamento gerado (link), escalação (link)
  - Botões: "Ir para conversa", "Baixar trace" (placeholder Fase 2)
- **RF-016:** Trace completo expansível (accordion ou seção colapsável).

### Aba Métricas

- **RF-017:** Heatmap volume (7×24) SVG nativo, reusando padrão do PRD-014. Click em célula filtra histórico pelo intervalo.
- **RF-018:** Bar chart FAQ resolvido vs escalado (Recharts `BarChart`): agrupa por categoria de FAQ.
- **RF-019:** Pie chart motivos de escalação distribuídos.
- **RF-020:** Bar chart TTFR por modo (urgent / normal / standard).
- **RF-021:** Todos os 4 gráficos respeitam filtros globais (período, loja).

### Aba Templates

- **RF-022:** Listagem agrupada de todos templates em accordions:
  - Saudação (3 templates)
  - Qualificação (2 templates)
  - FAQ (4 templates)
  - Identificação (3 templates)
  - Orçamento (5 templates)
  - Escalonamento (1 template)
  - Despedida (2 templates)
- **RF-023:** Para cada template:
  - Trigger (read-only)
  - Textarea editável com syntax highlight para `{{var}}` (color destacado)
  - Lista de variáveis disponíveis abaixo com descrição
  - Painel direito: preview ao vivo (textarea editável → preview re-render)
  - Botão "Restaurar default"
- **RF-024:** Botão "Salvar template" individual; botão "Salvar todos" no topo.
- **RF-025:** Audit log em cada save (action='sdr_template_update', resource='template', before/after).
- **RF-026:** Validação: template sem variáveis essenciais → alerta.

### Aba Configurações

- **RF-027:** Seções:
  - **Geral**: toggle SDR Ativo, modo operação (link cruzado PRD-013)
  - **Orçamento (PRD-022)**: validade default (slider 1-30 dias), desconto autorizado (slider 0-10%), frete preliminar (link cruzado para edição)
  - **Escalonamento (PRD-023)**: timeout urgent (1-30 min), timeout normal (5-60 min), tempo antes broadcast (10-120s)
  - **Identificação (PRD-021)**: confiança mínima para auto-confirm (0.7-1.0 slider), equivalências (sempre / só mais barato / nunca)
  - **Templates**: link cruzado para aba Templates
- **RF-028:** Botão único "Salvar configurações" — agrupa mudanças em uma única transação + 1 audit log com resumo das alterações.
- **RF-029:** Confirmação se há mudanças críticas (ex: desligar SDR globalmente): "Confirma desligar o SDR? Todas as conversas novas serão direcionadas a vendedores humanos."

### Alertas no painel

- **RF-030:** Hook `useSdrAlerts()`:
  - Compara taxa de escalação última semana vs semana anterior — se variação > 20%, alerta
  - Conta intents 'unknown' nas últimas 60 minutos — se > 5, alerta
  - Verifica se templates estão default — alerta info
- **RF-031:** Banner colorido por severidade (amarelo/vermelho/info).
- **RF-032:** Alertas críticos também aparecem no PRD-014 (Painel Gestor — integração).

### Filtros globais

- **RF-033:** Filtros do header (período, loja) aplicam a todas as abas.
- **RF-034:** Sincronizado em URL.
- **RF-035:** Mudança de filtro re-executa hooks de todas as abas reativamente.

### Permissões

- **RF-036:** **Owner**: tudo — visualiza, edita templates, edita configs.
- **RF-037:** **Gestor**: visualiza (Visão Geral, Histórico, Métricas); templates e configs read-only com banner "Edição requer permissão de Owner".
- **RF-038:** **Vendedor/SDR/Cliente/Financeiro**: bloqueado via GuardedRoute.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Painel renderiza em < 700ms com 100 sessões mockadas; abas adicionais lazy-load.
- **RNF-002 (Memorização):** Cálculos de métricas memoizados via `useMemo`.
- **RNF-003 (Responsividade):** Mobile usável; gráficos com altura adaptativa; abas em scroll horizontal se cabe.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA; navegação por teclado entre abas; gráficos com tabela alternativa para screen readers.
- **RNF-005 (Tipagem):** Zero `any`; templates tipados.

---

## Critérios de Aceitação

### Painel geral

```gherkin
DADO que sou Owner e acesso /app/sdr
QUANDO a página carrega
ENTÃO vejo header com filtros + 5 abas
  E aba Visão Geral ativa por default

DADO que sou Vendedor
QUANDO tento acessar /app/sdr
ENTÃO sou redirecionado (sem permissão)

DADO que sou Gestor
QUANDO acesso /app/sdr e clico aba Templates
ENTÃO vejo templates listados mas com banner "Edição requer permissão de Owner"
  E inputs estão disabled
```

### Visão Geral — KPIs

```gherkin
DADO 100 sessões no período
  E 35 escalated, 50 completed, 15 abandoned
QUANDO Visão Geral carrega
ENTÃO vejo:
  - Sessões: 100 com tendência (vs período anterior)
  - Taxa escalação: 35% (vermelho se subiu)
  - Taxa aceite quote: calculado de IQuote com origin='sdr' e status='aceito'
  - TTFR médio: cálculo via PRD-023 metrics
  E gráfico de linha mostra volume diário
  E pizza mostra distribuição finishReason
```

### Histórico

```gherkin
DADO 100 sessões mockadas
QUANDO acesso aba Histórico
ENTÃO vejo tabela paginada 30/página com 4 páginas
  E filtros disponíveis no topo

DADO aplico filtro "Estado final = escalated"
QUANDO filtro aplica
ENTÃO tabela mostra apenas 35 sessões
  E URL atualiza

DADO clico em uma sessão
QUANDO modal abre
ENTÃO vejo cliente, duração, timeline de turnos
  E trace completo expansível
  E botão "Ir para conversa" navega para conversa correspondente
```

### Métricas detalhadas

```gherkin
DADO sessões com horários variados nos últimos 30 dias
QUANDO acesso aba Métricas
ENTÃO heatmap mostra padrões (ex: pico segunda 14h-18h)
  E bar chart FAQ vs escalação mostra resolução por categoria
  E pie chart motivos escalação detalha
  E bar TTFR por modo

DADO clico em célula do heatmap (terça 22h)
QUANDO ação processa
ENTÃO navega para histórico filtrado pelo intervalo correspondente
```

### Templates

```gherkin
DADO acesso aba Templates como Owner
QUANDO vejo accordion "Saudação"
ENTÃO posso expandir e ver 3 templates (saudacao, identificacao_nome, identificacao_empresa)
  E cada um tem editor com syntax highlight para {{var}}
  E preview à direita atualiza ao editar

DADO edito template "saudacao" para versão mais formal e salvo
QUANDO save processa
ENTÃO toast confirma
  E audit log registra (before/after)
  E próximas sessões SDR usam novo template

DADO clico "Restaurar default" num template editado
QUANDO confirmo
ENTÃO template volta ao texto original
  E audit log registra
```

### Configurações

```gherkin
DADO desligo toggle "SDR Ativo"
QUANDO save processa
ENTÃO confirmação: "Confirma desligar o SDR? ..."
  E ao confirmar, IPlatformSettings.sdrEnabled = false
  E novas conversas não são mais atribuídas ao SDR

DADO mudo validade default de 7 para 14 dias E salvo
QUANDO save processa
ENTÃO próximos quotes SDR usam 14 dias de validade
  E audit log registra com sumário
```

### Alertas

```gherkin
DADO taxa escalação última semana = 45%, semana anterior = 30%
QUANDO useSdrAlerts roda
ENTÃO banner aparece: "Taxa de escalonamento subiu 50% nos últimos 7 dias"
  E mesmo alerta aparece no PRD-014 (Painel Gestor)

DADO templates ainda em valores default (Owner nunca editou)
QUANDO acesso o painel primeira vez
ENTÃO banner info: "Templates default não personalizados — personalize para uma voz GALLO"
```

### Cenários de erro

```gherkin
DADO acesso painel sem nenhuma sessão SDR (mocks vazio)
QUANDO Visão Geral renderiza
ENTÃO KPIs mostram zero
  E gráficos mostram "Sem dados no período"
  E sem alertas críticos

DADO falha ao salvar template
QUANDO save rejeita
ENTÃO toast erro: "Não foi possível salvar. Tente novamente."
  E botão Salvar reabilitado
```

---

## Fases de Implementação

| Fase | Objetivo                                                  | Arquivos Estimados |
| ---- | --------------------------------------------------------- | ------------------ |
| 1    | Página, header global, navegação entre abas + Visão Geral | 6-8                |
| 2    | Aba Histórico + modal de detalhes                         | 5-6                |
| 3    | Aba Métricas (4 gráficos)                                 | 5-6                |
| 4    | Aba Templates (editor + preview)                          | 5-6                |
| 5    | Aba Configurações + alertas + polish                      | 4-5                |

### Detalhamento das Fases

#### Fase 1: Estrutura e Visão Geral

- [ ] `SdrDashboardPage` com `DashboardLayout` e 5 Tabs
- [ ] Header global (filtros, badge, botão simulador)
- [ ] 4 KPIs com `<KpiCard>` reusado do PRD-014
- [ ] Gráfico linha (Recharts) e pizza (Recharts)
- [ ] Hook agregador `useSdrDashboard(filters)` consumindo hooks dos PRDs 020/022/023
- [ ] URL sync de filtros

**Validação:** acessar painel mostra KPIs corretos baseados em mocks.

#### Fase 2: Histórico

- [ ] Tabela `<SdrSessionsTable>` paginada com 6 filtros
- [ ] URL sync de filtros/ordenação/página
- [ ] Modal `<SdrSessionDetailModal>` com timeline e trace
- [ ] Navegação para conversa no botão "Ir para conversa"

**Validação:** 100 sessões mockadas listadas; modal mostra trace completo; navegação funciona.

#### Fase 3: Métricas

- [ ] Heatmap SVG nativo 7×24 (reusar do PRD-014)
- [ ] Bar chart FAQ vs escalação
- [ ] Pie motivos escalação
- [ ] Bar TTFR por modo
- [ ] Drill-down via click em célula do heatmap

**Validação:** gráficos refletem dados; drill-down funciona.

#### Fase 4: Templates

- [ ] Listagem agrupada em accordions
- [ ] Editor com syntax highlight (lib leve tipo react-syntax-highlighter ou regex visual simples)
- [ ] Preview ao vivo com variáveis exemplo
- [ ] Restaurar default
- [ ] Salvar individual / em massa
- [ ] Audit log em cada mudança

**Validação:** editar template e ver mudança refletida em próxima sessão SDR (validar via simulador PRD-020).

#### Fase 5: Configurações e Alertas

- [ ] Aba Configurações com todas as seções
- [ ] Toggle SDR + confirmação ao desligar
- [ ] Salvar atômico com 1 audit log com sumário
- [ ] Hook `useSdrAlerts()` calculando 3 tipos de alerta
- [ ] Banner colorido por severidade
- [ ] Mobile responsivo
- [ ] Documentação `docs/sdr-dashboard.md`

**Validação:** configurações salvas refletem em outras telas; alertas calculam corretamente.

---

## Dependências

### PRDs Anteriores

| PRD                                          | Status      |
| -------------------------------------------- | ----------- |
| PRD-002                                      | 📝 Redigido |
| PRD-003 (DashboardLayout)                    | 📝 Redigido |
| PRD-005 (Provider)                           | 📝 Redigido |
| PRD-006 (RBAC, audit)                        | 📝 Redigido |
| PRD-014 (Painel Gestor — integração alertas) | 📝 Redigido |
| PRD-020 (engine + simulador)                 | 📝 Redigido |
| PRD-021 (identificação)                      | 📝 Redigido |
| PRD-022 (orçamento)                          | 📝 Redigido |
| PRD-023 (escalonamento)                      | 📝 Redigido |

### Serviços Externos

| Serviço                              | Status |
| ------------------------------------ | ------ |
| Recharts (já instalado pelo PRD-014) | OK     |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-14   | PRDs 010-023 | 📝           |
| **15** | **PRD-024**  | **🔄 ATUAL** |

> **Marco:** com este PRD, **Bloco 2 (SDR) está completo**.

---

## Considerações de Segurança

### Edição de templates impacta produção

Mudança em template aplica imediatamente nas próximas sessões SDR. Audit log obrigatório; confirmação visível em mudanças críticas (template de orçamento, escalonamento).

### Desligar SDR globalmente

Toggle "SDR Ativo" em config tem impacto profundo — sem SDR, conversas fora do horário ficam sem atendimento. Confirmação forte: "Confirma desligar?".

### Acesso restrito

Owner/Gestor only. Vendedor não vê dados agregados do SDR. Métricas têm PII inerente — protegida via permissões.

---

## Fluxos de Usuário

### Fluxo Principal — Owner monitora SDR semanalmente

1. João Gallo abre `/app/sdr`
2. Vê Visão Geral: 250 sessões última semana, 38% escalação
3. Banner alerta: "Taxa escalação subiu 20%"
4. Vai para Métricas → vê heatmap, identifica pico segunda 22h-2h (clientes mandando madrugada)
5. Vai para Histórico → filtra "Estado=escalated, motivo=sdr_failed"
6. Click em 3 sessões para entender padrão → vê que SDR não entende clientes pedindo "preço"
7. Vai para Templates → edita template `pergunta_necessidade` para incluir "preço" como hint
8. Salva → audit log
9. Próxima semana: taxa cai para 32%

### Fluxo Alternativo — Gestor consulta carga

1. Marina acessa `/app/sdr` (Gestor)
2. Vê KPIs (sem poder editar)
3. Quer entender quais conversas escalaram nas últimas 24h
4. Aba Histórico → filtro período 24h, estado escalated
5. Vê 12 sessões → revisa cada uma rapidamente via modal
6. Identifica 3 que deveriam ter sido resolvidas pelo SDR
7. Comunica ao Owner: "João, podia ajustar template X"

### Fluxo Mobile

1. Owner em casa, abre painel no celular
2. Aba Visão Geral cabe (KPIs em 2×2, gráficos abaixo)
3. Aba Histórico: tabela com scroll horizontal
4. Aba Templates: cada accordion em coluna única, editor adapta
5. Configurações: sliders e toggles funcionais touch

### Fluxo de Erro — falha em salvar templates em massa

1. Owner edita 5 templates e clica "Salvar todos"
2. 4 salvam, 1 falha (validação)
3. Toast: "4 templates salvos. 1 falhou: [nome] — variável `{{produto}}` não existe."
4. Owner corrige, salva individualmente

---

## Convenções de Código

| Elemento        | Convenção           | Exemplo                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------- |
| **Página**      | PascalCase + `Page` | `SdrDashboardPage`                                                  |
| **Componentes** | PascalCase          | `<SdrSessionsTable>`, `<SdrSessionDetailModal>`, `<TemplateEditor>` |
| **Hooks**       | camelCase + `use`   | `useSdrDashboard`, `useSdrAlerts`, `useSdrTemplates`                |
| **Pasta**       | kebab-case          | `sdr-dashboard/`, `tabs/`, `components/`                            |
| **Git commits** | Conventional        | `feat(sdr-dashboard): add comprehensive SDR hub with 5 tabs`        |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                           | Descrição                                                    |
| ----------------------------------- | ------------------------------------------------------------ |
| **Hub centralizado**                | Todo SDR em um lugar; Owner não navega 5 telas               |
| **Drill-down sempre**               | Métricas viram concretas via exemplos                        |
| **Templates editáveis com preview** | Não publicar texto que não foi testado visualmente           |
| **Settings consolidados**           | Edição em 1 lugar; outras telas referenciam                  |
| **Alertas proativos**               | Não esperar usuário descobrir; mostrar o que precisa atenção |
| **Diferenciação de painéis**        | Operacional SDR ≠ operacional geral ≠ estratégico            |

### O que NÃO Fazer

| ❌ Evitar                                                                       |
| ------------------------------------------------------------------------------- |
| Misturar métricas de vendas/margem aqui — Bloco 4                               |
| Implementar export PDF/CSV real — Fase 2 placeholder                            |
| Permitir edição de templates por Gestor (apenas Owner)                          |
| Esquecer confirmação ao desligar SDR globalmente                                |
| Esquecer audit log em mudanças de template                                      |
| Mobile esquecido — Owner pode usar do celular                                   |
| Cores como único indicador (acessibilidade)                                     |
| Implementar features dos outros PRDs aqui — apenas consumir métricas e settings |
| Histórico de versões de template — Fase 2                                       |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                              |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 25/05/2026 | v1     | Criação inicial — hub central do SDR com 5 abas (visão geral, histórico, métricas, templates, configurações), alertas proativos, drill-down em sessões |

---

**AILA - Sistemas Inteligentes**
