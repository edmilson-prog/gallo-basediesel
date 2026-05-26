# PRD-014: Painel do Gestor — Métricas e Saúde da Carteira

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                    |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                         |
| **Objetivo**          | Construir o painel **operacional** do Gestor — visão em tempo real da saúde do atendimento (conversas, vendedores, carteira) com métricas, distribuição de carga, alertas e drill-down — distinto e complementar ao BI **estratégico** da Onda 2 (PRD-040+) |
| **Tipo**              | Feature                                                                                                                                                                                                                                                     |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                        |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                           |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                        |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                                                      |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-011 (Conversa), PRD-013 (Distribuição), PRD-018 (Carteira), PRD-040 (Visão Executiva — Onda 2)                                                                                                                                         |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                                                            |
| **Padrão de código**  | Feature-based; código em `src/features/manager-dashboard/`; layout `DashboardLayout` do PRD-003                                                                                                                                                             |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** 7 widgets de métricas com cálculos derivados (TMA, TMR, taxa de resolução, SLA, backlog, distribuição de carga, saúde da carteira), heatmap visual de volume com 7 dias × 24 horas, sistema de alertas configuráveis com 3 tipos default, drill-down navegando para inbox filtrada / lista de clientes filtrada, filtros combinados (período, vendedor, loja, canal), atualização em tempo real conforme novas mensagens chegam (PRD-010 real-time), e diferenciação explícita do BI estratégico que vem na Onda 2.

---

## Contexto do Problema

O Gestor da GALLO BASE DIESEL (no MVP, equivalente a "supervisor da equipe comercial") tem responsabilidade direta pela **operação diária** de atendimento. Hoje, sem painel dedicado, ele:

- Pergunta diariamente: "Quantas conversas estão sem resposta?" — sem resposta automatizada
- Não sabe quem está sobrecarregado vs ocioso
- Descobre que cliente A da curva ABC virou dormente só quando ele liga reclamando
- Avalia performance da equipe via "feeling" ou perguntando

Três problemas concretos que o PRD-014 resolve:

**Falta de visão operacional em tempo real.** O Gestor precisa saber **agora** se a carga está ok, se há gargalos, se vai precisar entrar para ajudar. Painel deve ser "olhar de 5 segundos" — números grandes, cores semânticas, sem fricção. **Confusão entre operacional e estratégico.** O BI da Onda 2 (PRD-040+) responde "Como vai a empresa?" (vendas, margem, DRE). Este PRD responde "Como vai o atendimento de hoje?" (TMA, backlog, SLA). São perguntas diferentes, telas diferentes, dependem de dados diferentes. Forçar tudo em uma tela só vira poluição. **Saúde da carteira invisível.** Quantos clientes estão dormentes? Quantos vão entrar em recuperação? Quantos A da curva ABC não compram há mais de X dias? Sem essas métricas, gestão de carteira é reativa.

Este PRD entrega: painel com 7 widgets de métricas operacionais, heatmap de volume, lista de alertas ativos, distribuição de carga por vendedor, e filtros para drill-down.

---

## Diferenciação clara: Operacional vs Estratégico

| Eixo                      | Este PRD (014 - Operacional)           | PRD-040 e Bloco 4 (Estratégico)                   |
| ------------------------- | -------------------------------------- | ------------------------------------------------- |
| **Pergunta que responde** | "Como vai o atendimento agora?"        | "Como vai a empresa este mês/trimestre?"          |
| **Atualização**           | Tempo real (segundos)                  | Diária/Semanal                                    |
| **Audiência**             | Gestor e Owner                         | Owner principalmente                              |
| **Tipo de decisão**       | Operacional (entrar para ajudar agora) | Estratégica (mudar preço, mudar comissão)         |
| **Métricas exemplo**      | TMA, TMR, SLA, backlog, carga atual    | Faturamento, margem, ticket médio, ROI, comissões |
| **Granularidade**         | Por minuto/hora/dia                    | Por semana/mês/trimestre                          |
| **Onda**                  | Onda 1                                 | Onda 2                                            |

São complementares, não concorrentes. O Owner pode usar os dois — o Gestor essencialmente vive no operacional.

---

## Conceito da Solução

### Layout

