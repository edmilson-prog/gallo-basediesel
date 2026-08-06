# Leads Multi-Funil — Fase 4 (Kanban) · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O quadro de Leads passa a ser o quadro **do funil ativo** — colunas vindas de `lead_funnel_stages`, cards posicionados e valorados pela **participação** (`lead_funnel_entries`), com carga paginada, ordenação e colapso por etapa, arraste acessível por teclado e o card cortado de ~96px para ~60px.

**Architecture:** Hoje `LeadsKanban` recebe `stages: IPipelineStage[]` de `usePipelineSettings` e agrupa por `lead.stage.id` — o snapshot legado no lead. A fase 2 já entregou toda a camada N:N (`listStages`, `listEntriesByFunnel`, `getBoardSummary`, `moveEntry`), mas nenhum consumidor no board. Esta fase liga os dois: um hook `useFunnelBoard(funnelId)` reúne etapas, participações e agregados numa estrutura só, e um punhado de engines puros decidem agrupamento, ordenação e recorte. Os componentes viram apresentação. O arraste migra de HTML5 DnD para `@dnd-kit`, já instalado e validado em `RotationQueueManager`.

**Tech Stack:** React 19 · TypeScript strict · TanStack Query · TanStack Router · Tailwind v4 + shadcn/ui · `@dnd-kit/core` `^6.3.1` · Vitest · bun

---

## Global Constraints

Requisitos que valem para **toda** task deste plano. Não são repetidos em cada uma.

- **Worktree:** `.claude/worktrees/leads-multi-funil-fase4`, branch `feat/leads-multi-funil-fase4`, criada de `origin/main` em `2b4ef4c2`. Nunca commitar no diretório principal.
- **Tokens semânticos apenas.** Nunca hex, nunca `--gallo-*`, nunca paleta crua do Tailwind (`bg-emerald-500`, `text-red-700`). Cor de funil e de etapa **só** via `getAccentClasses(accent)` de `@/features/funnels/engine/accentClasses`. As classes retornadas são literais — `bg-funnel-${n}` em template string não gera CSS no Tailwind v4.
- **`getAccentClasses(...).bar` e `.dot` são `background`, não `border`.** Usar como cor de borda foi corrigido duas vezes nesta feature. Faixa colorida = elemento dedicado com `background`, separado do `border-border`. Padrão de referência: `KanbanColumn.tsx:64-65`.
- **Estado compartilhado entre instâncias irmãs NUNCA em `useState` por instância.** Foi o defeito da v0.159.1: três `FunnelNav` com cópias independentes da mesma preferência. Padrão obrigatório: store no módulo + `useSyncExternalStore`, como em `src/features/funnels/hooks/useFunnelLayoutPreference.ts`.
- **Provider Pattern.** Dados só via `@/providers/data`. `useLeadFunnelsProvider()` já existe. Proibido importar `@/mocks` ou `@/providers/data/impl/*` fora da camada de providers (ESLint impõe).
- **Interfaces de domínio com prefixo `I`.** `strict: true`, `noUncheckedIndexedAccess` ativo — `array[i]` é `T | undefined` mesmo após checar `i >= 0`.
- **Texto de interface em pt-BR com acentuação correta**, centralizado em `src/features/leads/i18n/pt-BR.ts` (`LEADS_STRINGS`) ou `src/features/funnels/i18n/pt-BR.ts` (`COPY`). Nenhuma string literal em componente.
- **Engines em `engine/` são puros e testados** (Vitest, arquivo `*.test.ts` co-localizado). Componentes não são testados nesta base — a rede de segurança é o engine.
- **`bun run build` NÃO faz type-check.** Gate por task: `bun run test` + `bunx tsc --noEmit` (avaliar **delta**, há baseline pré-existente; hoje o único erro em `src/features` é `sales-analytics/hooks/useFunnelMetrics.ts:179`).
- **Nada de dependência nova.** `@dnd-kit/core`, `@dnd-kit/sortable` e `@dnd-kit/utilities` já estão no `package.json`. `bunfig.toml` impõe guarda de 24h em pacotes novos e exige confirmação do dono.
- **Fora do escopo desta fase:** modo triagem e ações em lote (§7.7 → fase 7), administração de funis (§7.9 → fase 6), bloco de participações na ficha da conversa (§8 → fase 5). A barra de métricas (§7.6) e a conformidade de UX do header (§7.9) **já foram entregues na fase 3** — não refazer.

---

## Estrutura de arquivos

**Criar**

| Arquivo | Responsabilidade |
|---|---|
| `src/features/funnels/hooks/useFunnelBoard.ts` | Reúne etapas + participações + agregados do funil ativo numa estrutura só |
| `src/features/funnels/engine/boardBuckets.ts` | Puro: junta leads com participações e agrupa por etapa |
| `src/features/funnels/engine/boardBuckets.test.ts` | Testes do agrupamento |
| `src/features/funnels/engine/boardSort.ts` | Puro: modos de ordenação e o padrão por `kind` de etapa |
| `src/features/funnels/engine/boardSort.test.ts` | Testes da ordenação |
| `src/features/funnels/engine/columnStats.ts` | Puro: estatísticas da coluna, com queda para cálculo local quando o agregado não chegou |
| `src/features/funnels/engine/columnStats.test.ts` | Testes das estatísticas |
| `src/features/funnels/engine/otherFunnels.ts` | Puro: quantos **outros** funis acessíveis contêm o lead |
| `src/features/funnels/engine/otherFunnels.test.ts` | Testes do indicador |
| `src/features/leads/hooks/useColumnPreferences.ts` | Ordenação e colapso por `stageId`, store compartilhado (`useSyncExternalStore`) |
| `src/features/leads/components/kanban/ColumnHeader.tsx` | Cabeçalho da coluna: nome, soma, atrasados, menu `⋮` |
| `src/features/leads/components/kanban/CollapsedColumn.tsx` | A coluna recolhida em 44px |
| `src/features/leads/components/kanban/BoardCard.tsx` | O card enxuto (~60px), substitui `LeadCard` no kanban |
| `src/features/leads/components/kanban/BoardCardHover.tsx` | `HoverCard` com o que saiu do card |
| `src/features/leads/components/kanban/OtherFunnelsBadge.tsx` | Indicador `⑃ N` + hover com os funis |
| `src/features/leads/components/kanban/MoveToMenu.tsx` | "Mover para…" — alternativa ao arraste |

**Modificar**

| Arquivo | Mudança |
|---|---|
| `src/features/leads/components/kanban/LeadsKanban.tsx` | Recebe etapas do funil e participações; `DndContext`; drop chama `moveEntry` |
| `src/features/leads/components/kanban/KanbanColumn.tsx` | Vira `useDroppable`; delega cabeçalho, paginação, colapso |
| `src/features/leads/pages/LeadsPage.tsx` | Alimenta o board com `useFunnelBoard`; passa `?highlight=` |
| `src/features/leads/components/LeadsFiltersBar.tsx` | Filtro "Estágio" recebe as etapas do funil ativo |
| `src/features/leads/hooks/useLeadsUrlState.ts` | Novo parâmetro `highlight` |
| `src/features/leads/i18n/pt-BR.ts` | Textos novos do board |
| `src/features/funnels/i18n/pt-BR.ts` | Textos do indicador multi-funil |
| `src/routes/app.leads.tsx` | Schema de busca aceita `highlight` |
| `CHANGELOG.md` · `package.json` · `CLAUDE.md` | Versão e changelog |
| `docs/superpowers/handoff-leads-multi-funil.md` | Tabela de fases: 4 entregue |

**Não tocar:** `LeadCard.tsx` segue existindo — a visão **Lista** o consome com `variant="list"`. Trocar o card do kanban não é remover o componente.

---

## Task 1: A fonte de verdade do board

O board deixa de ler `lead.stage` (snapshot legado) e passa a ler a **participação no funil ativo**. Tudo o mais nesta fase depende disto.

**Files:**
- Create: `src/features/funnels/engine/boardBuckets.ts`
- Test: `src/features/funnels/engine/boardBuckets.test.ts`
- Create: `src/features/funnels/hooks/useFunnelBoard.ts`
- Modify: `src/features/leads/components/kanban/LeadsKanban.tsx`
- Modify: `src/features/leads/components/kanban/KanbanColumn.tsx`
- Modify: `src/features/leads/pages/LeadsPage.tsx:45,200-207`

