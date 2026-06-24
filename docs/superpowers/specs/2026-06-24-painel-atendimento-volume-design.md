# Painel de Atendimento (Volume / Fluxo) — Design

> **Épico:** Painel de Atendimento (Volume / Ciclo) — `Pulse` (PRD-214) + `Gauge` (PRD-215)
> **Esta entrega:** PRD-215 (UI) construído sobre o **provider mock determinístico**. A fundação Supabase real (PRD-214) é uma 2ª entrega.
> **Data:** 2026-06-24
> **Status:** Design aprovado (layout + decisões estruturais). Pronto para virar plano de implementação.

---

## 1. Contexto

O cliente pediu KPIs/gráficos **exclusivos do atendimento**, com destaque para o gráfico de **novos atendimentos por período** (médias e totais), além de mensagens enviadas/recebidas, mensagens por usuário (humano vs automação), total de chats acumulados, tempo de atendimento e distribuição de status.

Hoje `/app/inicio` (PRD-014) é só o snapshot operacional em tempo real ("olhar de 5 segundos"). Não existe a visão de **volume/fluxo** do atendimento. Este design entrega essa visão como **aba dedicada** em `/app/inicio`, mais um **card-resumo** na Caixa.

Os PRDs 214/215 foram redigidos em 18/06 com valores de status **presumidos**. O mapeamento do código + a consulta ao banco real (24/06) **invalidaram premissas centrais** do PRD-214 e reorientaram o design (ver §2).

---

## 2. Decisões estruturais travadas

### 2.1 Taxonomia de status — MANTER o `snake_case` atual

O PRD-214 propunha renomear os status para MAIÚSCULO canônico (`ABERTO`/`EM_ATENDIMENTO`/`AGUARDANDO`/`RESOLVIDO`/`SEM_STATUS`) via migration destrutiva em produção. **Rejeitado.** Fatos do banco real (`SELECT status, count(*) FROM public.conversations`):

| status | conversas |
|--------|-----------|
| `aguardando` | 755 |
| `em_andamento` | 366 |
| `arquivada` | 96 |
| `resolvida` | 1 |

- **Não existe** nenhum status `ABERTO`/`aberta` — o gatilho central do PRD não tem correspondente real. A conversa nasce em `aguardando`.
- **Zero sujeira / zero nulo** — o `SEM_STATUS` resolve um problema inexistente.
- Renomear quebraria ~7 pontos hardcoded em produção (webhook `CLOSED_CONVERSATION_STATUSES`, cálculo de carga do vendedor, painel do gestor, `search_conversations`, realtime, analytics) — numa camada que a operação considera congelada.

**Decisão:** a union `ConversationStatus` permanece `aguardando | em_andamento | aguardando_cliente | resolvida | arquivada`. `arquivada` continua status terminal (não vira flag `archived_at`). Some toda a parte destrutiva do PRD-214 (normalização, `CHECK`, `SEM_STATUS`, renomeação). Todos os objetivos do épico são alcançáveis sem renomear nada.

### 2.2 Definição de "novo atendimento" — 1º contato + reabertura

Como não há status `ABERTO`, o contador (o gráfico-coração) conta **+1** quando:

1. A conversa é **criada** (1º contato — `conversations.created_at`); **e**
2. Uma conversa **encerrada** (`resolvida` / `arquivada`) **reabre** para um estado ativo (`aguardando` / `em_andamento`).

Um chat resolvido de manhã que o cliente reabre à tarde conta **2**. Transições entre estados ativos (`aguardando` ↔ `em_andamento` ↔ `aguardando_cliente`) **não** contam. É o "ciclo de atendimento" — mede esforço real, não só chats novos.

### 2.3 Estratégia — UI-first sobre mock

Esta entrega constrói o **PRD-215 inteiro sobre o provider mock determinístico** (zero risco de produção), com o visual caprichado. A fundação Supabase real (PRD-214: event log + trigger + backfill + view + provider supabase) vira a **2ª entrega**; aí só se troca a impl via `VITE_DATA_SOURCE` — a UI não muda.

### 2.4 Comportamento por ambiente