Página em `/app/inicio` para Owner/Gestor (substituindo placeholder do PRD-003) usando `DashboardLayout`:

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: "Painel do Gestor"  [Filtros▾]  [Período: Hoje▾]  [⚙]  │
├─────────────────────────────────────────────────────────────────┤
│ Linha 1: KPIs principais (4 cards)                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│  │ TMA     │ │ TMR     │ │ Taxa    │ │ Backlog │                │
│  │ 18 min  │ │ 4 min   │ │ Resol.  │ │ 12      │                │
│  │ ▼ 12%   │ │ ▲ 3%    │ │ 87%     │ │ aguard. │                │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
├─────────────────────────────────────────────────────────────────┤
│ Linha 2: Carga + Heatmap                                         │
│  ┌──────────────────────┐  ┌──────────────────────────────┐     │
│  │ Carga por vendedor   │  │ Heatmap volume (7d × 24h)    │     │
│  │ Carlos     ████████  │  │  Seg ▒░▒▓▓▓▓▓▓▒░░░░░...      │     │
│  │ Marina     █████     │  │  Ter ░▒▒▓▓▓▓▓▒░░░...         │     │
│  │ Rafael     ██        │  │  ...                          │     │
│  └──────────────────────┘  └──────────────────────────────┘     │
├─────────────────────────────────────────────────────────────────┤
│ Linha 3: Saúde da Carteira + Alertas                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐     │
│  │ Saúde carteira (pie) │  │ Alertas ativos (3)           │     │
│  │  Ativo: 60%          │  │ ⚠ Cliente A dormente: Aurora │     │
│  │  Dormente: 25%       │  │ ⚠ Carlos sobrecarregado      │     │
│  │  Recup: 10%          │  │ ⚠ 3 conversas > 4h sem resp. │     │
│  │  Perdido: 5%         │  │                               │     │
│  └──────────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Os 7 widgets

| #   | Widget                               | Dados                                                     | Cálculo                                                              |
| --- | ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | **TMA** (Tempo Médio de Atendimento) | Conversas resolvidas no período                           | Média do tempo entre 1ª mensagem in e marcação como `resolvida`      |
| 2   | **TMR** (Tempo Médio de Resposta)    | Mensagens out no período                                  | Média do tempo entre mensagem in e primeira mensagem out do vendedor |
| 3   | **Taxa de Resolução**                | Conversas abertas vs resolvidas no período                | (resolvidas / total abertas) × 100                                   |
| 4   | **Backlog**                          | Conversas com status `aguardando` agora                   | Contagem absoluta                                                    |
| 5   | **Carga por Vendedor**               | Conversas ativas (aguardando + em_andamento) por vendedor | Barras horizontais                                                   |
| 6   | **Heatmap de Volume**                | Mensagens in agrupadas por dia da semana × hora do dia    | Grid 7×24 com intensidade de cor                                     |
| 7   | **Saúde da Carteira**                | Distribuição dos clientes por status do ciclo de vida     | Gráfico pizza ou donut                                               |

### Indicadores de tendência

Cards de KPI (TMA, TMR, Taxa de Resolução) mostram tendência comparada ao período anterior:

- **▼ X%** verde se métrica melhorou (ex: TMR menor é melhor)
- **▲ X%** vermelho se piorou
- **= 0%** neutro

Lógica adaptativa: para TMR/TMA/Backlog, **menos é melhor**; para Taxa de Resolução, **mais é melhor**. Cores invertidas automaticamente.

### Sistema de alertas

Lista de alertas ativos no momento. 3 tipos default (configuráveis no painel):

| Alerta                            | Trigger                                          | Severidade |
| --------------------------------- | ------------------------------------------------ | ---------- |
| **Cliente A dormente**            | Cliente com `abcClass: 'A'` e status `dormente`  | Alta       |
| **Vendedor sobrecarregado**       | Vendedor com > N conversas ativas (default N=15) | Média      |
| **Conversa sem resposta há > Xh** | Conversa em `aguardando` há > 4h (configurável)  | Crítica    |

Cada alerta tem:

- Ícone temático + cor de severidade
- Mensagem curta com dados específicos ("Aurora Transportes inativa há 95 dias")
- Botão "Ver" navega para o registro relevante (ficha, inbox filtrada, lista de clientes)
- Botão "Dispensar" oculta o alerta por 24h

### Filtros globais

Painel todo respeita filtros aplicados no topo:

| Filtro       | Opções                                                |
| ------------ | ----------------------------------------------------- |
| **Período**  | Hoje (default), Ontem, 7 dias, 30 dias, Personalizado |
| **Vendedor** | Todos, ou um específico                               |
| **Loja**     | Todas (Owner), Loja ativa (Gestor)                    |
| **Canal**    | Todos, WhatsApp, E-commerce, Telefone, Site           |

Mudança em qualquer filtro recalcula todos os widgets reativamente.

### Drill-down

Cada widget é clicável e navega para a tela contextual:

| Click em                            | Vai para                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------- |
| TMA / TMR / Taxa de Resolução       | Lista de conversas que compõem a métrica (PRD-010 com filtro pré-aplicado) |
| Backlog                             | Inbox filtrada por status `aguardando`                                     |
| Carga de vendedor X                 | Inbox filtrada por `assignedSellerId: X`                                   |
| Heatmap (célula)                    | Inbox filtrada pelo intervalo de tempo da célula                           |
| Pizza saúde — fatia "Dormente"      | Lista de clientes (PRD-015) filtrada por status `dormente`                 |
| Alerta "Cliente A dormente: Aurora" | Ficha do cliente (PRD-012)                                                 |
| Alerta "Vendedor sobrecarregado"    | Inbox filtrada por aquele vendedor                                         |
| Alerta "Conversa > 4h sem resp."    | Inbox filtrada por tempo de espera                                         |

### Atualização em tempo real

Widgets atualizam reativamente:

- Métricas (TMA/TMR/Taxa/Backlog): recalculam a cada nova mensagem que chega via real-time do PRD-010
- Carga: recalcula em tempo real conforme conversas mudam status
- Alertas: recalculam a cada 30s (lightweight)
- Heatmap: atualiza no fim de cada hora (acumulando dados)

### Permissões

- **Owner**: acessa o painel, vê todos os dados de todas as lojas
- **Gestor**: acessa o painel, vê apenas dados da loja ativa
- **Vendedor**: **não tem acesso** a este painel — vê apenas inbox (PRD-010)
- **SDR/Cliente/Financeiro/VendedorExterno**: sem acesso

### Configuração de alertas (Owner only)

Botão ⚙ no header abre modal de configuração:

- Limiar de "Conversa sem resposta" (default 4h)
- Limiar de "Vendedor sobrecarregado" (default 15 conversas)
- Habilitar/desabilitar cada tipo de alerta
- Frequência de polling de alertas (30s default)

### Alternativas Consideradas

| Alternativa                                        | Por que foi descartada                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Misturar este painel com PRD-040 (Visão Executiva) | São audiências e perguntas diferentes; Onda 2 trataria de tudo, atrasando |
| Sem heatmap                                        | Volume horário é insight crítico para planejar escala de vendedores       |
| Sem drill-down                                     | Métrica sem ação é só decoração                                           |
| Atualização polling de 5min                        | Operacional precisa ser ~tempo real (segundos)                            |
| Sem alertas                                        | Métricas reativas; alertas viram proativos                                |
| Métricas apenas numéricas (sem gráficos)           | Heatmap e pie são naturalmente visuais — números brutos perdem o ponto    |

**Decisão consolidada:** **7 widgets organizados em 3 linhas, atualização em tempo real, 3 alertas default configuráveis, drill-down em todo lugar, audiência Owner+Gestor.**

---

## Escopo

### Incluído

- ✅ Rota `/app/inicio` para Owner/Gestor (substituindo placeholder genérico do PRD-003)
- ✅ `DashboardLayout` (PRD-003) com 3 linhas e 7 widgets
- ✅ Componentes de widget:
  - `<KpiCard title value trend>` para TMA, TMR, Taxa de Resolução, Backlog
  - `<SellerLoadList>` com barras horizontais
  - `<VolumeHeatmap>` com grid 7 × 24
  - `<CarteiraHealthDonut>` com pizza colorida por status
  - `<ActiveAlertsList>` com lista de alertas e ações
- ✅ Hooks para cálculos derivados:
  - `useTma(filters)`, `useTmr(filters)`, `useResolutionRate(filters)`, `useBacklog(filters)`
  - `useSellerLoad(filters)`, `useVolumeHeatmap(filters)`, `useCarteiraHealth(filters)`
  - `useActiveAlerts()`
- ✅ Header com filtros globais (período, vendedor, loja, canal) sincronizados em URL
- ✅ Tendências (▼/▲/=) nas KPIs comparando com período anterior
- ✅ Drill-down em cada widget navegando para PRDs específicos (PRD-010, PRD-012, PRD-015) com filtros pré-aplicados
- ✅ 3 alertas default: Cliente A dormente, Vendedor sobrecarregado, Conversa > Xh sem resposta
- ✅ Modal de configuração de alertas (Owner only) com limites editáveis
- ✅ Persistência das configurações em `IPlatformSettings.managerDashboard`
- ✅ Atualização em tempo real conforme novas mensagens chegam (via real-time do PRD-010)
- ✅ Recharts (ou similar leve) para pizza e gráfico simples
- ✅ Heatmap implementado em SVG nativo (simples, performático)
- ✅ Responsividade: grid 4-2-2 em desktop, 2-1-1 em tablet, 1-1-1 (stack) em mobile
- ✅ Skeleton states durante fetch inicial
- ✅ Audit log em mudanças de configuração de alertas

### Excluído