**Interfaces:**
- Consumes: `ILeadFunnelStage`, `ILeadFunnelEntry`, `ILead` de `@/shared/types`; `useLeadFunnelsProvider()` de `@/providers/data/hooks/useLeadFunnelsProvider`.
- Produces:
  - `interface IBoardCard { lead: ILead; entry: ILeadFunnelEntry }`
  - `bucketLeadsByStage(input: IBucketInput): Map<ID, IBoardCard[]>`
  - `useFunnelBoard(funnelId: ID | null): IFunnelBoardResult` com `{ stages, entriesByLead, summaryByStage, isLoading }`

- [ ] **Step 1: Escrever o teste que falha**

`src/features/funnels/engine/boardBuckets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bucketLeadsByStage } from "./boardBuckets";
import type { ILead, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";

const stage = (id: string, position: number): ILeadFunnelStage => ({
  id, funnelId: "f1", name: id, accent: 1, position, kind: "aberta",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

const lead = (id: string): ILead => ({ id, name: id }) as unknown as ILead;

const entry = (leadId: string, stageId: string): ILeadFunnelEntry => ({
  id: `e-${leadId}`, leadId, funnelId: "f1", stageId, storeId: "s1", sellerId: null,
  enteredStageAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

const STAGES = [stage("novo", 0), stage("andamento", 1)];

describe("bucketLeadsByStage", () => {
  it("põe o lead na etapa da participação, não na do snapshot do lead", () => {
    const leads = [{ ...lead("l1"), stage: { id: "outra", name: "Outra" } } as unknown as ILead];
    const entriesByLead = new Map([["l1", entry("l1", "andamento")]]);
    const buckets = bucketLeadsByStage({ leads, entriesByLead, stages: STAGES });
    expect(buckets.get("andamento")?.map((c) => c.lead.id)).toEqual(["l1"]);
    expect(buckets.get("novo")).toEqual([]);
  });

  it("cria um balde vazio para toda etapa, mesmo sem lead", () => {
    const buckets = bucketLeadsByStage({ leads: [], entriesByLead: new Map(), stages: STAGES });
    expect([...buckets.keys()]).toEqual(["novo", "andamento"]);
    expect([...buckets.values()].every((v) => v.length === 0)).toBe(true);
  });

  it("descarta lead sem participação neste funil", () => {
    // O fetch é escopado pelo funil, mas cache morno durante a troca de funil
    // entrega leads do funil anterior. Sem este descarte eles apareceriam
    // empilhados na primeira coluna.
    const buckets = bucketLeadsByStage({
      leads: [lead("l1"), lead("l2")],
      entriesByLead: new Map([["l1", entry("l1", "novo")]]),
      stages: STAGES,
    });
    expect(buckets.get("novo")?.map((c) => c.lead.id)).toEqual(["l1"]);
  });

  it("descarta participação apontando para etapa que não existe mais", () => {
    const buckets = bucketLeadsByStage({
      leads: [lead("l1")],
      entriesByLead: new Map([["l1", entry("l1", "etapa-apagada")]]),
      stages: STAGES,
    });
    expect([...buckets.values()].flat()).toEqual([]);
  });

  it("preserva a ordem de entrada dos leads dentro do balde", () => {
    const buckets = bucketLeadsByStage({
      leads: [lead("l3"), lead("l1"), lead("l2")],
      entriesByLead: new Map([
        ["l1", entry("l1", "novo")], ["l2", entry("l2", "novo")], ["l3", entry("l3", "novo")],
      ]),
      stages: STAGES,
    });
    expect(buckets.get("novo")?.map((c) => c.lead.id)).toEqual(["l3", "l1", "l2"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/funnels/engine/boardBuckets.test.ts
```
Esperado: FAIL — `Failed to resolve import "./boardBuckets"`.

- [ ] **Step 3: Implementar o engine**

`src/features/funnels/engine/boardBuckets.ts`:

```ts
import type { ID, ILead, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";

/** Um lead e a participação dele NESTE funil. O board não conhece outro par. */
export interface IBoardCard {
  lead: ILead;
  entry: ILeadFunnelEntry;
}

export interface IBucketInput {
  leads: ILead[];
  entriesByLead: Map<ID, ILeadFunnelEntry>;
  stages: ILeadFunnelStage[];
}

/**
 * Agrupa por `entry.stageId`, nunca por `lead.stage.id`.
 *
 * O snapshot `lead.stage` é o pipeline legado da loja: com N funis ele
 * responde por um só, e usá-lo aqui colocaria o mesmo lead na mesma coluna em
 * todos os boards. A etapa de verdade vive na participação.
 *
 * Lead sem participação e participação órfã são descartados em silêncio: os
 * dois só aparecem em janelas de cache morno (troca de funil, etapa recém
 * apagada) e um balde de "sem etapa" seria uma coluna que a spec não prevê.
 */
export function bucketLeadsByStage({ leads, entriesByLead, stages }: IBucketInput): Map<ID, IBoardCard[]> {
  const buckets = new Map<ID, IBoardCard[]>();
  for (const s of stages) buckets.set(s.id, []);

  for (const lead of leads) {
    const entry = entriesByLead.get(lead.id);
    if (!entry) continue;
    const bucket = buckets.get(entry.stageId);
    if (!bucket) continue;
    bucket.push({ lead, entry });
  }

  return buckets;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/funnels/engine/boardBuckets.test.ts
```
Esperado: PASS, 5 testes.

- [ ] **Step 5: Escrever o hook do board**

`src/features/funnels/hooks/useFunnelBoard.ts`:

```ts
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ID, IFunnelBoardSummary, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";

const EMPTY_STAGES: ILeadFunnelStage[] = [];

export interface IFunnelBoardResult {
  stages: ILeadFunnelStage[];
  entriesByLead: Map<ID, ILeadFunnelEntry>;
  summaryByStage: Map<ID, IFunnelBoardSummary>;
  isLoading: boolean;
}

/**
 * Etapas, participações e agregados do funil ativo.
 *
 * A chave das participações é a MESMA de `useLeadFunnelChips`
 * (`["lead-funnel-entries", funnelId]`) de propósito: a página monta os dois, e
 * chaves distintas dobrariam o fetch da tabela mais pesada da feature.
 *
 * Os agregados vêm do servidor (`getBoardSummary`) porque contar linhas no
 * cliente contaria só a página carregada — o cabeçalho precisa do total real.
 */
export function useFunnelBoard(funnelId: ID | null): IFunnelBoardResult {
  const provider = useLeadFunnelsProvider();
  const enabled = Boolean(funnelId);

  const [stagesQuery, entriesQuery, summaryQuery] = useQueries({
    queries: [
      {
        queryKey: ["lead-funnel-stages", funnelId] as const,
        queryFn: () => provider.listStages(funnelId as ID),
        enabled,
        staleTime: 60_000,
      },
      {
        queryKey: ["lead-funnel-entries", funnelId] as const,
        queryFn: () => provider.listEntriesByFunnel(funnelId as ID),
        enabled,
        staleTime: 30_000,
      },
      {
        queryKey: ["lead-funnel-board-summary", funnelId] as const,
        queryFn: () => provider.getBoardSummary(funnelId as ID),
        enabled,
        staleTime: 30_000,
      },
    ],
  });

  const stages = useMemo(
    () => [...(stagesQuery.data ?? EMPTY_STAGES)].sort((a, b) => a.position - b.position),
    [stagesQuery.data],
  );

  const entriesByLead = useMemo(() => {
    const map = new Map<ID, ILeadFunnelEntry>();
    for (const e of entriesQuery.data ?? []) map.set(e.leadId, e);
    return map;
  }, [entriesQuery.data]);

  const summaryByStage = useMemo(() => {
    const map = new Map<ID, IFunnelBoardSummary>();
    for (const s of summaryQuery.data ?? []) map.set(s.stageId, s);
    return map;
  }, [summaryQuery.data]);

  return {
    stages,
    entriesByLead,
    summaryByStage,
    isLoading: stagesQuery.isLoading || entriesQuery.isLoading,
  };
}
```

- [ ] **Step 6: Ligar o board às etapas do funil**

Em `LeadsPage.tsx`, logo após `const { funnels: reachableFunnels } = useFunnelNavigation();` (linha 138), adicionar:

```tsx
// O quadro é o quadro DO FUNIL: etapas e posições vêm da participação, não do
// pipeline da loja. `usePipelineSettings` continua servindo a barra de filtros
// e o modal de novo lead, que ainda falam a língua legada.
const board = useFunnelBoard(scopedFunnelId ?? null);
```

E trocar a chamada de `<LeadsKanban>` (linhas 201-207) por:

```tsx
<LeadsKanban
  leads={list.leads}
  stages={board.stages}
  entriesByLead={board.entriesByLead}
  summaryByStage={board.summaryByStage}
  sellersById={sellersById}
  onLeadMoved={handleLeadMoved}
  onRequestClose={handleRequestClose}
/>
```

- [ ] **Step 7: Trocar o tipo das etapas no board**

Em `LeadsKanban.tsx`, substituir a interface de props e o agrupamento:

```tsx
import type { ID, IFunnelBoardSummary, ILead, ILeadFunnelEntry, ILeadFunnelStage, ISeller } from "@/shared/types";
import { bucketLeadsByStage } from "@/features/funnels/engine/boardBuckets";

export interface ILeadsKanbanProps {
  leads: ILead[];
  stages: ILeadFunnelStage[];
  entriesByLead: Map<ID, ILeadFunnelEntry>;
  summaryByStage: Map<ID, IFunnelBoardSummary>;
  sellersById: Map<ID, ISeller>;
  onLeadMoved: (lead: ILead, toStage: ILeadFunnelStage) => void;
  /** Chamado ao soltar em etapa `ganho`/`perda` — a página abre a decisão. */
  onRequestClose: (lead: ILead) => void;
}
```

Remover `computeStageMetrics`, `metricsByStage` e `CLOSING_STAGE_ID` do arquivo; substituir `leadsByStage` por:

```tsx
const buckets = useMemo(
  () => bucketLeadsByStage({ leads, entriesByLead, stages }),
  [leads, entriesByLead, stages],
);
```

Em `KanbanColumn.tsx`, trocar `stage: IPipelineStage` por `stage: ILeadFunnelStage`, `leads: ILead[]` por `cards: IBoardCard[]`, e a faixa de cor por `getAccentClasses(stage.accent).bar` — a etapa **já tem** slot de accent, então `hexToAccentSlot(stage.color)` sai junto com o import de `legacyStageColor`.

- [ ] **Step 8: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
bun run test
```
Esperado: nenhum erro em `features/leads` nem `features/funnels`; suíte verde.

- [ ] **Step 9: Commit**

```bash
git add src/features/funnels/engine/boardBuckets.ts src/features/funnels/engine/boardBuckets.test.ts \
        src/features/funnels/hooks/useFunnelBoard.ts \
        src/features/leads/components/kanban/LeadsKanban.tsx \
        src/features/leads/components/kanban/KanbanColumn.tsx \
        src/features/leads/pages/LeadsPage.tsx
git commit -m "feat(funnels): board reads stages and cards from the active funnel"
```

---

## Task 2: Cabeçalho da coluna com os números que fazem alguém agir

Troca "N leads · Média X dias" por **soma dos valores** e **"N atrasados" clicável**. A média vai para o `Tooltip` — é número de relatório, não de ação.

**Files:**
- Create: `src/features/funnels/engine/columnStats.ts`
- Test: `src/features/funnels/engine/columnStats.test.ts`
- Create: `src/features/leads/components/kanban/ColumnHeader.tsx`
- Modify: `src/features/leads/components/kanban/KanbanColumn.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `IBoardCard` (Task 1), `IFunnelBoardSummary`.
- Produces: `resolveColumnStats(input: IColumnStatsInput): IColumnStats` com `{ count, sumValue, overdueCount, averageDays, isPartial }`.

- [ ] **Step 1: Escrever o teste que falha**

`src/features/funnels/engine/columnStats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveColumnStats } from "./columnStats";
import type { IBoardCard } from "./boardBuckets";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function card(id: string, value: number | undefined, nextActionAt: string | undefined, enteredStageAt: string): IBoardCard {
  return {
    lead: { id, name: id, nextActionAt } as IBoardCard["lead"],
    entry: { id: `e-${id}`, leadId: id, estimatedValue: value, enteredStageAt } as IBoardCard["entry"],
  };
}

const CARDS = [
  card("a", 1000, "2026-08-01T12:00:00.000Z", "2026-08-04T12:00:00.000Z"), // atrasado
  card("b", 500, "2026-08-20T12:00:00.000Z", "2026-08-02T12:00:00.000Z"),
  card("c", undefined, undefined, "2026-07-31T12:00:00.000Z"),
];

describe("resolveColumnStats", () => {
  it("prefere o agregado do servidor ao que está carregado no cliente", () => {
    const stats = resolveColumnStats({
      cards: CARDS,
      summary: { stageId: "s", count: 903, sumValue: 750_000, overdueCount: 87 },
      now: NOW,
    });
    expect(stats.count).toBe(903);
    expect(stats.sumValue).toBe(750_000);
    expect(stats.overdueCount).toBe(87);
    expect(stats.isPartial).toBe(false);
  });

  it("cai para o cálculo local quando o agregado ainda não chegou", () => {
    const stats = resolveColumnStats({ cards: CARDS, summary: undefined, now: NOW });
    expect(stats.count).toBe(3);
    expect(stats.sumValue).toBe(1500);
    expect(stats.overdueCount).toBe(1);
    expect(stats.isPartial).toBe(true);
  });

  it("soma o valor da PARTICIPAÇÃO, não o do lead", () => {
    // Um lead em dois funis são duas receitas; somar o valor do lead contaria a
    // mesma oportunidade duas vezes (decisão 5 do dono).
    const c = card("x", 200, undefined, "2026-08-01T12:00:00.000Z");
    (c.lead as { estimatedValue?: number }).estimatedValue = 9_999;
    expect(resolveColumnStats({ cards: [c], summary: undefined, now: NOW }).sumValue).toBe(200);
  });

  it("trata participação sem valor como zero, nunca como NaN", () => {
    const stats = resolveColumnStats({ cards: [CARDS[2]!], summary: undefined, now: NOW });
    expect(stats.sumValue).toBe(0);
  });

  it("calcula a média de dias na etapa a partir de enteredStageAt", () => {
    // 2, 4 e 6 dias → média 4.
    const stats = resolveColumnStats({ cards: CARDS, summary: undefined, now: NOW });
    expect(stats.averageDays).toBe(4);
  });

  it("devolve média zero para coluna vazia em vez de dividir por zero", () => {
    const stats = resolveColumnStats({ cards: [], summary: undefined, now: NOW });
    expect(stats.averageDays).toBe(0);
    expect(stats.count).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/funnels/engine/columnStats.test.ts
```
Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o engine**

`src/features/funnels/engine/columnStats.ts`:

```ts
import type { IFunnelBoardSummary, Money } from "@/shared/types";
import type { IBoardCard } from "./boardBuckets";

export interface IColumnStatsInput {
  cards: IBoardCard[];
  summary: IFunnelBoardSummary | undefined;
  now: Date;
}

export interface IColumnStats {
  count: number;
  sumValue: Money;
  overdueCount: number;
  /** Sempre local: o agregado do servidor não carrega média. */
  averageDays: number;
  /** true quando os números descrevem só o que está carregado. */
  isPartial: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Estatísticas do cabeçalho.
 *
 * O agregado do servidor vence sempre que existe: com paginação por coluna, o
 * cliente enxerga 40 de 903 e contar o que está em memória mostraria "40" numa
 * coluna de novecentos.
 */
export function resolveColumnStats({ cards, summary, now }: IColumnStatsInput): IColumnStats {
  const nowMs = now.getTime();

  let localSum = 0;
  let localOverdue = 0;
  let daysTotal = 0;

  for (const { lead, entry } of cards) {
    localSum += entry.estimatedValue ?? 0;
    if (lead.nextActionAt && new Date(lead.nextActionAt).getTime() < nowMs) localOverdue += 1;
    daysTotal += Math.max(0, Math.floor((nowMs - new Date(entry.enteredStageAt).getTime()) / DAY_MS));
  }

  const averageDays = cards.length === 0 ? 0 : Math.round((daysTotal / cards.length) * 10) / 10;

  if (summary) {
    return {
      count: summary.count,
      sumValue: summary.sumValue,
      overdueCount: summary.overdueCount,
      averageDays,
      isPartial: false,
    };
  }

  return {
    count: cards.length,
    sumValue: localSum,
    overdueCount: localOverdue,
    averageDays,
    isPartial: true,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/funnels/engine/columnStats.test.ts
```
Esperado: PASS, 6 testes.

- [ ] **Step 5: Textos novos**

Em `src/features/leads/i18n/pt-BR.ts`, dentro de `kanban`, acrescentar:

```ts
    columnSum: "Soma dos valores desta etapa",
    overdue: (n: number) => `${n} ${n === 1 ? "atrasado" : "atrasados"}`,
    overdueHint: "Filtrar só os atrasados",
    averageDaysTooltip: (days: number) =>
      `Média de ${days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${days === 1 ? "dia" : "dias"} nesta etapa`,
    partialHint: "Contagem parcial — o total do servidor ainda está carregando.",
```

- [ ] **Step 6: Escrever o cabeçalho**

`src/features/leads/components/kanban/ColumnHeader.tsx` — componente de apresentação recebendo `stage`, `stats`, `onFilterOverdue` e `menu` (o `⋮`, que a Task 3 preenche). Estrutura obrigatória:

```tsx
<div className="overflow-hidden rounded-t-lg">
  {/* Faixa de cor: background em elemento dedicado, nunca border (ver Global Constraints). */}
  <div className={cn("h-[3px]", getAccentClasses(stage.accent).bar)} />
  <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
    <div className="min-w-0">
      <p className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
        {stage.name}
      </p>
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="tabular-nums">{formatBRLCompact(stats.sumValue)}</span>
          </TooltipTrigger>
          <TooltipContent>{LEADS_STRINGS.kanban.columnSum}</TooltipContent>
        </Tooltip>
        {stats.overdueCount > 0 && (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={onFilterOverdue}
              title={LEADS_STRINGS.kanban.overdueHint}
              className="rounded text-severity-warning underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {LEADS_STRINGS.kanban.overdue(stats.overdueCount)}
            </button>
          </>
        )}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {stats.count}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {LEADS_STRINGS.kanban.averageDaysTooltip(stats.averageDays)}
          {stats.isPartial && <> · {LEADS_STRINGS.kanban.partialHint}</>}
        </TooltipContent>
      </Tooltip>
      {menu}
    </div>
  </header>
</div>
```

`onFilterOverdue` chama `url.patchFilters({ nextAction: "overdue" })` — a página passa o callback.

- [ ] **Step 7: Consumir no KanbanColumn e verificar**

`KanbanColumn.tsx` substitui o bloco de `<header>` (linhas 64-80) por `<ColumnHeader …/>`, calculando `const stats = useMemo(() => resolveColumnStats({ cards, summary, now: new Date() }), [cards, summary]);`.

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
bun run test
```
Esperado: sem erros; suíte verde.

- [ ] **Step 8: Commit**

```bash
git add src/features/funnels/engine/columnStats.ts src/features/funnels/engine/columnStats.test.ts \
        src/features/leads/components/kanban/ColumnHeader.tsx \
        src/features/leads/components/kanban/KanbanColumn.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): column header shows value sum and clickable overdue count"
```

---

## Task 3: Ordenação por etapa, com preferência compartilhada

Ordenação **padrão muda com o `kind`**: em `entrada`, mais antigos primeiro — o lead velho é o que apodrece, e hoje ele é o último dos 903. A preferência é gravada **por `stageId`**, nunca numa chave única: com N funis, uma chave global sobrescreveria a preferência de todos os boards.

**Files:**
- Create: `src/features/funnels/engine/boardSort.ts`
- Test: `src/features/funnels/engine/boardSort.test.ts`
- Create: `src/features/leads/hooks/useColumnPreferences.ts`
- Modify: `src/features/leads/components/kanban/ColumnHeader.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `IBoardCard`, `LeadFunnelStageKind`.
- Produces:
  - `type BoardSortMode = "oldest" | "newest" | "nextAction" | "highestValue" | "stalest"`
  - `defaultSortForKind(kind: LeadFunnelStageKind): BoardSortMode`
  - `sortBoardCards(cards: IBoardCard[], mode: BoardSortMode, now: Date): IBoardCard[]`
  - `useColumnPreferences(): { sortByStage, collapsedByStage, setSort, toggleCollapsed }`

- [ ] **Step 1: Escrever o teste que falha**

`src/features/funnels/engine/boardSort.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultSortForKind, sortBoardCards, BOARD_SORT_MODES } from "./boardSort";
import type { IBoardCard } from "./boardBuckets";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function card(id: string, createdAt: string, nextActionAt: string | undefined, value: number, enteredStageAt: string): IBoardCard {
  return {
    lead: { id, name: id, createdAt, nextActionAt } as IBoardCard["lead"],
    entry: { id: `e-${id}`, leadId: id, estimatedValue: value, enteredStageAt } as IBoardCard["entry"],
  };
}

const A = card("a", "2026-01-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z", 100, "2026-08-05T00:00:00.000Z");
const B = card("b", "2026-06-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z", 900, "2026-01-01T00:00:00.000Z");
const C = card("c", "2026-03-01T00:00:00.000Z", undefined, 500, "2026-07-01T00:00:00.000Z");
const CARDS = [A, B, C];

const ids = (cards: IBoardCard[]) => cards.map((c) => c.lead.id);

describe("defaultSortForKind", () => {
  it("põe os mais antigos primeiro na etapa de entrada", () => {
    expect(defaultSortForKind("entrada")).toBe("oldest");
  });

  it("ordena pelas demais etapas por próxima ação", () => {
    for (const kind of ["aberta", "ganho", "perda"] as const) {
      expect(defaultSortForKind(kind)).toBe("nextAction");
    }
  });
});

describe("sortBoardCards", () => {
  it("oldest: do mais antigo ao mais novo por criação", () => {
    expect(ids(sortBoardCards(CARDS, "oldest", NOW))).toEqual(["a", "c", "b"]);
  });

  it("newest: o inverso exato de oldest", () => {
    expect(ids(sortBoardCards(CARDS, "newest", NOW))).toEqual(["b", "c", "a"]);
  });

  it("nextAction: quem tem data vem antes; sem data vai para o fim", () => {
    expect(ids(sortBoardCards(CARDS, "nextAction", NOW))).toEqual(["b", "a", "c"]);
  });

  it("highestValue: pelo valor da participação, decrescente", () => {
    expect(ids(sortBoardCards(CARDS, "highestValue", NOW))).toEqual(["b", "c", "a"]);
  });

  it("stalest: mais tempo parado na etapa primeiro", () => {
    expect(ids(sortBoardCards(CARDS, "stalest", NOW))).toEqual(["b", "c", "a"]);
  });

  it("não muta o array recebido", () => {
    const original = [...CARDS];
    sortBoardCards(CARDS, "highestValue", NOW);
    expect(CARDS).toEqual(original);
  });

  it("expõe os cinco modos que o menu oferece", () => {
    expect(BOARD_SORT_MODES).toEqual(["oldest", "newest", "nextAction", "highestValue", "stalest"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/funnels/engine/boardSort.test.ts
```
Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o engine**

`src/features/funnels/engine/boardSort.ts`:

```ts
import type { LeadFunnelStageKind } from "@/shared/types";
import type { IBoardCard } from "./boardBuckets";

export const BOARD_SORT_MODES = ["oldest", "newest", "nextAction", "highestValue", "stalest"] as const;
export type BoardSortMode = (typeof BOARD_SORT_MODES)[number];

/**
 * Na etapa de entrada, mais antigos primeiro.
 *
 * O board hoje fica em ordem de criação decrescente, ou seja, o lead esquecido
 * é o último dos novecentos — exatamente o que ninguém rola até o fim para ver.
 */
export function defaultSortForKind(kind: LeadFunnelStageKind): BoardSortMode {
  return kind === "entrada" ? "oldest" : "nextAction";
}

const ms = (iso: string | undefined, fallback: number): number =>
  iso ? new Date(iso).getTime() : fallback;

export function sortBoardCards(cards: IBoardCard[], mode: BoardSortMode, now: Date): IBoardCard[] {
  const nowMs = now.getTime();
  const copy = [...cards];

  switch (mode) {
    case "oldest":
      return copy.sort((a, b) => ms(a.lead.createdAt, 0) - ms(b.lead.createdAt, 0));
    case "newest":
      return copy.sort((a, b) => ms(b.lead.createdAt, 0) - ms(a.lead.createdAt, 0));
    case "nextAction":
      // Sem próxima ação não é "urgentíssimo" nem "daqui a pouco" — é ausência
      // de compromisso, e vai para o fim.
      return copy.sort(
        (a, b) =>
          ms(a.lead.nextActionAt, Number.MAX_SAFE_INTEGER) -
          ms(b.lead.nextActionAt, Number.MAX_SAFE_INTEGER),
      );
    case "highestValue":
      return copy.sort((a, b) => (b.entry.estimatedValue ?? 0) - (a.entry.estimatedValue ?? 0));
    case "stalest":
      return copy.sort((a, b) => ms(a.entry.enteredStageAt, nowMs) - ms(b.entry.enteredStageAt, nowMs));
    default:
      return copy;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/funnels/engine/boardSort.test.ts
```
Esperado: PASS, 9 testes.

