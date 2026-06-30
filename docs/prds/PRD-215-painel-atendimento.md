# PRD-215: Painel de Atendimento — Volume / Fluxo (`Gauge`)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | (mesmo da Fase 1/2) |
| **Codinome** | `Gauge` — o mostrador que lê o batimento do `Pulse` |
| **Objetivo** | UI do Painel de Atendimento como **aba dedicada em `/app/inicio`** (Owner/Gestor) + **card-resumo na Caixa**, consumindo os hooks do `Pulse` (PRD-214): novos atendimentos/dia (médias e totais, seletor dia/semana/mês), mensagens enviadas/recebidas, mensagens por usuário (humano vs automação), total de chats acumulados, tempo de atendimento e distribuição de status |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta (P1) |
| **Épico** | Painel de Atendimento (Volume / Ciclo) |
| **Nº do PRD** | ⚠️ **215 — PROVISÓRIO.** Ancorado após o lote 211–213; reconciliar contra INDEX v1.7 |
| **PRDs Relacionados** | PRD-214 (`Pulse` — consome os hooks), PRD-014 (DELTA: shell de abas em `/app/inicio`), PRD-010 (DELTA: card na Caixa), PRD-051 (vizinho — análise histórica), PRD-006 (RBAC: `service_volume.view`), PRD-003 (routing — **sem rota nova**) |
| **Padrão de código** | Feature-based; código em `src/features/service-volume/`; layout `DashboardLayout` do PRD-003 |
| **Implementação** | 🔵 Claude Code CLI |

### Critérios de Complexidade Utilizados

> **Justificativa de Alta:** 6 KPIs/gráficos distintos com seletor de granularidade (dia/semana/mês), toggle humano vs automação, distribuição de status com drill-down para inbox filtrada, card-resumo separado na Caixa com gating por papel, coordenação com o shell de abas do `/app/inicio` (DELTA PRD-014), e diferenciação explícita de PRD-014 (operação)/PRD-051 (histórico)/PRD-040 (executivo). Toda a agregação vem do `Pulse` (PRD-214) — este PRD é a camada de leitura.

---

## Contexto do Problema

O cliente pediu KPIs, métricas e gráficos **exclusivos do atendimento** — com destaque para o gráfico de **novos atendimentos por período** (com médias e totais por dia), além de mensagens enviadas/recebidas, mensagens por usuário, total de chats acumulados, tempo de atendimento e distribuição de status dos chats.

Hoje, `/app/inicio` é exclusivamente o painel operacional **snapshot** (PRD-014 — TMA/TMR/backlog/heatmap, "olhar de 5 segundos"). Não existe uma visão de **volume/fluxo** do atendimento: ninguém vê quantos atendimentos foram abertos por dia, como o volume de mensagens evolui, ou a distribuição atual dos status.

O `Pulse` (PRD-214) cria o dado (event log + ciclos + provider). **Falta a leitura** — a UI que transforma esse dado nos KPIs e gráficos que o cliente pediu. É o que este PRD entrega.

---

## Conceito da Solução

### Situação Atual (As-Is)

- `/app/inicio` é página única (PRD-014), Owner/Gestor, snapshot operacional em tempo real.
- Não há visão de volume/fluxo de atendimento. Os KPIs pedidos não existem em UI.
- `Pulse` (PRD-214) já expõe `useAtendimentoMetricsProvider` com as agregações prontas.

### Situação Desejada (To-Be)

`/app/inicio` ganha um **shell de abas** (DELTA PRD-014):

- **Aba "Operação"** — todo o conteúdo atual do PRD-014 (intacto).
- **Aba "Atendimento"** — o novo painel de volume (este PRD), **gated por `service_volume.view`** (Owner/Gestor).

**Layout da aba "Atendimento":**