- ❌ Métricas de vendas/faturamento/margem — pertence ao Bloco 4 (PRD-040+)
- ❌ DRE Gerencial, Rentabilidade — Bloco 4
- ❌ Ranking detalhado de vendedores — PRD-043 (Onda 2)
- ❌ Comissões — PRD-047 (Onda 2)
- ❌ Forecasting/previsões de futuro — Fase 2
- ❌ Comparativo entre múltiplos períodos lado-a-lado — fora do MVP
- ❌ Export de relatório em PDF — Fase 2
- ❌ Email automático diário do painel — Fase 2
- ❌ Alertas push para celular — Fase 2
- ❌ Histórico de alertas dispensados — fora do MVP
- ❌ Aprofundamento por cliente individual no painel — usar drill-down para ficha

---

## Requisitos Funcionais

### Layout e roteamento

- **RF-001:** Substituir placeholder de `/app/inicio` (PRD-003) por `ManagerDashboardPage` quando user é Owner ou Gestor. Vendedor mantém placeholder informativo "Você não tem acesso ao painel do gestor — use a inbox para suas conversas".
- **RF-002:** Página usa `DashboardLayout` do PRD-003 com 3 linhas, distribuição responsiva.
- **RF-003:** Header da página com título "Painel do Gestor", filtros (período/vendedor/loja/canal), botão ⚙ (Owner only) para configurar alertas.

### KPIs principais (Linha 1)

- **RF-004:** Implementar `<KpiCard title value trend changePct?>` que renderiza valor grande + ícone de tendência (▼ verde / ▲ vermelho / = neutro) baseado em comparação com período anterior.
- **RF-005:** Para métricas onde "menor é melhor" (TMA, TMR, Backlog), tendência ▼ é verde. Para "maior é melhor" (Taxa de Resolução), ▲ é verde.
- **RF-006:** **TMA**: hook `useTma(filters)` calcula:
  - Filtra conversas com status `resolvida` no período
  - Para cada uma: tempo entre 1ª mensagem in e timestamp da mudança para `resolvida` (via audit log ou campo derivado)
  - Retorna média em minutos formatada
- **RF-007:** **TMR**: hook `useTmr(filters)` calcula:
  - Filtra todas as mensagens out no período onde o autor é seller (não SDR)
  - Para cada uma: tempo entre a mensagem in mais recente antes dela e a mensagem out
  - Retorna média em minutos formatada
- **RF-008:** **Taxa de Resolução**: hook `useResolutionRate(filters)`:
  - Total de conversas abertas no período (status criado no período OU status mudou para `em_andamento`)
  - Total de conversas resolvidas no período
  - Retorna `(resolvidas / abertas) × 100` em %
- **RF-009:** **Backlog**: hook `useBacklog(filters)`:
  - Contagem absoluta de conversas com status `aguardando` no momento atual (ignora filtro de período — é estado atual)
  - Retorna número inteiro
- **RF-010:** Cada KPI clicável navega para inbox com filtros pré-aplicados que correspondem ao critério da métrica.

### Carga por Vendedor (Linha 2)

- **RF-011:** Implementar `<SellerLoadList>` que mostra todos os vendedores da loja (Gestor) ou todas as lojas (Owner) com barras horizontais proporcionais à quantidade de conversas ativas.
- **RF-012:** Cada item: avatar + nome + número absoluto + barra colorida + badge de availability.
- **RF-013:** Cores da barra: verde (carga normal, ≤ 10), amarelo (médio, 11-15), vermelho (sobrecarga, > 15) — limites configuráveis nos alertas.
- **RF-014:** Click em vendedor navega para inbox filtrada por `assignedSellerId=X`.
- **RF-015:** Ordenação default: mais sobrecarregado primeiro.

### Heatmap de Volume (Linha 2)

- **RF-016:** Implementar `<VolumeHeatmap>` em SVG nativo com grid 7 × 24 (linhas = dias da semana, colunas = horas).
- **RF-017:** Cada célula colorida proporcionalmente à quantidade de mensagens **in** recebidas naquele dia da semana e hora, agregadas no período filtrado.
- **RF-018:** Escala de cor: branco/transparente (zero) → tons crescentes da cor de acento do tema ativo.
- **RF-019:** Hover em célula mostra tooltip: "Segunda 14h-15h: 23 mensagens".
- **RF-020:** Click em célula navega para inbox filtrada pelo intervalo correspondente.
- **RF-021:** Legenda discreta abaixo do grid mostrando escala.

### Saúde da Carteira (Linha 3)

- **RF-022:** Implementar `<CarteiraHealthDonut>` com gráfico pizza (donut) usando Recharts.
- **RF-023:** Distribuição dos clientes do escopo (`store` ou `all`) por status do ciclo de vida:
  - Ativo (verde)
  - Dormente (amarelo)
  - Recuperação (azul)
  - Perdido (vermelho/cinza)