- [ ] **Step 5: O store de preferências — compartilhado, não por instância**

`src/features/leads/hooks/useColumnPreferences.ts`. **Ler `useFunnelLayoutPreference.ts` antes**: este arquivo repete o mesmo padrão, e pelo mesmo motivo. Uma coluna gravando a preferência precisa que as outras vejam no mesmo tick — com `useState` por coluna, recolher uma não atualizaria o mapa das vizinhas e a próxima gravação apagaria a anterior.

```ts
import { useCallback, useSyncExternalStore } from "react";
import type { ID } from "@/shared/types";
import { BOARD_SORT_MODES, type BoardSortMode } from "@/features/funnels/engine/boardSort";

const SORT_KEY = "gallo-leads-column-sort";
const COLLAPSED_KEY = "gallo-leads-collapsed-columns";

export interface IColumnPreferences {
  sortByStage: Record<ID, BoardSortMode>;
  collapsedByStage: Record<ID, boolean>;
}

function isSortMode(v: unknown): v is BoardSortMode {
  return typeof v === "string" && (BOARD_SORT_MODES as readonly string[]).includes(v);
}

/** Total por construção: um mapa corrompido vira mapa vazio, nunca um throw. */
function readMap<T>(key: string, guard: (v: unknown) => v is T): Record<ID, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<ID, T> = {};
    for (const [k, v] of Object.entries(parsed)) if (guard(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

let current: IColumnPreferences = {
  sortByStage: readMap(SORT_KEY, isSortMode),
  collapsedByStage: readMap(COLLAPSED_KEY, isBool),
};

const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SORT_KEY && e.key !== COLLAPSED_KEY) return;
    current = {
      sortByStage: readMap(SORT_KEY, isSortMode),
      collapsedByStage: readMap(COLLAPSED_KEY, isBool),
    };
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): IColumnPreferences => current;
const getServerSnapshot = (): IColumnPreferences => ({ sortByStage: {}, collapsedByStage: {} });

function persist(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Modo privado ou cota cheia: a sessão segue, sem persistir.
  }
}

export function useColumnPreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSort = useCallback((stageId: ID, mode: BoardSortMode) => {
    const next = { ...current.sortByStage, [stageId]: mode };
    current = { ...current, sortByStage: next };
    persist(SORT_KEY, next);
    emit();
  }, []);

  const toggleCollapsed = useCallback((stageId: ID) => {
    const next = { ...current.collapsedByStage, [stageId]: !current.collapsedByStage[stageId] };
    current = { ...current, collapsedByStage: next };
    persist(COLLAPSED_KEY, next);
    emit();
  }, []);

  return { ...prefs, setSort, toggleCollapsed };
}
```

- [ ] **Step 6: Textos e menu**

Em `LEADS_STRINGS.kanban`, acrescentar:

```ts
    sortLabel: "Ordenar por",
    sortModes: {
      oldest: "Mais antigos",
      newest: "Mais recentes",
      nextAction: "Próxima ação",
      highestValue: "Maior valor",
      stalest: "Parados há mais tempo",
    },
    collapse: "Recolher coluna",
    expand: "Expandir coluna",
    seeInList: "Ver em lista",
    columnMenu: (stage: string) => `Ações da etapa ${stage}`,
```

O `⋮` do `ColumnHeader` vira um `DropdownMenu` com `DropdownMenuRadioGroup` para os cinco modos, mais `Recolher coluna` e `Ver em lista`. O `aria-label` do gatilho usa `columnMenu(stage.name)`.

`KanbanColumn` aplica: `const mode = sortByStage[stage.id] ?? defaultSortForKind(stage.kind);` e `const sorted = useMemo(() => sortBoardCards(cards, mode, new Date()), [cards, mode]);`.

- [ ] **Step 7: Verificar**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
bun run test
```

- [ ] **Step 8: Commit**

```bash
git add src/features/funnels/engine/boardSort.ts src/features/funnels/engine/boardSort.test.ts \
        src/features/leads/hooks/useColumnPreferences.ts \
        src/features/leads/components/kanban/ColumnHeader.tsx \
        src/features/leads/components/kanban/KanbanColumn.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): per-stage column sorting with a shared preference store"
```

---

## Task 4: Recolher a coluna

Reduz a coluna a 44px com o nome em `writing-mode: vertical-rl`. Usa o store da Task 3 — nenhum estado novo.

**Files:**
- Create: `src/features/leads/components/kanban/CollapsedColumn.tsx`
- Modify: `src/features/leads/components/kanban/KanbanColumn.tsx`

**Interfaces:**
- Consumes: `useColumnPreferences` (Task 3), `IColumnStats` (Task 2).
- Produces: `<CollapsedColumn stage={…} count={…} onExpand={…} />`.

- [ ] **Step 1: Escrever o componente**

```tsx
export function CollapsedColumn({ stage, count, onExpand }: ICollapsedColumnProps) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={LEADS_STRINGS.kanban.expand + ` — ${stage.name}`}
      className="flex h-full w-11 shrink-0 flex-col items-center gap-2 overflow-hidden rounded-lg border border-border bg-card py-2 transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn("h-[3px] w-6 rounded-full", getAccentClasses(stage.accent).bar)} aria-hidden />
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
        {count}
      </span>
      <span
        className="min-h-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ writingMode: "vertical-rl" }}
      >
        {stage.name}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Ligar no KanbanColumn**

No topo de `KanbanColumn`, antes de qualquer outro retorno:

```tsx
if (collapsedByStage[stage.id]) {
  return <CollapsedColumn stage={stage} count={stats.count} onExpand={() => toggleCollapsed(stage.id)} />;
}
```

A coluna recolhida **continua sendo alvo de soltura** (Task 9 embrulha esse retorno no `useDroppable` também) — recolher é economia de espaço, não desativação.

- [ ] **Step 3: Verificar manualmente no navegador**

```bash
bun run dev
```
Recolher uma coluna; conferir que as demais **reagem no mesmo tick** (é o defeito da v0.159.1 na forma que este store previne) e que o estado sobrevive ao recarregar.

- [ ] **Step 4: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
bun run test
```

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/components/kanban/CollapsedColumn.tsx src/features/leads/components/kanban/KanbanColumn.tsx
git commit -m "feat(leads): collapse a kanban column to a 44px rail"
```

---

## Task 5: Paginação por coluna

**40 cards por coluna, `Carregar mais 40` no fim, total real do cabeçalho.** Virtualização foi avaliada e descartada na spec: hostiliza o arraste, quebra o `Ctrl+F` do navegador e não resolve o problema humano — 903 cards virtualizados continuam sendo 903 cards que ninguém vai olhar.

**Files:**
- Modify: `src/features/leads/components/kanban/KanbanColumn.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

- [ ] **Step 1: Texto**

```ts
    loadMore: (n: number) => `Carregar mais ${n}`,
    showingOf: (shown: number, total: number) => `${shown} de ${total}`,
```

- [ ] **Step 2: Estado local por coluna**

Este estado **é** legitimamente por instância — cada coluna tem a sua janela, e nenhuma outra precisa vê-la:

```tsx
const PAGE = 40;
const [visible, setVisible] = useState(PAGE);

// Ordenação, filtro ou troca de funil mudam o conjunto: a janela volta ao topo,
// senão a coluna abriria já rolada num conjunto que a pessoa não pediu.
useEffect(() => setVisible(PAGE), [mode, sorted.length, stage.id]);

const shown = sorted.slice(0, visible);
```

- [ ] **Step 3: Rodapé da coluna**

Depois da lista, dentro do scroller:

```tsx
{sorted.length > visible && (
  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setVisible((v) => v + PAGE)}>
    {LEADS_STRINGS.kanban.loadMore(Math.min(PAGE, sorted.length - visible))}
    <span className="ml-1 text-muted-foreground">
      ({LEADS_STRINGS.kanban.showingOf(visible, sorted.length)})
    </span>
  </Button>
)}
```

- [ ] **Step 4: Verificar no navegador**

Abrir o funil `Geral` (3.386 participações). A coluna de entrada deve montar 40 cards, não 900. Conferir no DevTools que a contagem de nós do scroller da coluna é da ordem de dezenas.

- [ ] **Step 5: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
bun run test
```

- [ ] **Step 6: Commit**

```bash
git add src/features/leads/components/kanban/KanbanColumn.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): paginate kanban columns at 40 cards"
```

---

## Task 6: O card cortado ao osso

De ~96px/7 dados para ~60px/4 dados — de ~4 para ~9 cards visíveis por coluna. O que sai vai para o `HoverCard` da Task 7, não para o lixo.