- **Header:** seletor de **granularidade** (dia [default] / semana / mês — D4-B) + período; seletor de loja (só Owner, cross-store).
- **Linha 1 — KPI cards:** Novos atendimentos (total no período) + média/dia · Total de chats acumulados · Tempo médio de atendimento (por ciclo) · Mensagens (enviadas/recebidas, total).
- **Gráfico central — Novos atendimentos por bucket** (barras ou linha) com linha de média e rótulo de total. É o coração do painel (a regra de ciclo do `Pulse`).
- **Gráfico — Mensagens enviadas vs recebidas** (linha, 2 séries) ao longo do período.
- **Gráfico — Mensagens por usuário** (barras por atendente) com **toggle humano / automação / ambos** (D6-C, via `messages.author_type`).
- **Gráfico — Distribuição de status** (donut, snapshot atual) — clicável → inbox filtrada por status.
- **Gráfico — Chats acumulados** (linha cumulativa).

**Card-resumo na Caixa** (DELTA PRD-010): donut compacto de distribuição de status, **Owner/Gestor only**, clicável → `/app/inicio` aba "Atendimento".

### Diferenciação clara

| Painel | Pergunta | Tempo | Audiência |
|--------|----------|-------|-----------|
| PRD-014 (Operação) | Como está o atendimento **agora**? | Snapshot tempo real | Owner/Gestor |
| **PRD-215 (este — Atendimento)** | **Qual o volume/fluxo do atendimento?** | **Throughput dia-a-dia** | **Owner/Gestor** |
| PRD-051 (Atendimento Análise) | Como evolui ao longo de 12 meses (TMA/TMR, canal, vendedor)? | Histórico estratégico | Owner/Gestor |
| PRD-040 (Cockpit) | Como vai a empresa (vendas, margem)? | Executivo | Owner |

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Misturar os KPIs nos widgets do PRD-014 | Descaracteriza o snapshot "olhar de 5 segundos"; série temporal não combina (decisão D10) |
| Rota standalone no sidebar | `/app/inicio` já é o home Owner/Gestor; a audiência (`service_volume.view`) bate 1:1 (D10/D11-A) |
| Painel irmão da Caixa | Caixa é usada por todos; painel gestor-only ali geraria fricção de RBAC (D11-A) |
| Aba nova dentro do PRD-051 | Mistura volume operacional com histórico estratégico (contraria D2-B) |
| Recalcular métricas no front | Agregação vive no `Pulse` (PRD-214); front só consome |
| Versão vendedor-scoped | D11-A travou Owner/Gestor only |

---

## Escopo

### Incluído

- ✅ **Shell de abas** em `/app/inicio` (coordena com DELTA PRD-014): "Operação" + "Atendimento"
- ✅ Aba "Atendimento" gated por `service_volume.view` (Owner/Gestor; Vendedor bloqueado)
- ✅ KPI cards: novos atendimentos (total + média/dia), chats acumulados, tempo médio de atendimento, mensagens total
- ✅ Gráfico de **novos atendimentos** por bucket, com média e total
- ✅ Seletor de granularidade dia/semana/mês + período (URL sync)
- ✅ Gráfico mensagens enviadas vs recebidas
- ✅ Gráfico mensagens por usuário + toggle humano/automação/ambos
- ✅ Distribuição de status (donut) com drill-down → inbox filtrada
- ✅ Chats acumulados (linha cumulativa)
- ✅ **Card-resumo de status na Caixa** (DELTA PRD-010), Owner/Gestor only, clicável → aba Atendimento
- ✅ Store scope (Owner cross-store com seletor; Gestor loja)
- ✅ Mobile responsivo (desktop-first, degrada)
- ✅ Light/dark obrigatório, design system "Diesel Heavy", Iconify, recharts

### Excluído

- ❌ Camada de dados / agregação → **PRD-214 (`Pulse`)**
- ❌ Captura de `resolution_reason`/`waiting_on` na origem → **DELTA PRD-011/010**
- ❌ Análise histórica profunda (TMA/TMR 12m, por canal, health score por vendedor, escalações) → **PRD-051**
- ❌ Configuração de alertas → PRD-014 já tem os seus
- ❌ Versão vendedor-scoped (D11-A: gestor-only)
- ❌ Export PDF → futuro