- **RF-024:** Centro do donut mostra total absoluto de clientes.
- **RF-025:** Click em cada fatia navega para `/app/clientes?status=X` (PRD-015 com filtro pré-aplicado).
- **RF-026:** Legenda à direita do donut com quantidades absolutas e percentuais.

### Alertas Ativos (Linha 3)

- **RF-027:** Implementar `<ActiveAlertsList>` mostrando até 10 alertas ativos. Se houver mais, exibir contador "+N mais" com botão "Ver todos".
- **RF-028:** Cada alerta: ícone com cor de severidade, mensagem específica (com dados reais: "Aurora Transportes - 95 dias sem compra"), botão "Ver" (navega), botão "Dispensar" (oculta por 24h em localStorage chave `gallo-alert-dismissed-{alertHash}`).
- **RF-029:** 3 hooks de alerta:
  - `useAlertClienteADormente()`: clientes com `abcClass='A'` E `status='dormente'`
  - `useAlertVendedorSobrecarregado()`: vendedores com carga > limite configurado
  - `useAlertConversaSemResposta()`: conversas em `aguardando` há > limite configurado
- **RF-030:** Recalcular alertas a cada 30s via `setInterval` no hook.
- **RF-031:** Quando 0 alertas: EmptyState pequeno "Tudo certo no momento ✅".

### Filtros globais

- **RF-032:** Header com 4 dropdowns/inputs: Período (com date picker para personalizado), Vendedor (multi-select para Owner; locked para Gestor), Loja (apenas Owner; locked para Gestor), Canal (multi-select).
- **RF-033:** Filtros sincronizados em URL via query params: `?periodo=hoje&vendedor=carlos&loja=matriz&canal=whatsapp`.
- **RF-034:** Mudança em qualquer filtro re-executa todos os hooks de widget reativamente.

### Configuração de alertas (Owner only)

- **RF-035:** Botão ⚙ no header (Owner only) abre `<AlertSettingsModal>`.
- **RF-036:** Modal contém:
  - Limiar de "Conversa sem resposta" (slider 1h-24h, default 4h)
  - Limiar de "Vendedor sobrecarregado" (input numérico 5-50, default 15)
  - Toggle on/off por tipo de alerta
  - Frequência de recálculo (30s default; opções 15s, 30s, 60s, 5min)
- **RF-037:** Salvar via `settingsProvider.update()`; audit log emitido.
- **RF-038:** Permissão: `<GuardedRoute permission={{ resource: 'settings', action: 'edit' }}>` — apenas Owner.

### Atualização em tempo real

- **RF-039:** Métricas e widgets devem reagir automaticamente quando o real-time do PRD-010 dispara novas mensagens.
- **RF-040:** Implementar via subscription ao Zustand store do mocks; recálculo lazy via memo (`useMemo`).

### Responsividade

- **RF-041:** Desktop ≥ 1280px: layout grid 4 cards KPI / 2-2 carga+heatmap / 2-2 saúde+alertas.
- **RF-042:** Tablet 768-1279px: 2-2 KPI / 1-1 / 1-1.
- **RF-043:** Mobile < 768px: stack vertical, todos os widgets em coluna; KPIs em grade 2×2.

### Skeletons e empty states

- **RF-044:** Skeleton específico para cada widget durante fetch inicial.
- **RF-045:** Widget sem dados (período sem mensagens, vendedor sem carga): mensagem contextual ("Sem mensagens neste período").

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Painel completo renderiza em < 600ms com mocks (2200 itens).
- **RNF-002 (Tempo real):** Mudanças refletem em widgets em < 200ms após mutation no store.
- **RNF-003 (Memorização):** Cálculos pesados (heatmap, percentis) memoizados via `useMemo`; recalculam apenas quando filtros ou dados-fonte mudam.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA; gráficos têm tabela alternativa acessível por screen reader; cores não são o único indicador (severidade tem texto também).
- **RNF-005 (Responsividade):** Funcional em viewports de 360px a 1920px.
- **RNF-006 (Tipagem):** Zero `any`; cálculos retornam types específicos.

---

## Critérios de Aceitação

### Visão geral

```gherkin
DADO que sou Owner e acesso /app/inicio
QUANDO a página carrega
ENTÃO vejo Painel do Gestor com 3 linhas e 7 widgets
  E filtros default: Período=Hoje, Vendedor=Todos, Loja=Todas, Canal=Todos

DADO que sou Gestor da Matriz
QUANDO acesso /app/inicio
ENTÃO filtros estão lockados em Loja=Matriz (não vejo cross-store)
  E todos os outros filtros disponíveis

DADO que sou Vendedor
QUANDO acesso /app/inicio
ENTÃO vejo placeholder "Painel do Gestor não disponível para seu papel — use a inbox"
  E NÃO vejo nenhum dado do painel
```

### KPIs e tendências