**Files:**
- Create: `src/features/leads/components/kanban/BoardCard.tsx`
- Modify: `src/features/leads/components/kanban/KanbanColumn.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `IBoardCard` (Task 1), `ILeadFunnelStage`.
- Produces: `<BoardCard card={…} stage={…} seller={…} showSeller={…} onOpen={…} />`

- [ ] **Step 1: O que fica e o que sai**

**Fica:** nome (13px, `truncate`), ponto de temperatura (8px, com `aria-label`), valor **da participação** em `tabular-nums`, atraso **só** quando `overdue`/`today`, indicador multi-funil (Task 8), avatar do vendedor (condicional).

**Sai:** avatar do lead, telefone, chip de origem com fundo, fundo do chip de temperatura, borda esquerda colorida, chip de próxima ação quando não urgente, nome do vendedor por extenso.

- [ ] **Step 2: Escrever o card**

```tsx
export function BoardCard({ card, stage, seller, showSeller, onOpen }: IBoardCardProps) {
  const { lead, entry } = card;
  const temperature = TEMPERATURE_META[lead.temperature];
  const nextAction = getNextActionInfo(lead.nextActionAt);
  const urgent = nextAction.urgency === "overdue" || nextAction.urgency === "today";
  // O selo lê a ETAPA DA PARTICIPAÇÃO, não o lead: com N:N o mesmo lead pode
  // estar convertido em Catalisador e aberto em Filtros, e o selo antigo diria
  // "Convertido" nos dois.
  const outcome = stage.kind === "ganho" ? "converted" : stage.kind === "perda" ? "lost" : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(lead.id); }
      }}
      data-lead-id={lead.id}
      aria-label={LEADS_STRINGS.card.ariaLabel(lead.name, stage.name, temperature.label)}
      className={cn(
        "group relative flex min-h-[56px] w-full flex-col justify-center gap-1 rounded-md border border-border bg-card px-2.5 py-2 text-left shadow-sm transition",
        "hover:border-primary/50 hover:shadow-md",
        // focus-visible, não focus: o card é alvo de clique e de arraste, e o
        // anel aparecia a cada mouse-down no comportamento antigo.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        outcome && "opacity-60",
      )}
    >
      {outcome && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-1 rounded-l-md",
            outcome === "converted" ? "bg-severity-success" : "bg-severity-danger",
          )}
        />
      )}

      <div className="flex items-center gap-1.5">
        <span
          className={cn("size-2 shrink-0 rounded-full", temperature.dot)}
          aria-label={temperature.label}
          role="img"
        />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{lead.name}</p>
        {showSeller && seller && (
          <Avatar className="size-4 shrink-0" title={seller.fullName}>
            <AvatarFallback className="text-[8px] font-semibold">
              {getInitials(seller.fullName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className="flex items-center gap-2 pl-3.5 text-[11px]">
        <span className="tabular-nums text-muted-foreground">
          {entry.estimatedValue !== undefined
            ? formatBRLCompact(entry.estimatedValue)
            : LEADS_STRINGS.card.noValue}
        </span>
        {urgent && (
          <span className={cn("inline-flex items-center gap-0.5", nextAction.tone)}>
            <Icon icon="mdi:calendar-alert" size={11} aria-hidden />
            {nextAction.label}
          </span>
        )}
        <span className="ml-auto">{/* indicador multi-funil entra aqui na Task 8 */}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `TEMPERATURE_META` precisa de um `dot`**

`leadDisplay.ts` hoje expõe `tone` (fundo do chip) e `icon`. Acrescentar `dot` com o token semântico correspondente a cada temperatura — o card novo usa ponto, não chip. **Não** inventar cor: reaproveitar os mesmos tokens de severidade já usados em `tone`.

- [ ] **Step 4: Texto do `aria-label`**

```ts
    ariaLabel: (name: string, stage: string, temperature: string) =>
      `Lead ${name}, etapa ${stage}, temperatura ${temperature}`,
```

Substitui `estágio ${lead.stage.name}` — que nomeava a etapa do pipeline legado, não a do funil aberto.

- [ ] **Step 5: `showSeller`**

A coluna passa `showSeller={!singleSellerBoard}`. `singleSellerBoard` é verdadeiro quando o board já está filtrado por um vendedor só — o caso do vendedor comum, forçado em `LeadsPage.tsx:66-79`. Repetir o mesmo avatar em todos os cards é ruído.

- [ ] **Step 6: Verificar altura no navegador**

```bash
bun run dev
```
Medir um card no DevTools: deve ficar entre 56 e 64px. Conferir ~9 cards visíveis numa coluna a 768px de altura.

- [ ] **Step 7: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
bun run test
```

- [ ] **Step 8: Commit**

```bash
git add src/features/leads/components/kanban/BoardCard.tsx \
        src/features/leads/components/kanban/KanbanColumn.tsx \
        src/features/leads/utils/leadDisplay.ts src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): trim the kanban card to two lines and 60px"
```

---

## Task 7: O `HoverCard` com o que foi cortado

Nada do que saiu do card foi perdido — foi para 400ms de hover.

**Files:**
- Create: `src/features/leads/components/kanban/BoardCardHover.tsx`
- Modify: `src/features/leads/components/kanban/BoardCard.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

- [ ] **Step 1: Conteúdo**

Telefone (`formatPhone`), origem (`getOriginMeta`), tags do lead, **dias na etapa** (de `entry.enteredStageAt`, não do lead), criado em, e a lista de funis do lead com a etapa em cada — esta última reaproveitando `useLeadFunnelChips`, já montado pela página.

- [ ] **Step 2: Embrulhar o card**

```tsx
<HoverCard openDelay={400}>
  <HoverCardTrigger asChild>{cardElement}</HoverCardTrigger>
  <HoverCardContent align="start" className="w-72">
    <BoardCardHover card={card} chips={chips} />
  </HoverCardContent>
</HoverCard>
```

`openDelay={400}` não é enfeite: sem ele, arrastar um card pela coluna abre um popover a cada card que o ponteiro cruza.

- [ ] **Step 3: Verificar no navegador**

Passar o mouse por cima e conferir que o popover aparece só após a pausa, e que **arrastar não abre popover nenhum**.

- [ ] **Step 4: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
bun run test
```

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/components/kanban/BoardCardHover.tsx \
        src/features/leads/components/kanban/BoardCard.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): hover card carries what the trimmed card dropped"
```

---

## Task 8: Indicador de multi-funil

`⑃ N` discreto, **sem cor**: estar em vários funis é contexto, não urgência, e não pode competir com o aviso de atraso — o único sinal que faz alguém agir. **N é o número de *outros* funis, e conta apenas os que a pessoa acessa** — mostrar o total real vazaria a estrutura comercial que o controle de acesso protege.

**Files:**
- Create: `src/features/funnels/engine/otherFunnels.ts`
- Test: `src/features/funnels/engine/otherFunnels.test.ts`
- Create: `src/features/leads/components/kanban/OtherFunnelsBadge.tsx`
- Modify: `src/features/leads/components/kanban/BoardCard.tsx`
- Modify: `src/features/leads/hooks/useLeadsUrlState.ts`
- Modify: `src/routes/app.leads.tsx`
- Modify: `src/features/funnels/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `ILeadFunnelChip` de `@/features/funnels/hooks/useLeadFunnelChips`.
- Produces: `otherFunnelsFor(chips: ILeadFunnelChip[] | undefined, currentFunnelId: ID): ILeadFunnelChip[]`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { otherFunnelsFor } from "./otherFunnels";

const chip = (funnelId: string, name: string) => ({ funnelId, name, accent: 1 as const });

describe("otherFunnelsFor", () => {
  it("exclui o funil do board corrente", () => {
    const out = otherFunnelsFor([chip("a", "Catalisador"), chip("b", "Filtros")], "a");
    expect(out.map((c) => c.funnelId)).toEqual(["b"]);
  });

  it("devolve vazio quando o lead só está no funil corrente", () => {
    expect(otherFunnelsFor([chip("a", "Catalisador")], "a")).toEqual([]);
  });

  it("devolve vazio quando o lead não tem chips carregados", () => {
    expect(otherFunnelsFor(undefined, "a")).toEqual([]);
  });

  it("não conta o mesmo funil duas vezes", () => {
    const out = otherFunnelsFor([chip("b", "Filtros"), chip("b", "Filtros")], "a");
    expect(out).toHaveLength(1);
  });

  it("preserva a ordem em que os funis chegaram", () => {
    const out = otherFunnelsFor([chip("c", "Módulos"), chip("b", "Filtros")], "a");
    expect(out.map((c) => c.name)).toEqual(["Módulos", "Filtros"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/funnels/engine/otherFunnels.test.ts
```

- [ ] **Step 3: Implementar**

```ts
import type { ID } from "@/shared/types";
import type { ILeadFunnelChip } from "../hooks/useLeadFunnelChips";

/**
 * Os outros funis em que o lead está.
 *
 * A entrada já vem filtrada pelos funis que a pessoa alcança
 * (`useLeadFunnelChips` é alimentado por `useFunnelNavigation`), então o número
 * exibido nunca revela linha de negócio fora da alçada de quem olha. Não é
 * fronteira de segurança — é redução de ruído, e a spec (§3.2) deixa os nomes
 * legíveis pela API a quem tem permissão.
 */
export function otherFunnelsFor(
  chips: ILeadFunnelChip[] | undefined,
  currentFunnelId: ID,
): ILeadFunnelChip[] {
  if (!chips || chips.length === 0) return [];
  const seen = new Set<ID>([currentFunnelId]);
  const out: ILeadFunnelChip[] = [];
  for (const c of chips) {
    if (seen.has(c.funnelId)) continue;
    seen.add(c.funnelId);
    out.push(c);
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/funnels/engine/otherFunnels.test.ts
```
Esperado: PASS, 5 testes.

- [ ] **Step 5: O parâmetro `highlight` na URL**

Em `src/routes/app.leads.tsx`, acrescentar `highlight: z.string().optional()` ao schema de busca. Em `useLeadsUrlState`, expor `highlight: search.highlight` e `setHighlight: (id) => apply({ highlight: id })`.

- [ ] **Step 6: O selo**

```tsx
export function OtherFunnelsBadge({ others, onGo }: IOtherFunnelsBadgeProps) {
  if (others.length === 0) return null;
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <span
          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
          aria-label={FUNNELS_COPY.otherFunnels.ariaLabel(others.length)}
        >
          <Icon icon="mdi:source-branch" size={11} aria-hidden />
          {others.length}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-56 p-1">
        {others.map((o) => (
          <button
            key={o.funnelId}
            type="button"
            onClick={() => onGo(o.funnelId)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(o.accent).dot)} aria-hidden />
            <span className="truncate">{o.name}</span>
          </button>
        ))}
      </HoverCardContent>
    </HoverCard>
  );
}
```

Textos em `FUNNELS_COPY`:

```ts
  otherFunnels: {
    ariaLabel: (n: number) => (n === 1 ? "Também está em outro funil" : `Também está em ${n} outros funis`),
  },
```

- [ ] **Step 7: Navegação com destaque**

`onGo(funnelId)` faz `url.setFunnel(funnelId)` **e** `url.setHighlight(leadId)`. Em `KanbanColumn`, quando `highlight` casa com um card montado: `scrollIntoView({ block: "center" })` e `ring-2 ring-primary` por 2s, limpando o parâmetro depois — senão o destaque volta a cada render.

- [ ] **Step 8: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)|routes/app.leads"
bun run test
```

- [ ] **Step 9: Commit**

```bash
git add src/features/funnels/engine/otherFunnels.ts src/features/funnels/engine/otherFunnels.test.ts \
        src/features/leads/components/kanban/OtherFunnelsBadge.tsx \
        src/features/leads/components/kanban/BoardCard.tsx \
        src/features/leads/components/kanban/KanbanColumn.tsx \
        src/features/leads/hooks/useLeadsUrlState.ts src/routes/app.leads.tsx \
        src/features/funnels/i18n/pt-BR.ts
git commit -m "feat(leads): multi-funnel indicator with jump-and-highlight"
```

---

## Task 9: Arraste com `@dnd-kit`

Hoje o arraste usa a API HTML5 nativa: **só mouse**. Não existe forma de mover um lead sem apontador — e a plataforma já tem a solução instalada e validada em `RotationQueueManager.tsx:141-144`.

**Files:**
- Modify: `src/features/leads/components/kanban/LeadsKanban.tsx`
- Modify: `src/features/leads/components/kanban/KanbanColumn.tsx`
- Modify: `src/features/leads/components/kanban/BoardCard.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

- [ ] **Step 1: Sensores**

```tsx
const sensors = useSensors(
  // distance: 6 — hoje `cursor-grab` está sempre ativo e o clique compete com
  // o arraste; abrir a ficha ao clicar exige que um micro-movimento não vire
  // arraste.
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

- [ ] **Step 2: `DndContext` com anúncios em pt-BR**

```tsx
<DndContext
  sensors={sensors}
  onDragStart={(e) => setDragging(cardById.get(String(e.active.id)) ?? null)}
  onDragEnd={handleDragEnd}
  onDragCancel={() => setDragging(null)}
  accessibility={{ announcements: LEADS_STRINGS.kanban.dnd }}
>
```

```ts
    dnd: {
      onDragStart: ({ active }) => `Pegou o lead ${active.id}.`,
      onDragOver: ({ over }) => (over ? `Sobre a etapa ${over.id}.` : "Fora de qualquer etapa."),
      onDragEnd: ({ over }) => (over ? `Solto na etapa ${over.id}.` : "Solto fora — nada mudou."),
      onDragCancel: () => "Movimento cancelado.",
    },
```

- [ ] **Step 3: Coluna como alvo, card como arrastável**

`KanbanColumn` usa `useDroppable({ id: stage.id })` e aplica `isOver && "border-primary bg-accent/40"`. `BoardCard` usa `useDraggable({ id: lead.id })` com `{...listeners} {...attributes}`. `CollapsedColumn` (Task 4) também recebe `useDroppable`.

- [ ] **Step 4: `DragOverlay`**

```tsx
<DragOverlay>
  {dragging && (
    <div className="scale-[1.02] shadow-lg">
      <BoardCard card={dragging} stage={stageOf(dragging)} showSeller={false} onOpen={() => {}} />
    </div>
  )}
</DragOverlay>
```

Sem deslocamento de layout: o overlay é uma cópia flutuante, o original permanece no lugar.

- [ ] **Step 5: O drop move a participação, não o lead**

```tsx
const handleDragEnd = useCallback(async (e: DragEndEvent) => {
  setDragging(null);
  const over = e.over;
  if (!over) return;
  const card = cardById.get(String(e.active.id));
  const target = stages.find((s) => s.id === String(over.id));
  if (!card || !target || card.entry.stageId === target.id) return;

  // Deixa de comparar com CLOSING_STAGE_ID (uma constante no código) e passa a
  // olhar o kind da etapa — que é dado do funil, e existe em todos eles.
  if (target.kind === "ganho" || target.kind === "perda") {
    onRequestClose(card.lead);
    return;
  }

  try {
    // moveEntry, não leads.update: com N:N o arraste altera APENAS a
    // participação do funil corrente. As outras não são tocadas.
    await provider.moveEntry(card.entry.id, target.id);
    auditLog({
      action: "lead_funnel_entry.stage_changed",
      resource: "lead",
      resourceId: card.lead.id,
      before: { stageId: card.entry.stageId },
      after: { stageId: target.id },
    });
    toast.success(LEADS_STRINGS.toasts.moved(target.name));
    onLeadMoved(card.lead, target);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-entries", funnelId] }),
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-board-summary", funnelId] }),
    ]);
  } catch {
    toast.error(LEADS_STRINGS.toasts.moveError);
  }
}, [cardById, stages, provider, queryClient, funnelId, onLeadMoved, onRequestClose]);
```

- [ ] **Step 6: Remover o arraste antigo**

Apagar de `LeadsKanban` e `KanbanColumn`: `handleCardDragStart`, `handleCardDragEnd`, `handleDragOver`, `handleDrop`, `dropTargetId`, `draggedRef`, o estado `hover` e todos os `onDragOver`/`onDrop`/`onDragStart`/`onDragEnd` nativos. `LeadCard.tsx` **não** perde os seus — a visão Lista segue usando.

- [ ] **Step 7: Verificar pelo teclado**

```bash
bun run dev
```
Sem tocar no mouse: `Tab` até um card, `Space` para pegar, setas para mover, `Space` para soltar, `Esc` para cancelar. Confirmar que o leitor de tela anuncia cada passo em pt-BR. **Este é o critério de aceite da task** — é a capacidade que não existia.

- [ ] **Step 8: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/leads"
bun run test
bun run build
```