---

## Requisitos Funcionais

### Shell de abas + acesso

- **RF-001:** `/app/inicio` renderiza um container de abas: "Operação" (conteúdo atual do PRD-014) + "Atendimento" (este painel). Aba ativa reflete em query param (ex.: `?tab=atendimento`).
- **RF-002:** A aba "Atendimento" só aparece/é acessível com `service_volume.view` (Owner/Gestor). Vendedor não vê a aba.
- **RF-003:** Página em `src/features/service-volume/pages/ServiceVolumePage.tsx`, consumindo `DashboardLayout`.

### Filtros

- **RF-004:** Seletor de **granularidade**: `dia` (default) / `semana` / `mês`, repassado a `getNovosAtendimentos`/séries do `Pulse` como `granularity`.
- **RF-005:** Seletor de **período** (24h/7d/30d/personalizado) + (Owner) seletor de **loja** (cross-store). Gestor: loja ativa, sem seletor.
- **RF-006:** Filtros refletem em query params (URL sync) e restauram no reload.

### KPIs e gráficos (todos consomem `useAtendimentoMetricsProvider` do PRD-214)

- **RF-007:** KPI cards: novos atendimentos (total no período) + **média/dia**; total de chats acumulados; tempo médio de atendimento (por ciclo, de `getHandleTimeStats`); mensagens (enviadas/recebidas, total).
- **RF-008:** Gráfico **novos atendimentos** por bucket (barras/linha) com **linha de média** e rótulo de **total**.
- **RF-009:** Gráfico mensagens **enviadas vs recebidas** (2 séries) via `getMessageVolume`.
- **RF-010:** Gráfico mensagens **por usuário** (barras por atendente) via `getMessagesByUser`, com **toggle** `humano` / `automação` / `ambos` (`audience`).
- **RF-011:** **Distribuição de status** (donut, snapshot) via `getStatusDistribution`; cada fatia é clicável.
- **RF-012:** Gráfico **chats acumulados** (linha cumulativa) via `getAccumulatedChats`.

### Drill-down + card na Caixa

- **RF-013:** Clicar numa fatia de status (donut ou card) navega para `/app/atendimento?status=<STATUS>` (inbox filtrada — usa a taxonomia canônica do DELTA PRD-010).
- **RF-014:** Card-resumo de distribuição de status no **topo da Caixa** (`/app/atendimento`), renderizado **somente** com `service_volume.view`; clicar abre `/app/inicio?tab=atendimento`.

### Estados

- **RF-015:** Loading skeletons por card/gráfico; empty state quando o período não tem dado; estado de erro com "tentar novamente".
- **RF-016:** Aviso sutil de "histórico de novos atendimentos a partir de <data do deploy do trigger>" quando o período consultado antecede o início do event log (coerente com o forward-only do `Pulse`).

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Render inicial dos cards < 1s; gráficos progressivos (não bloquear a tela inteira); memoização agressiva.
- **RNF-002 (Sem recálculo no front):** Toda agregação vem do `Pulse`; o front não reimplementa contagem de eventos.
- **RNF-003 (Responsividade):** 360px–1920px; em mobile as abas empilham e os gráficos simplificam.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA; navegação por teclado; donut com legenda textual.
- **RNF-005 (Tema):** Light + Dark obrigatório; tokens do design system (sem cores hardcoded).
- **RNF-006 (Tipagem):** Zero `any`; props tipadas; consumir os tipos do PRD-214.

---

## Critérios de Aceitação