- **Demo (`VITE_DATA_SOURCE=mock`):** painel totalmente funcional com dados mock. É onde a validação visual acontece.
- **Produção (`supabase`):** a impl supabase do provider `atendimentoMetrics` retorna **vazio/placeholder (sem erro)**. A aba aparece com empty states + aviso discreto "métricas em implantação" até o PRD-214 chegar. Quando o 214 entrar, troca só a impl.

### 2.5 Layout — Abordagem 1 (Hero + grid), aprovada

Filtros (header sticky glass) → linha de 4 KPI cards → **gráfico-coração "Novos atendimentos" em barras** com linha de média e total (largura total/destaque) → grade 2×2 com os 4 secundários. Hero em **barras** (comunica volume/dia). KPI cards com **delta** vs período anterior.

### 2.6 Período — presets + intervalo custom

Botões `24h / 7d / 30d` + opção "personalizado" com date-range picker (`react-day-picker`, já no projeto). Granularidade `dia` (default) / `semana` / `mês` via segmented control.

---

## 3. Escopo

### Incluído (PRD-215 sobre mock)

- Contrato `useAtendimentoMetricsProvider` (interface estável; serve mock agora e Supabase depois) — o **38º** provider
- Impl **mock** determinística das métricas (harness)
- Impl **supabase placeholder** (retorna vazio, sem erro)
- UI: aba "Atendimento" em `/app/inicio` (shell de abas — DELTA-014)
- KPI cards (4) + gráfico de novos atendimentos (hero) + mensagens enviadas/recebidas + mensagens por usuário (toggle humano/automação/ambos) + donut de distribuição de status + chats acumulados (cumulativo) + tempo médio por ciclo
- Seletor de granularidade + período (presets + custom) + loja (Owner cross-store) — com URL sync
- Drill-down: fatia de status → inbox filtrada
- Card-resumo de status na Caixa (DELTA-010), gated, clicável → aba Atendimento
- RBAC `service_volume.view` (DELTA-006); tipos (DELTA-002, sem mexer na union de status); registro do provider (DELTA-005)
- Light/dark, tokens semânticos "Diesel Heavy", recharts, Iconify, mobile responsivo, WCAG 2.1 AA

### Excluído (2ª entrega — PRD-214, ou deferido)

- Migration, event log (`conversation_status_events`), trigger, backfill, view `atendimento_cycles`
- Impl **supabase real** do provider (substitui o placeholder)
- Normalização de status / renomeação / `archived_at` como flag — **descartado** por decisão (§2.1)
- Análise histórica profunda (TMA/TMR 12m, por canal, health por vendedor) → permanece no PRD-051
- Export PDF → futuro

---

## 4. Arquitetura de dados — o contrato

`src/providers/data/contracts/atendimentoMetrics.ts`:

```ts
type Granularity = 'day' | 'week' | 'month';
type MetricBucket = { bucket: ISO8601; value: number };

interface ServiceMetricParams {
  storeId?: ID;
  sellerId?: ID;
  from: ISO8601;
  to: ISO8601;
  granularity: Granularity;
}

interface INovosAtendimentosResult {
  series: MetricBucket[];
  total: number;
  averagePerDay: number;
  deltaPct?: number;          // vs período anterior (mock simula)
  historyStartsAt?: ISO8601;  // reservado p/ aviso forward-only do 214 (null no mock)
}
interface IMessageVolumeResult {
  series: { bucket: ISO8601; sent: number; received: number }[];
  totalSent: number;
  totalReceived: number;
}
interface IMessagesByUserRow {
  sellerId: ID | null;
  name: string;
  authorType: 'seller' | 'sdr' | 'system';
  count: number;
}
interface IMessagesByUserResult {
  rows: IMessagesByUserRow[];
  audience: 'human' | 'automation' | 'all';
}
interface IStatusDistributionResult {
  slices: { status: ConversationStatus; count: number }[];
  total: number;
}
interface IAccumulatedChatsResult { series: MetricBucket[]; total: number; }
interface IHandleTimeStatsResult {
  averageMs: number;
  medianMs?: number;
  cycleCount: number;
  deltaPct?: number;
}

interface IAtendimentoMetricsProvider {
  getNovosAtendimentos(p: ServiceMetricParams): Promise<INovosAtendimentosResult>;
  getMessageVolume(p: ServiceMetricParams): Promise<IMessageVolumeResult>;
  getMessagesByUser(p: ServiceMetricParams & { audience: 'human' | 'automation' | 'all' }): Promise<IMessagesByUserResult>;
  getStatusDistribution(p: ServiceMetricParams): Promise<IStatusDistributionResult>;
  getAccumulatedChats(p: ServiceMetricParams): Promise<IAccumulatedChatsResult>;
  getHandleTimeStats(p: ServiceMetricParams): Promise<IHandleTimeStatsResult>;
}
```