- [ ] **Step 9: Commit**

```bash
git add src/features/leads/components/kanban/ src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): keyboard-accessible drag with dnd-kit, moving the entry"
```

---

## Task 10: "Mover para…" sem arraste

A string `LEADS_STRINGS.kanban.quickMove` existe em `i18n/pt-BR.ts:90` **e não tem consumidor** desde que foi escrita. Esta task lhe dá um.

**Files:**
- Create: `src/features/leads/components/kanban/MoveToMenu.tsx`
- Modify: `src/features/leads/components/kanban/BoardCard.tsx`

- [ ] **Step 1: O menu**

`DropdownMenu` listando as etapas do funil, com a atual `disabled`, cada item chamando o mesmo `onMove(stageId)` do arraste. Gatilho: botão `⋮` de 20px que aparece em `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` — invisível em repouso, alcançável por teclado.

- [ ] **Step 2: Não sequestrar o `Enter`**

O `Enter` no card **abre a ficha do lead** — comportamento de hoje, e o que a pessoa espera de um card. O menu é alcançado por `Tab` até o `⋮`. Reaproveitar `Enter` para abrir o menu quebraria o caminho principal para poupar um `Tab`.

- [ ] **Step 3: Verificar no navegador**

Mover um lead pelo menu; conferir que o toast e a invalidação são os mesmos do arraste.