```gherkin
DADO um Vendedor autenticado
QUANDO acessa /app/inicio
ENTÃO vê apenas a aba "Operação"
  E não vê a aba "Atendimento" nem o card de status na Caixa

DADO um Gestor
QUANDO abre a aba "Atendimento"
ENTÃO vê os KPIs e gráficos apenas da sua loja ativa

DADO um Owner
QUANDO seleciona outra loja no seletor cross-store
ENTÃO os KPIs e gráficos recalculam para a loja escolhida

DADO o gráfico de novos atendimentos com granularidade "dia"
QUANDO observo o período
ENTÃO vejo a contagem por dia, a linha de média e o total do período
  E um chat reaberto 2x no mesmo dia contribui com 2 (regra do Pulse)

DADO o gráfico de mensagens por usuário
QUANDO alterno o toggle para "automação"
ENTÃO o gráfico passa a mostrar apenas mensagens de author_type sdr/system

DADO o donut de distribuição de status
QUANDO clico na fatia "AGUARDANDO"
ENTÃO navego para /app/atendimento?status=AGUARDANDO

DADO o card de status no topo da Caixa (como Gestor)
QUANDO clico nele
ENTÃO abro /app/inicio?tab=atendimento
```

### Cenários de Erro

```gherkin
DADO que o provider do Pulse falha
QUANDO um gráfico tenta carregar
ENTÃO mostra estado de erro com "tentar novamente" (sem derrubar os outros cards)

DADO um período anterior ao início do event log
QUANDO observo novos atendimentos
ENTÃO vejo os primeiros contatos (backfill) e o aviso de início do histórico
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|--------------------|
| 1 | Shell de abas em `/app/inicio` + aba "Atendimento" (vazia) + gating + URL sync | 4-5 |
| 2 | KPI cards + gráfico de novos atendimentos + seletor de granularidade | 5-6 |
| 3 | Mensagens enviadas/recebidas + por usuário (toggle) | 4-5 |
| 4 | Distribuição de status + chats acumulados + tempo de atendimento | 4-5 |
| 5 | Card na Caixa + drill-downs + mobile + polish | 4-5 |

### Detalhamento

#### Fase 1 — Shell + aba + acesso
**Ações:** embrulhar `/app/inicio` em container de abas (DELTA PRD-014); criar `ServiceVolumePage`; gating `service_volume.view`; URL sync de aba/filtros. **Validação:** Vendedor não vê a aba; Gestor/Owner veem; reload preserva a aba.

#### Fase 2 — Novos atendimentos
**Ações:** KPI cards; gráfico de novos atendimentos (média + total); seletor dia/semana/mês ligado ao `granularity`. **Validação:** reabertura conta +1; troca de granularidade reagrupa.

#### Fase 3 — Mensagens
**Ações:** gráfico enviadas/recebidas; gráfico por usuário + toggle humano/automação/ambos. **Validação:** toggle filtra por `author_type`.

#### Fase 4 — Status + acumulado + tempo
**Ações:** donut de distribuição; linha cumulativa; KPI de tempo médio por ciclo. **Validação:** soma das fatias = total de chats no escopo.

#### Fase 5 — Caixa + drill-down + mobile
**Ações:** card de status na Caixa (gestor-only); drill-down → inbox filtrada; responsividade; estados. **Validação:** clique em status leva à inbox filtrada; card some para Vendedor.

---

## Dependências

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-214 (`Pulse`) | Provider/hooks de agregação | ⏳ (crítico — implementar antes) |
| DELTA PRD-014 | Shell de abas em `/app/inicio` | ⏳ (aplicar nesta entrega) |
| DELTA PRD-010 | Card de status na Caixa + taxonomia nos filtros | ⏳ (aplicar nesta entrega) |
| PRD-006 (DELTA) | Permissão `service_volume.view` | ⏳ (aplicar antes) |
| recharts | Biblioteca de gráficos (já no projeto) | ✅ |

### Decisões Pendentes

- [ ] Nenhuma bloqueante. (As decisões D1–D12 estão travadas; o forward-only e o caso `arquivada` são tratados no `Pulse`.)

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Painel de Atendimento (Volume / Ciclo)"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | DELTA PRD-002 | Tipos/taxonomia | ⏳ | Base |
| 2 | PRD-214 (`Pulse`) | Fundação de eventos | ⏳ | Dado |
| 3 | DELTA PRD-010 + PRD-011 | Filtros + arquivar-flag + captura de qualificadores | ⏳ | Borda |
| 4 | DELTA PRD-014 | Shell de abas `/app/inicio` | ⏳ | Estrutural |
| **5** | **PRD-215 (`Gauge`)** | **UI do Painel + card na Caixa** | **🔄 ATUAL** | Consome hooks do `Pulse` |

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Agregados de atendimento | Operacional (sem conteúdo de mensagem) | Gating `service_volume.view`; store scope (Owner cross-store, Gestor loja) |

### Autenticação e Autorização

- Aba "Atendimento" e card na Caixa: `service_volume.view` (Owner/Gestor). **Vendedor BLOQUEADO** (consistente com PRD-040/048/049/050/051/052/053).
- Drill-down respeita o RBAC da inbox (PRD-010) — o usuário só vê conversas do seu escopo.

---

## Fluxos de Usuário

### Fluxo Principal (Gestor)
1. Gestor abre `/app/inicio` → aba "Operação" (default).
2. Clica na aba "Atendimento".
3. Vê KPIs + gráficos da loja; ajusta granularidade (dia/semana/mês) e período.
4. Clica numa fatia de status → cai na inbox filtrada por aquele status.

### Fluxo Owner cross-store
1. Owner abre a aba "Atendimento", seleciona outra loja no seletor.
2. Todos os KPIs/gráficos recalculam para a loja escolhida.

### Fluxo Caixa
1. Gestor está na Caixa operando.
2. Vê o card-resumo de status no topo; clica → abre a aba "Atendimento".

---

### Convenções de Código (Referência Rápida)

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| Componentes React | PascalCase | `NovosAtendimentosChart.tsx` |
| Hooks | camelCase + `use` | `useServiceVolumeFilters` |
| Pastas | kebab-case | `service-volume/` |
| Gráficos | recharts | `LineChart`, `BarChart`, `PieChart` |
| Ícones | Iconify (`@iconify/react`) | `<Icon icon="mdi:chart-line" />` |
| Tema | Light + Dark obrigatório | CSS variables |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Code CLI. Este PRD foi criado pelo Agente Arquiteto (Claude na web). Toda a agregação já existe no `Pulse` (PRD-214) — **não reimplemente no front**.

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:** confirme que o `Pulse` (PRD-214) está implementado e os hooks expõem o shape esperado; explore os componentes de gráfico já existentes no PRD-014/051 para reuso; planeje o shell de abas como DELTA mínimo no `/app/inicio`.

> **⚠️ 2. APÓS IMPLEMENTAR:** incrementar versão (SemVer — MINOR), atualizar `CHANGELOG.md` (Added: Painel de Atendimento + card na Caixa; Changed: `/app/inicio` com abas), renomear para `PRD-215-...-painel-atendimento_DONE.md`, preencher Status.

**Codinome:** `Gauge`.

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Fonte do dado** | Sempre `useAtendimentoMetricsProvider` (PRD-214). Front não conta eventos. |
| **Reuso** | Reaproveitar cards/gráficos do PRD-014/051 onde fizer sentido (consistência visual). |
| **Tab shell** | É DELTA no PRD-014 — aplicar antes de marcar este PRD concluído. |
| **Card na Caixa** | É DELTA no PRD-010 — condicional por papel; Vendedor não vê. |
| **Forward-only** | Mostrar o aviso de início do histórico quando o período antecede o event log. |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Duplicar a aba "Atendimento" para o Vendedor (gestor-only, D11-A) |
| Recalcular métricas no front (vem do `Pulse`) |
| Jogar série temporal na aba "Operação" (PRD-014 é snapshot) |
| Misturar com o histórico estratégico do PRD-051 |
| Card na Caixa visível para Vendedor |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data de Implementação** | - |
| **Versão do App** | - |
| **Implementado por** | - |
| **Observações** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 18/06/2026 | v1 | Criação inicial — Painel de Atendimento (volume/fluxo) como aba em `/app/inicio` + card na Caixa, consumindo o `Pulse` (PRD-214). Número 215 provisório (reconciliar INDEX v1.7). |

---

**AILA — Sistemas Inteligentes**