O contrato expõe **agregações**, nunca eventos crus — garante paridade de shape entre o mock e o futuro Supabase (que derivará de `conversation_status_events`). Tipos novos em `src/shared/types/` (arquivo próprio, ex.: `service-volume.ts`), sem tocar na union `ConversationStatus`.

### Comportamento do mock (harness determinístico)

Lê o `mockStore` para o que já existe (status distribution, volume por `direction`, por `author_type`, acumulado por `createdAt`, handle-time proxy `last_message_at − created_at`) e **sintetiza** os "novos atendimentos" via seed: 1 evento de 1º contato (`createdAt`) por conversa + reaberturas determinísticas plausíveis (regra §2.2). Determinístico — mesmo dataset entre reloads. `deltaPct` simulado a partir do período anterior.

### Comportamento da impl supabase (placeholder nesta entrega)

Retorna séries vazias / zeros (sem `NotImplementedError`). A UI mostra empty states + aviso "métricas em implantação". Substituída pela impl real no PRD-214.

---

## 5. Os 5 deltas

| Delta | Arquivo(s) alvo | Mudança |
|-------|-----------------|---------|
| **PRD-002** | `src/shared/types/service-volume.ts` (+ barrel) | Tipos de métrica (§4). **Não** altera `ConversationStatus` |
| **PRD-005** | `contracts/`, `impl/mock/`, `impl/supabase/`, `factory.ts`, `hooks/useAtendimentoMetricsProvider.ts`, `context.tsx` | Registra o 38º provider. Mock real + supabase placeholder |
| **PRD-006** | módulo RBAC (estático + seed) | Permissão `service_volume.view` (Owner/Gestor; Vendedor bloqueado). Ver §8 (ponto a verificar no plano) |
| **PRD-014** | `/app/inicio` (`manager-dashboard`) | Embrulha a página atual num **shell de abas**: "Operação" (intacta) + "Atendimento". `?tab=` na URL. **Wrap, não rewrite** |
| **PRD-010** | `InboxPage` (`conversations`) | Card-resumo de status no topo, gated `service_volume.view`, clicável → `/app/inicio?tab=atendimento` |

---

## 6. Feature `src/features/service-volume/`

```
pages/ServiceVolumePage.tsx
components/
  ServiceVolumeFilters.tsx      (granularidade + período presets/custom + loja)
  ServiceVolumeKpis.tsx         (4 KPI cards com delta)
  NovosAtendimentosChart.tsx    (hero — barras + ReferenceLine de média + total)
  MessageVolumeChart.tsx        (linha, 2 séries enviadas/recebidas)
  MessagesByUserChart.tsx       (barras horizontais + toggle humano/automação/ambos)
  StatusDistributionDonut.tsx   (donut + legenda textual; prop `compact` p/ reuso)
  AccumulatedChatsChart.tsx     (área cumulativa)
  InboxStatusSummaryCard.tsx    (card compacto da Caixa — usa o donut compact)
hooks/
  useServiceVolumeFilters.ts    (URL sync de aba/granularidade/período/loja)
  useServiceVolumeMetrics.ts    (orquestra as queries via TanStack Query)
engine/
  bucketing.ts                  (agrupa série por granularidade)
  delta.ts                      (cálculo de variação vs período anterior)
  formatHandleTime.ts           (ms → "3h 12m")
i18n/pt-BR.ts
index.ts                        (barrel)
```

- `StatusDistributionDonut` é **um componente só**, com `compact`, reaproveitado na aba e no card da Caixa.
- Reuso de `KpiCard` / `LineChart` do PRD-051 (`customer-service-analytics`) onde encaixar (consistência visual).
- `engine/` puro e testado (Vitest).

---

## 7. UI / Layout (Abordagem 1 aprovada)