- [ ] **Step 4: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/leads"
bun run test
```

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/components/kanban/MoveToMenu.tsx src/features/leads/components/kanban/BoardCard.tsx
git commit -m "feat(leads): move a lead from the card menu, without dragging"
```

---

## Task 11: O filtro "Estágio" segue o funil aberto

Com o board mostrando etapas do funil e o filtro listando etapas do pipeline da loja, escolher um estágio esvaziaria o quadro sem explicar por quê. O filtro precisa falar a mesma língua do board.

**Files:**
- Modify: `src/features/leads/components/LeadsFiltersBar.tsx`
- Modify: `src/features/leads/pages/LeadsPage.tsx`
- Modify: `src/features/leads/components/kanban/LeadsKanban.tsx`

- [ ] **Step 1: Origem das opções**

`LeadsPage` passa `stages={board.stages.length > 0 ? board.stages : stages}` para a barra de filtros. Em "Todos os funis" não há eixo X comum (spec §6.3) e a lista legada permanece.

- [ ] **Step 2: Onde o filtro é aplicado**

`useLeadsList` filtra por `l.stage.id` (`useLeadsList.ts:100-103`) — o snapshot legado. No board, aplicar sobre a **participação**, dentro de `LeadsKanban`, depois do agrupamento:

```tsx
const buckets = useMemo(() => {
  const all = bucketLeadsByStage({ leads, entriesByLead, stages });
  if (stageFilterIds.length === 0) return all;
  const keep = new Set(stageFilterIds);
  // Etapa não selecionada some da lista de colunas, não vira coluna vazia:
  // filtrar por etapa é pedir para ver só aquelas.
  return new Map([...all].filter(([stageId]) => keep.has(stageId)));
}, [leads, entriesByLead, stages, stageFilterIds]);
```

- [ ] **Step 3: Verificar no navegador**

Escolher uma etapa no filtro com um funil não-padrão aberto; confirmar que sobram as colunas escolhidas, com os cards certos.

- [ ] **Step 4: Verificar tipos e suíte**

```bash
bunx tsc --noEmit 2>&1 | grep -E "features/leads"
bun run test
```

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/components/LeadsFiltersBar.tsx src/features/leads/pages/LeadsPage.tsx \
        src/features/leads/components/kanban/LeadsKanban.tsx
git commit -m "feat(leads): stage filter follows the open funnel"
```

---

## Task 12: Documentação, changelog e versão

**Files:**
- Modify: `docs/superpowers/handoff-leads-multi-funil.md`
- Modify: `CHANGELOG.md` · `package.json` · `CLAUDE.md`

- [ ] **Step 1: Atualizar o handoff**

Na tabela das 7 fases (§3), marcar a fase 4 como ✅ entregue com a versão. Atualizar o cabeçalho (`Status`, `Última auditoria`, `Worktrees`). Na tabela dos 5 diagnósticos (§3.2), marcar os itens 2, 4 e 5 como resolvidos.

- [ ] **Step 2: Verificação completa antes do bump**

```bash
bun run test
bun run build
bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"
```
Esperado: suíte verde, build ok, nenhum erro novo.

- [ ] **Step 3: Escolher a versão**

MINOR — a fase 4 é feature visível. Antes de escolher o codinome, **extrair os já usados** e conferir que o novo é inédito:

```bash
grep -oE "^## \[[0-9.]+\] — [A-Za-z]+" CHANGELOG.md | awk '{print $NF}' | sort -u
```
Já queimaram "Compass" e "Almanac" numa tentativa anterior por não rodar esta checagem.

- [ ] **Step 4: Changelog em linguagem de usuário**

O `CHANGELOG.md` é também o changelog da UI — quem lê é o vendedor, não o programador. Descrever o que mudou na tela: o quadro é o do funil, os números do cabeçalho, o card menor, mover pelo teclado.

- [ ] **Step 5: Commit e PR**

```bash
git add -A
git commit -m "chore: bump version to vX.Y.0 <Codinome> and update changelog"
git push -u origin feat/leads-multi-funil-fase4
gh pr create --base main --title "feat(leads): the kanban becomes the funnel's board — phase 4 — vX.Y.0"
```

- [ ] **Step 6: Conferência manual no navegador — parte da task, não epílogo**

As duas correções recentes (v0.159.1 e v0.159.2) passaram por build, `tsc`, 2.570 testes e CI, e quebraram na tela. Antes de pedir merge, exercitar em `Geral` e num funil não-padrão:

1. as colunas são as do funil aberto, e mudam ao trocar de funil;
2. arrastar move só a participação daquele funil — conferir no outro board que a etapa lá **não** mudou;
3. `Space`/setas/`Space` movem um card sem mouse;
4. recolher uma coluna reflete nas outras **sem recarregar**;
5. "Carregar mais 40" acrescenta sem duplicar;
6. o selo Convertido/Perdido aparece pelo `kind` da etapa da participação;
7. o indicador `⑃ N` conta **outros** funis e o clique leva ao board certo com o card destacado.

---

## Auto-revisão

**Cobertura da spec §7**

| Item | Task |
|---|---|
| 7.1 paginação incremental, 40/coluna | 5 |
| 7.2 cabeçalho: soma, atrasados clicável, média no tooltip, menu `⋮`, ordenação por `kind`, persistência por `stageId`, colapso 44px | 2, 3, 4 |
| 7.3 `@dnd-kit`, `PointerSensor` distance 6, `KeyboardSensor`, `DragOverlay`, anúncios pt-BR, `quickMove`, drop só na participação, `kind` no lugar de `CLOSING_STAGE_ID` | 9, 10 |
| 7.4 card 60px, o que sai/fica, selo pela participação, `HoverCard`, `focus-visible`, `min-h-[56px]`, `aria-label` novo | 6, 7 |
| 7.5 indicador multi-funil, hover, navegação com destaque, só funis acessíveis | 8 |
| 7.6 barra de métricas removida | ✅ fase 3 |
| 7.7 modo triagem | fase 7 (fora de escopo) |
| 7.8 leads sem dono | comportamento herdado, sem trabalho |
| 7.9 conformidade de UX do header | ✅ fase 3 |
| §3.2 diagnóstico 2 (903 cards no DOM) | 5 |
| §3.2 diagnóstico 4 (sem caminho por teclado) | 9 |
| §3.2 diagnóstico 5 (`CLOSING_STAGE_ID` constante) | 9 |

**Consistência de tipos** — `IBoardCard` (Task 1) é consumido por `resolveColumnStats` (2), `sortBoardCards` (3), `BoardCard` (6), `BoardCardHover` (7) e `handleDragEnd` (9) com a mesma forma `{ lead, entry }`. `BoardSortMode` (3) é o tipo do mapa em `useColumnPreferences` (3) e do `DropdownMenuRadioGroup` (3). `ILeadFunnelStage` substitui `IPipelineStage` em `LeadsKanban`, `KanbanColumn`, `ColumnHeader`, `CollapsedColumn`, `BoardCard` e `MoveToMenu` — e **não** em `LeadsFiltersBar` nem `NewLeadModal`, que seguem legados de propósito.

**Riscos anotados** — `getBoardSummary` pode não refletir os filtros do cliente: o cabeçalho mostra o total real da etapa enquanto a coluna mostra o conjunto filtrado. É deliberado (o total real é o que faz agir), e `isPartial` mais o tooltip explicam a diferença. Se na conferência manual isso confundir, a saída é rotular o número, não trocar a fonte.