```gherkin
DADO conversas com TMA atual de 18 min e TMA do período anterior de 20 min
QUANDO o card TMA renderiza
ENTÃO mostra "18 min" como valor
  E mostra "▼ 10%" em verde (melhorou — menor é melhor)

DADO Taxa de Resolução atual 87% e anterior 75%
QUANDO o card renderiza
ENTÃO mostra "87%" com "▲ 16%" em verde (melhorou — maior é melhor)

DADO Backlog atual 12 e ontem 5
QUANDO o card renderiza
ENTÃO mostra "12" com "▲ 140%" em vermelho (piorou — menor é melhor)
```

### Drill-down

```gherkin
DADO que clico no card "Backlog: 12"
QUANDO navegação processa
ENTÃO vou para /app/atendimento?status=aguardando
  E vejo as 12 conversas aguardando

DADO que clico na fatia "Dormente" do donut Saúde da Carteira
QUANDO navegação processa
ENTÃO vou para /app/clientes?status=dormente
  E vejo a lista filtrada

DADO que clico em "Carlos Santos" na lista de Carga
QUANDO navegação processa
ENTÃO vou para /app/atendimento?vendedor=carlos&status=ativas
```

### Alertas

```gherkin
DADO um cliente A da curva ABC com status dormente
QUANDO o hook useAlertClienteADormente roda
ENTÃO o alerta aparece na lista com mensagem "Cliente A dormente: [Nome] - [N] dias sem compra"
  E botão "Ver" navega para a ficha do cliente

DADO que clico em "Dispensar" no alerta
QUANDO a ação processa
ENTÃO alerta some da lista
  E localStorage marca esse alerta como dispensado por 24h
  E reabrir a página dentro de 24h não mostra o alerta novamente

DADO 0 alertas ativos
QUANDO a lista renderiza
ENTÃO vejo EmptyState "Tudo certo no momento ✅"
```

### Configuração de alertas

```gherkin
DADO que sou Owner e clico no botão ⚙ no header
QUANDO o modal abre
ENTÃO vejo controles para limite de conversa sem resposta, limite de sobrecarga, toggle por tipo, frequência

DADO que mudo limite de sobrecarga de 15 para 10 e salvo
QUANDO o save processa
ENTÃO settings atualizadas via auditLog
  E alertas recalculam imediatamente com novo limite
  E vendedores com 10+ conversas agora aparecem como sobrecarregados

DADO que sou Gestor
QUANDO procuro o botão ⚙
ENTÃO ele NÃO aparece (sem permissão para editar settings)
```

### Atualização em tempo real

```gherkin
DADO que estou no painel
  E real-time do PRD-010 dispara uma nova mensagem em conversa "aguardando"
QUANDO o store atualiza
ENTÃO Backlog incrementa em 1 em < 200ms
  E Heatmap atualiza a célula correspondente
  E carga do vendedor atribuído incrementa (se atribuído) ou aparece em "Em fila"
```

### Cenários de erro

```gherkin
DADO que provider de conversas falha
QUANDO um hook (ex: useBacklog) rejeita
ENTÃO o card mostra estado de erro pequeno com ícone ⚠ e tooltip "Erro ao carregar"
  E botão de "Recarregar" no card

DADO que não há dados no período (ex: filtro de período no futuro)
QUANDO widgets renderizam
ENTÃO cada um mostra mensagem contextual "Sem dados neste período"
  E gráficos não quebram
```

---

## Fases de Implementação

| Fase | Objetivo                               | Arquivos Estimados |
| ---- | -------------------------------------- | ------------------ |
| 1    | Layout, filtros e KPIs (Linha 1)       | 6-8                |
| 2    | Carga por Vendedor e Heatmap (Linha 2) | 4-5                |
| 3    | Saúde da Carteira e Alertas (Linha 3)  | 5-6                |
| 4    | Configuração de alertas e drill-down   | 4-5                |
| 5    | Responsividade, real-time, polish      | 3-4                |

### Detalhamento das Fases

#### Fase 1: Layout e KPIs

**Objetivo:** estrutura da página + 4 KPIs principais

**Ações:**

- [ ] Criar `ManagerDashboardPage` em `src/features/manager-dashboard/pages/`
- [ ] Substituir placeholder de `/app/inicio` para Owner/Gestor
- [ ] Implementar header com 4 filtros globais (período, vendedor, loja, canal)
- [ ] Sincronização URL via `useSearchParams`
- [ ] Criar `<KpiCard>` reutilizável
- [ ] Implementar 4 hooks de cálculo: `useTma`, `useTmr`, `useResolutionRate`, `useBacklog`
- [ ] Lógica adaptativa de cor de tendência (menor/maior é melhor)

**Validação:** acessar `/app/inicio` mostra header + 4 KPIs com tendências corretas.