- **Header sticky glass** (tokens semânticos, conforme `docs/dev/ux-guidelines.md`): segmented control de granularidade + select de período (presets + custom) + select de loja (Owner only) + `ScrollProgressBar` na divisa.
- **Linha de KPIs:** grid `auto-fit minmax(150px, 1fr)` — Novos atendimentos (total + média/dia + delta) · Chats acumulados · Tempo médio por ciclo · Mensagens (total + env/rec). Padrão "metric card" (label 13px + número 24px/500 + helper).
- **Hero:** `BarChart` (recharts) por bucket + `ReferenceLine` de média + rótulo de total. Largura total. Barra de pico destacada.
- **Grade 2×2:** `MessageVolumeChart` (linha 2 séries) · `MessagesByUserChart` (barras horizontais ordenadas desc, value labels, toggle) · `StatusDistributionDonut` (donut + legenda label·contagem·%) · `AccumulatedChatsChart` (área cumulativa).
- **Drill-down:** fatia do donut → `/app/atendimento?status=<valor real>` (ex.: `aguardando`).
- **Estados isolados:** skeleton por card/chart, empty por gráfico, erro com "tentar novamente" — falha de um não derruba os outros.
- **A11y:** legenda textual no donut, cor nunca como único indicador, `cursor-pointer` em clicáveis, focus rings, `prefers-reduced-motion`, transições 150–300ms.
- **Responsivo:** 360–1920px; KPIs e grade colapsam para 1 coluna no mobile; gráficos simplificam.

---

## 8. Pontos a verificar/decidir no plano de implementação

1. **Deep-link de status na Caixa:** a `InboxPage` precisa ler `?status=<valor>` da URL para pré-filtrar (o filtro existe, falta confirmar a leitura via query param). Pode exigir pequeno ajuste em `InboxFilters`.
2. **Plug de `service_volume.view` no RBAC:** o projeto tem papéis editáveis (PRD-211) com a verdade nas tabelas (`rbac_resources`/`role_permissions`) e cache `rbacConfig` com fallback estático. Nesta entrega mock-first, garantir a checagem no **fallback estático** (Owner/Gestor). O seed do recurso/permissão no banco (para prod) entra junto ou na 2ª entrega — definir no plano.
3. **Seletor de loja cross-store:** reaproveitar o mecanismo do Owner já existente (resolução via RPC owner / `MultistoreProvider`).

---

## 9. Faseamento da implementação

| Fase | Entrega | Validação |
|------|---------|-----------|
| 0 | Contrato + tipos + provider mock + supabase placeholder + registro (DELTA-002/005) | Troca de fonte transparente; shapes válidos |
| 1 | Shell de abas (DELTA-014) + página vazia + gating (DELTA-006) + URL sync | Vendedor não vê a aba; reload preserva a aba |
| 2 | Filtros + KPI cards + hero (novos atendimentos) | Reabertura conta +1; troca de granularidade reagrupa |
| 3 | Mensagens enviadas/recebidas + por usuário (toggle) | Toggle filtra por `author_type` |
| 4 | Donut status + acumulado + tempo médio + drill-down | Soma das fatias = total; clique → inbox filtrada |
| 5 | Card na Caixa (DELTA-010) + estados + mobile + polish | Card some para Vendedor; clique → aba Atendimento |

---

## 10. Testing

- `engine/` puro (`bucketing`, `delta`, `formatHandleTime`) com Vitest (TDD).
- Mock provider: testes de shape/paridade (retorna o contrato; determinístico).
- Gate prático de CI: `bun run build` + `bun run test`. Type-check do código novo por delta (`bunx tsc --noEmit`, cruzando com `git diff --diff-filter=A`).

---

## 11. Referências

- `docs/prds/PRD-214-fundacao-eventos-atendimento.md` (`Pulse` — 2ª entrega)
- `docs/prds/PRD-215-painel-atendimento.md` (`Gauge` — esta UI)
- `docs/prds/DELTAS-lote-painel-atendimento.md` (deltas 002/005/006/010/014)
- `docs/dev/ux-guidelines.md` (header glass, ScrollProgressBar, colunas, busca)
- PRD-051 `customer-service-analytics` (reuso de KpiCard/LineChart)

---

**AILA — Sistemas Inteligentes**