#### Fase 2: Carga e Heatmap

**Objetivo:** visualizações de Linha 2

**Ações:**

- [ ] Implementar `<SellerLoadList>` com barras coloridas por carga
- [ ] Hook `useSellerLoad` agregando conversas ativas por vendedor
- [ ] Implementar `<VolumeHeatmap>` em SVG nativo com grid 7×24
- [ ] Hook `useVolumeHeatmap` agregando mensagens in por dia da semana × hora
- [ ] Tooltips e click handlers em cada célula

**Validação:** carga mostra todos os vendedores; heatmap mostra padrões realistas; hover funciona.

#### Fase 3: Carteira e Alertas

**Objetivo:** visualizações de Linha 3

**Ações:**

- [ ] Instalar Recharts (se ainda não instalado)
- [ ] Implementar `<CarteiraHealthDonut>` com Recharts pie chart
- [ ] Hook `useCarteiraHealth` agregando clientes por status
- [ ] Implementar 3 hooks de alerta + `useActiveAlerts` combinando
- [ ] Componente `<ActiveAlertsList>` com botões "Ver" e "Dispensar"
- [ ] Persistência de dispensa em localStorage

**Validação:** donut mostra distribuição correta; alertas aparecem para clientes A dormentes, vendedores sobrecarregados, etc.

#### Fase 4: Configuração e Drill-down

**Objetivo:** configurabilidade e navegação contextual

**Ações:**

- [ ] Criar `<AlertSettingsModal>` Owner only
- [ ] Salvar configurações em `IPlatformSettings.managerDashboard`
- [ ] Conectar drill-down em todos os widgets (KPIs, lista de carga, heatmap, donut, alertas)
- [ ] Garantir que filtros pré-aplicados nas rotas de destino funcionam (PRD-010 e PRD-015)
- [ ] Audit log em mudanças de config

**Validação:** Owner edita limite de sobrecarga; alertas refletem nova config; drill-down navega corretamente.

#### Fase 5: Real-time, Responsividade, Polish

**Objetivo:** experiência final

**Ações:**

- [ ] Conectar widgets ao real-time do PRD-010 (Zustand subscription)
- [ ] Implementar comportamento responsivo (4-2-2, 2-1-1, stack)
- [ ] Skeletons em fase de carregamento
- [ ] EmptyStates em widgets sem dados
- [ ] Validação WCAG AA, tabela alternativa para screen readers em gráficos

**Validação:** mobile usável; mudanças no store refletem em < 200ms; acessibilidade.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição               | Status      |
| ------- | ----------------------- | ----------- |
| PRD-003 | Shell (DashboardLayout) | 📝 Redigido |
| PRD-005 | Provider Pattern        | 📝 Redigido |
| PRD-006 | RBAC                    | 📝 Redigido |
| PRD-007 | Multi-Loja              | 📝 Redigido |
| PRD-010 | Inbox (real-time)       | 📝 Redigido |
| PRD-011 | Conversa                | 📝 Redigido |
| PRD-013 | Distribuição            | 📝 Redigido |

### Serviços Externos

| Serviço                          | Tipo | Status     |
| -------------------------------- | ---- | ---------- |
| `recharts` (gráfico pizza/donut) | Lib  | A instalar |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD          | Título               | Status       |
| ----- | ------------ | -------------------- | ------------ |
| 1-3   | PRDs 010-012 | Inbox/Conversa/Ficha | 📝           |
| 4     | PRD-013      | Distribuição         | 📝           |
| **5** | **PRD-014**  | **Painel do Gestor** | **🔄 ATUAL** |
| 6+    | PRDs 015-019 | Demais do Bloco 1    | ⏳           |

---

## Considerações de Segurança

### Vendedor não vê painel

Permissão explícita: Vendedor não acessa `/app/inicio` com este conteúdo. Tela placeholder explicativa, não erro.

### Dados sensíveis em alertas

Alertas exibem nomes de clientes, métricas de vendedores. Apenas Owner/Gestor têm acesso. Audit log registra mudanças nas configurações.

### Filtros respeitam scope

Gestor não consegue ver dados cross-store mesmo via URL manipulation — provider já filtra (PRD-005/006/007).

---

## Fluxos de Usuário

### Fluxo Principal — Gestor inicia o dia

1. Marina (Gestor) faz login → `/app/inicio` carrega Painel
2. Vê 4 KPIs: TMA 18 min ▼, TMR 4 min ▲, Taxa 87% ▼, Backlog 12 ▲
3. Backlog vermelho chama atenção — clica
4. Navega para inbox filtrada em status `aguardando` com 12 conversas
5. Identifica que Carlos está sobrecarregado (alerta) → vai à carga
6. Transfere 3 conversas de Carlos para Rafael (via PRD-018)
7. Volta ao painel — backlog cai, carga normalizada

### Fluxo Alternativo — Owner monitora cross-store

1. João Gallo (Owner) acessa painel
2. Filtros default: Loja=Todas
3. Vê dados consolidados das lojas (no MVP, só matriz; Fase 2 com filiais agrega)
4. Heatmap mostra pico de mensagens segunda às 14h — planeja escalar mais vendedores nesse horário
5. Donut mostra 25% dormentes — preocupante; abre tab de detalhes

### Fluxo de Alerta — Cliente A dormente

1. Cliente "Frota Express" (curva A) atinge 90 dias sem compra
2. Hook `useAlertClienteADormente` detecta na próxima recalculação
3. Alerta aparece em vermelho: "Cliente A dormente: Frota Express - 95 dias"
4. Marina vê, clica "Ver" → vai para ficha do cliente
5. Marina cria nota: "Ligar amanhã, possível recuperação"
6. Marina volta ao painel, dispensa o alerta (já tratado)

### Fluxo Mobile

1. Marina abre o painel no celular
2. Layout stack vertical com 4 KPIs em 2×2, depois widgets empilhados
3. Heatmap rola horizontalmente se não couber
4. Donut mantém legibilidade em pequeno
5. Clica em alerta → ficha do cliente em tela cheia

---

## Convenções de Código (Referência Rápida)

| Elemento             | Convenção                   | Exemplo                                                 |
| -------------------- | --------------------------- | ------------------------------------------------------- |
| **Página**           | PascalCase + sufixo `Page`  | `ManagerDashboardPage`                                  |
| **Widgets**          | PascalCase descritivo       | `<KpiCard>`, `<VolumeHeatmap>`, `<CarteiraHealthDonut>` |
| **Hooks de cálculo** | camelCase + `use` + métrica | `useTma`, `useResolutionRate`                           |
| **Pasta**            | kebab-case                  | `manager-dashboard/`                                    |
| **Git commits**      | Conventional Commits        | `feat(manager-dashboard): add KPIs and carteira health` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                        | Descrição                                                              |
| -------------------------------- | ---------------------------------------------------------------------- |
| **Operacional, não estratégico** | Foco em "agora" e "hoje"; BI estratégico fica no Bloco 4               |
| **Drill-down em tudo**           | Métrica sem ação é decoração; cada widget navega para algum lugar útil |
| **Tendência via comparação**     | Não basta o número atual; comparar com período anterior dá significado |
| **Alertas são proativos**        | Não esperar usuário descobrir; mostrar o que precisa atenção           |
| **Real-time é diferencial**      | Operacional sem real-time perde valor; conectar ao Zustand do PRD-010  |
| **Memoização agressiva**         | Cálculos pesados (heatmap) memoizar para evitar recomputo              |

### Orientações Gerais

| Aspecto                    | Orientação                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| **Recharts vs SVG nativo** | Pizza/donut usar Recharts (bonito out-of-the-box); heatmap fazer em SVG nativo (mais flexível) |
| **Cálculo de TMA/TMR**     | Precisar de audit log ou campos derivados; no MVP, derivar de timestamps das mensagens         |
| **Tendência adaptativa**   | Helper `getTrendColor(metric, currentVal, previousVal)` que sabe se "menor é melhor"           |
| **Filtros sincronizados**  | `useSearchParams` para URL; estado local + sync; mudança em filtro re-executa hooks            |
| **Dispensa de alerta**     | localStorage com hash do alerta + TTL de 24h via timestamp                                     |

### O que NÃO Fazer

| ❌ Evitar                                                                                           |
| --------------------------------------------------------------------------------------------------- |
| Implementar métricas de vendas/margem/financeiro — Bloco 4                                          |
| Pre-fetch de dados em sequência (cascata) — paralelizar via Promise.all                             |
| Sobrecarregar widget com features extras (zoom, drill múltiplos níveis) — drill-down 1 passo, ponto |
| Esquecer responsividade mobile — Gestor pode usar do celular                                        |
| Cores como único indicador — sempre texto + cor para acessibilidade                                 |
| Recalcular em todo render — memoizar via useMemo                                                    |
| Permitir Vendedor ver dashboard com dados ofuscados — bloquear acesso completo                      |
| Esquecer EmptyState em widgets sem dados                                                            |

---

## Status de Implementação

| Campo      | Valor            |
| ---------- | ---------------- |
| **Status** | ✅ CONCLUÍDO     |
| **Data**   | 2026-05-26       |
| **Versão** | 0.11.0 — Cockpit |

---

## Histórico

| Data       | Versão | Alteração                                                                         |
| ---------- | ------ | --------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — painel operacional do gestor com 7 widgets, alertas, drill-down |

---

**AILA - Sistemas Inteligentes**
