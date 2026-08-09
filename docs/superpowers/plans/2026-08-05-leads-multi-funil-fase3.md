# Leads Multi-Funil — Plano 2 (Fase 3: Navegação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao usuário a troca de funil na página de Leads — em três padrões de navegação que ele escolhe — com o funil ativo na URL, "Todos os funis" em lista, e o formulário mínimo de criar funil.

**Architecture:** Um único estado (`useFunnelNavigation`) com **três projeções puras** (`FunnelSwitcher`, `FunnelTabs`, `FunnelRail`). O funil ativo vive em `?funil=` na URL; a preferência de padrão vive em `localStorage` e **nunca é reescrita** pela degradação de viewport, que acontece só na leitura via `resolveLayout()`. Antes de instalar os controles novos, o header da tela é trazido à conformidade com `docs/dev/ux-guidelines.md` e a barra de métricas falsa é removida — é ela que devolve o espaço vertical que a tira de abas custa.

**Tech Stack:** React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui · TanStack Router (file-based) · TanStack Query · Vitest · bun

**Spec:** `docs/superpowers/specs/2026-07-23-leads-multi-funil-design.md` — §6 (navegação), §7.5, §7.6, §7.9, §9.3, §10 (microcopy)
**Mocks:** `docs/superpowers/mockups/leads-multi-funil-decisao-v1.html` — abrir no navegador antes de começar
**Handoff:** `docs/superpowers/handoff-leads-multi-funil.md` — o que as fases 1–2 entregaram e o que já está em produção

**Worktree:** `.claude/worktrees/leads-multi-funil-fase3`, branch `feat/leads-multi-funil-fase3`, criada a partir de `origin/main` (v0.157.0 `Manifold`). Todo comando roda da raiz dessa worktree.

## Global Constraints

- **Componentes consomem APENAS tokens semânticos.** Nunca hex literal, nunca `--gallo-*` direto, nunca paleta Tailwind crua (`bg-red-500`). Accent de funil só via `getAccentClasses()`. Mecânica em `.claude/rules/temas.md`.
- **Tailwind v4 não gera classe montada por template string.** `` `bg-funnel-${n}` `` produz CSS inexistente. Sempre mapa de literais — `getAccentClasses()` já resolve isso.
- **⚠️ Tailwind v4 + `sticky`:** nunca adicionar `relative` num elemento que já é `sticky`. `sticky` já ancora filhos absolutos.
- **O projeto não usa `noUncheckedIndexedAccess`.** Todo acesso a mapa indexado por valor vindo do banco precisa de fallback explícito (incidente 2026-07-18: `origin='import'` derrubou `/app/leads` com `undefined.tone`).
- **Comentários em inglês. UI em português do Brasil com acentuação correta** (nunca `nao`, `funis` sem til quando couber, `orcamento`).
- **Interfaces de domínio prefixadas com `I`.** `camelCase` em TS, `snake_case` no banco.
- **Features nunca importam `@/mocks` nem `@/providers/data/impl/*`** — ESLint bloqueia. Tudo pelo barrel `@/providers/data`.
- **Toda string de contagem tem singular e plural** (ver `src/features/leads/i18n/pt-BR.ts:8` e `:86`).
- **Commits em Conventional Commits, em inglês, atômicos.**
- `bun run test` = `vitest run`. Para um arquivo: `bun run test <caminho>`.
- `bun run build` **não** faz type-check. Type-check é `bunx tsc --noEmit`, com baseline pré-existente — avalie **por delta** nos arquivos que você criou.
- **Nunca commitar no diretório principal** (`D:\claude\gallo-basediesel`). Só nesta worktree.

## Corte possível

**As Tasks 1 e 2 não dependem de funis e são entregáveis sozinhas.** Se o PR crescer demais, elas podem virar um PR próprio ("conformidade do header de Leads") e as Tasks 3–11 outro. Não há dependência de dados entre os dois grupos.

---

# Task 1: Header de Leads à conformidade de UX

A spec (§7.9) manda trazer o header ao padrão **antes** de instalar os controles novos — três controles de alta frequência num crômio fora do padrão multiplicam o desvio. `LeadsHeader.tsx:31` usa `bg-card` opaco sem `backdrop-blur`; a busca em `:46-51` tem largura fixa `w-[260px]`, sem atalho `/`, sem `kbd`, sem `Escape`, sem `type="search"`, sem debounce; e não há `ScrollProgressBar`.

**Files:**
- Modify: `src/features/leads/components/LeadsHeader.tsx`
- Modify: `src/features/leads/pages/LeadsPage.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

**Interfaces:**
- Produces: `ILeadsHeaderProps` ganha `scrollEl: HTMLElement | null` (para o `ScrollProgressBar`). `LeadsHeader` passa a chamar `onSearchChange` com debounce de 300 ms internamente — o consumidor não muda.

**Referência de implementação:** `src/features/vehicles/components/list/VehiclesHeader.tsx` (busca padrão) e `src/features/catalog/components/list/CatalogHeader.tsx` (glassmorphism + debounce). **Copie delas** — a regra de UX diz explicitamente "na dúvida, copie".

- [ ] **Step 1: Trocar o crômio do header para glassmorphism**

Em `LeadsHeader.tsx`, substituir a classe do container raiz:

```tsx
// antes
<div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">

// depois
<div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
```

- [ ] **Step 2: Rodar o app e conferir o vidro**

Run: `bun run dev`, abrir `/app/leads`, rolar o board.
Expected: o conteúdo aparece desfocado atrás do header, não coberto por um bloco opaco.

- [ ] **Step 3: Substituir a busca pela busca padrão**

Trocar o bloco `<div className="relative">…</div>` (linhas ~40-52) por:

```tsx
<div className="relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none"
     style={{ maxWidth: searchFocused ? "42rem" : "24rem" }}>
  <Icon
    icon="mdi:magnify"
    size={16}
    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
  />
  <Input
    ref={searchRef}
    type="search"
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onFocus={() => setSearchFocused(true)}
    onBlur={() => setSearchFocused(false)}
    onKeyDown={(e) => {
      if (e.key === "Escape") searchRef.current?.blur();
    }}
    placeholder={COPY.searchPlaceholder}
    className="h-9 pl-8 pr-9 text-sm"
  />
  <kbd
    aria-hidden
    className={cn(
      "pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-opacity sm:flex",
      searchFocused && "opacity-0",
    )}
  >
    /
  </kbd>
</div>
```

Os vizinhos (`ToggleGroup`, botão de criar) recebem `shrink-0`.

- [ ] **Step 4: Adicionar o estado local, o debounce e o atalho `/`**

No topo do componente:

```tsx
const searchRef = useRef<HTMLInputElement>(null);
const [searchFocused, setSearchFocused] = useState(false);
const [draft, setDraft] = useState(searchValue);

// Keep the local draft in sync when the URL changes from outside (e.g. "clear all").
useEffect(() => {
  setDraft(searchValue);
}, [searchValue]);

// Debounce the upward write: the search feeds a filter over the whole fetched set.
useEffect(() => {
  if (draft === searchValue) return;
  const t = setTimeout(() => onSearchChange(draft), 300);
  return () => clearTimeout(t);
}, [draft, searchValue, onSearchChange]);

// Global "/" focuses the field, unless the user is already typing somewhere.
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "/" || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    searchRef.current?.focus();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

- [ ] **Step 5: Montar o `ScrollProgressBar` na divisa**

`ILeadsHeaderProps` ganha `scrollEl: HTMLElement | null`. No fim do container do header, como último filho:

```tsx
<div className="pointer-events-none absolute inset-x-0 bottom-0">
  <ScrollProgressBar container={scrollEl} />
</div>
```

O container raiz do header ganha `relative` (ele **não** é `sticky` — é irmão do scroller, então `relative` é seguro aqui).

Em `LeadsPage.tsx`, criar o estado e passar para baixo:

```tsx
const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
```

e no `<div className="flex min-h-0 flex-1 flex-col overflow-hidden">` (linha ~138) trocar por `ref={setScrollEl}` no elemento que de fato rola. **Atenção:** se `LeadsKanban` rolar internamente, o `ref` vai nele — confira com o DevTools qual elemento tem `scrollHeight > clientHeight` antes de fixar.

- [ ] **Step 6: Corrigir os dois `ToggleChip` da barra de filtros**

Ainda §7.9. `LeadsFiltersBar.tsx:156-169` tem dois `ToggleChip` — "incluir perdidos" e "incluir convertidos" — que **expandem** o conjunto em vez de filtrar, e quando ativos ficam `variant="default"` (`:477`), **mais proeminentes que qualquer filtro real** da barra. O usuário lê proeminência como "filtro forte aplicado", e é o oposto.

Trocar o `variant` ativo desses dois por um tratamento distinto dos filtros de verdade:

```tsx
// antes: variant={active ? "default" : "outline"}
// depois: eles ampliam o conjunto — sinalize inclusão, não filtragem
variant="outline"
className={cn(
  "border-dashed",
  active && "border-solid bg-muted text-foreground",
)}
```

O `border-dashed` é o sinal visual de "isto abre o conjunto"; o preenchimento sólido fica reservado a quem restringe.

- [ ] **Step 7: Verificar**

Run: `bun run test && bun run build`
Expected: suíte verde, build ok.

Manual: `/app/leads` — apertar `/` foca a busca (e não rouba a digitação se você já estiver num campo); o campo cresce ao focar; `Escape` desfoca; a linha de progresso acompanha o scroll do board; os dois chips de inclusão não competem mais com os filtros reais.

- [ ] **Step 8: Commit**

```bash
git add src/features/leads/components/LeadsHeader.tsx src/features/leads/components/LeadsFiltersBar.tsx src/features/leads/pages/LeadsPage.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "refactor(leads): bring the page header to the UX baseline

Glassmorphism instead of an opaque bg-card, the standard search field
(dynamic width, "/" shortcut, kbd badge, Escape, type=search, 300ms
debounce) and the scroll progress line on the fixed/scrollable seam.

Also demotes the two include-lost/include-converted chips, which widen
the set rather than filtering it but rendered more prominently than any
real filter when active — proeminence reads as 'strong filter applied',
which is the opposite of what they do.

Done before the funnel controls land: the multi-funnel refactor installs
three high-frequency controls in this chrome, and installing them on a
non-conforming header multiplies the deviation."
```

---

# Task 2: Barra de métricas — remover e mover para um popover honesto

`KanbanMetricsBar` ocupa ~52px permanentes exibindo **0,0% · 0 dias · —** na configuração padrão. `computeGlobalMetrics` (`utils/leadMetrics.ts:39-63`) calcula sobre leads convertidos, que `useLeadsList.ts:71` já removeu antes do cálculo. **É informação falsa em espaço fixo** — e são esses 52px que pagam os ~40px da tira de abas da Task 6.

**Files:**
- Modify: `src/features/leads/utils/leadMetrics.ts`
- Create: `src/features/leads/utils/leadMetrics.test.ts`
- Create: `src/features/leads/components/LeadsMetricsPopover.tsx`
- Modify: `src/features/leads/components/LeadsHeader.tsx`
- Modify: `src/features/leads/pages/LeadsPage.tsx`
- Delete: `src/features/leads/components/KanbanMetricsBar.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores além do header da Task 1.
- Produces: `computeGlobalMetrics(leads: ILead[]): IGlobalLeadMetrics` passa a receber o conjunto **sem** o filtro de convertidos/perdidos. `<LeadsMetricsPopover leads={ILead[]} />`.

- [ ] **Step 1: Escrever o teste que trava o defeito**

Criar `src/features/leads/utils/leadMetrics.test.ts`. Leia `leadMetrics.ts` primeiro para usar os nomes reais dos campos de `IGlobalLeadMetrics`.

```ts
import { describe, expect, it } from "vitest";
import type { ILead } from "@/shared/types";
import { computeGlobalMetrics } from "./leadMetrics";

function lead(over: Partial<ILead>): ILead {
  return {
    id: "l1",
    storeId: "s1",
    sellerId: "v1",
    name: "Teste",
    phone: "+5511999999999",
    temperature: "morno",
    origin: "whatsapp",
    stage: { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
    ...over,
  } as ILead;
}

describe("computeGlobalMetrics", () => {
  it("reports a real conversion rate when converted leads are present", () => {
    const leads = [
      lead({ id: "a", convertedToCustomerId: "c1" }),
      lead({ id: "b" }),
      lead({ id: "c" }),
      lead({ id: "d" }),
    ];
    const m = computeGlobalMetrics(leads);
    expect(m.conversionRate).toBeCloseTo(0.25, 5);
  });

  it("reports zero — not NaN — for an empty set", () => {
    const m = computeGlobalMetrics([]);
    expect(m.conversionRate).toBe(0);
    expect(Number.isNaN(m.conversionRate)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e observar**

Run: `bun run test src/features/leads/utils/leadMetrics.test.ts`
Expected: pode já passar — a função em si não é o defeito; o defeito é **quem a alimenta**. Se passar, o teste vira a rede de proteção da mudança de chamador. Se falhar por nome de campo, ajuste o teste ao contrato real de `IGlobalLeadMetrics`.

- [ ] **Step 3: Criar o popover**

`src/features/leads/components/LeadsMetricsPopover.tsx` — gatilho `Button variant="outline" size="sm"` com `Icon icon="mdi:chart-box-outline"` e o rótulo `COPY.metrics.trigger`; conteúdo `PopoverContent align="end" className="w-72"` com os três KPIs em `<dl>`, cada um `<dt>` em `text-xs text-muted-foreground` e `<dd>` em `text-lg font-semibold tabular-nums`.

Recebe `leads: ILead[]` **já sem** o filtro de convertidos/perdidos e chama `computeGlobalMetrics(leads)`.

- [ ] **Step 4: Adicionar a microcopy**

Em `src/features/leads/i18n/pt-BR.ts`:

```ts
metrics: {
  trigger: "Métricas",
  conversionRate: "Taxa de conversão",
  avgDaysToClose: "Tempo médio até o fecho",
  avgValue: "Valor médio",
  empty: "Sem dados suficientes no período.",
},
```

- [ ] **Step 5: Trocar a barra pelo popover**

Em `LeadsPage.tsx`, remover a linha 136 (`{view === "kanban" && <KanbanMetricsBar leads={list.leads} />}`) e o import.

O popover precisa do conjunto **sem** o filtro de convertidos. `useLeadsList` já expõe o conjunto filtrado; adicione ao seu retorno um `allLeads: ILead[]` com o resultado da query **antes** do filtro de `includeConverted`/`includeLost`, e passe-o ao header:

```tsx
<LeadsHeader
  …
  metricsLeads={list.allLeads}
/>
```

Em `LeadsHeader.tsx`, montar `<LeadsMetricsPopover leads={metricsLeads} />` no grupo da direita, antes do `ToggleGroup`.

- [ ] **Step 6: Apagar o componente morto**

```bash
rm src/features/leads/components/KanbanMetricsBar.tsx
grep -rn "KanbanMetricsBar" src/    # deve não retornar nada
```

- [ ] **Step 7: Verificar**

Run: `bun run test && bun run build && bunx tsc --noEmit 2>&1 | grep -E "leads/(utils|components|pages|hooks)" || echo "sem erros novos em leads"`
Expected: suíte verde, build ok, sem erro de tipo novo.

Manual: `/app/leads` — a faixa de 52px sumiu; o popover "Métricas" mostra números reais (não `0,0% · 0 dias · —`).

- [ ] **Step 8: Commit**

```bash
git add -A src/features/leads
git commit -m "refactor(leads): replace the always-zero metrics bar with a metrics popover

KanbanMetricsBar spent ~52px of permanent vertical space showing
0,0% · 0 dias · — by construction: computeGlobalMetrics divides by the
converted leads that useLeadsList had already filtered out before the
call. The three KPIs move into a header popover fed by the unfiltered
set, so they report real numbers, and the reclaimed 52px pay for the
funnel tab strip that lands in this same phase.

Adds the regression test the util never had."
```

---

# Task 3: `resolveLayout` — a degradação como função pura

Os três padrões degradam por largura e por contagem de funis (spec §6.6). A regra é pura, tem cinco casos e **nunca reescreve a preferência** — por isso vive fora do hook, testada isoladamente.

**Files:**
- Create: `src/features/funnels/engine/resolveLayout.ts`
- Create: `src/features/funnels/engine/resolveLayout.test.ts`
- Modify: `src/features/funnels/index.ts`

**Interfaces:**
- Produces: `FunnelLayout = "rail" | "header" | "tabs"`, `FUNNEL_LAYOUTS`, `IResolvedLayout`, `resolveLayout(input: IResolveLayoutInput): IResolvedLayout`, `DEFAULT_FUNNEL_LAYOUT`.

- [ ] **Step 1: Escrever o teste primeiro**

```ts
import { describe, expect, it } from "vitest";
import { resolveLayout } from "./resolveLayout";

describe("resolveLayout", () => {
  it("forces the header switcher below 1024px, whatever the preference", () => {
    for (const preferred of ["rail", "tabs", "header"] as const) {
      const r = resolveLayout({ preferred, width: 900, funnelCount: 4 });
      expect(r.layout).toBe("header");
    }
  });

  it("collapses the rail between 1024 and 1279px", () => {
    const r = resolveLayout({ preferred: "rail", width: 1100, funnelCount: 4 });
    expect(r.layout).toBe("rail");
    expect(r.railCollapsed).toBe(true);
  });

  it("keeps the rail expanded from 1280px up", () => {
    const r = resolveLayout({ preferred: "rail", width: 1400, funnelCount: 4 });
    expect(r.layout).toBe("rail");
    expect(r.railCollapsed).toBe(false);
  });

  it("degrades tabs to the header switcher at 9 funnels or more", () => {
    expect(resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 8 }).layout).toBe("tabs");
    expect(resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 9 }).layout).toBe("header");
  });

  it("reports staticLabel with a single funnel, without changing the layout", () => {
    const r = resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 1 });
    expect(r.staticLabel).toBe(true);
    expect(r.layout).toBe("tabs");
  });

  it("reports the empty state with zero funnels", () => {
    expect(resolveLayout({ preferred: "rail", width: 1400, funnelCount: 0 }).isEmpty).toBe(true);
  });

  it("never reports a layout the caller did not ask for when nothing degrades", () => {
    expect(resolveLayout({ preferred: "rail", width: 1400, funnelCount: 3 }).layout).toBe("rail");
    expect(resolveLayout({ preferred: "tabs", width: 1400, funnelCount: 3 }).layout).toBe("tabs");
    expect(resolveLayout({ preferred: "header", width: 1400, funnelCount: 3 }).layout).toBe("header");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/funnels/engine/resolveLayout.test.ts`
Expected: FAIL — `Cannot find module './resolveLayout'`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Viewport- and count-driven degradation of the funnel navigation pattern.
 *
 * This is a READ-TIME projection. It never writes back to the stored
 * preference: overwriting someone's choice because they rotated a tablet is
 * how you lose their trust in configuring anything at all. The preference
 * returns on its own when the window grows again.
 */
export const FUNNEL_LAYOUTS = ["rail", "header", "tabs"] as const;
export type FunnelLayout = (typeof FUNNEL_LAYOUTS)[number];

/** Only pattern that works at every width and every funnel count. */
export const DEFAULT_FUNNEL_LAYOUT: FunnelLayout = "header";

/** Below this the rail does not fit and tabs would nest two horizontal scrolls. */
const RAIL_MIN_WIDTH = 1024;
/** Below this the rail fits only collapsed: 208px beside 288px columns is dear. */
const RAIL_EXPANDED_MIN_WIDTH = 1280;
/** At this many funnels the strip scrolls horizontally, stacked on the board's own scroll. */
const TABS_MAX_FUNNELS = 9;

export interface IResolveLayoutInput {
  preferred: FunnelLayout;
  width: number;
  funnelCount: number;
}

export interface IResolvedLayout {
  layout: FunnelLayout;
  /** Rail at 56px instead of 208px. Meaningless unless `layout === "rail"`. */
  railCollapsed: boolean;
  /** One funnel: the selector is a static label — a lone tab is noise. */
  staticLabel: boolean;
  /** No reachable funnel. Only possible for non-staff, and impossible in v1. */
  isEmpty: boolean;
}

export function resolveLayout({
  preferred,
  width,
  funnelCount,
}: IResolveLayoutInput): IResolvedLayout {
  const staticLabel = funnelCount === 1;
  const isEmpty = funnelCount === 0;

  if (width < RAIL_MIN_WIDTH) {
    return { layout: "header", railCollapsed: false, staticLabel, isEmpty };
  }

  if (preferred === "tabs" && funnelCount >= TABS_MAX_FUNNELS) {
    return { layout: "header", railCollapsed: false, staticLabel, isEmpty };
  }

  if (preferred === "rail") {
    return {
      layout: "rail",
      railCollapsed: width < RAIL_EXPANDED_MIN_WIDTH,
      staticLabel,
      isEmpty,
    };
  }

  return { layout: preferred, railCollapsed: false, staticLabel, isEmpty };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/funnels/engine/resolveLayout.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Exportar pelo barrel**

Em `src/features/funnels/index.ts`, acrescentar:

```ts
export { resolveLayout, FUNNEL_LAYOUTS, DEFAULT_FUNNEL_LAYOUT } from "./engine/resolveLayout";
export type { FunnelLayout, IResolvedLayout } from "./engine/resolveLayout";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/funnels/engine/resolveLayout.ts src/features/funnels/engine/resolveLayout.test.ts src/features/funnels/index.ts
git commit -m "feat(funnels): add the pure layout-degradation engine

Five degradation rules from spec 6.6, as a read-time projection. The
load-bearing property, pinned by test: degradation never writes back to
the stored preference — it returns on its own when the window grows."
```

---

# Task 4: Resolver o funil inicial — engine puro + `?funil=` na URL

Precedência da spec §6.4: `?funil=` → `gallo-leads-last-funnel` → funil padrão → `Geral`. Com **fallback de link inválido**: id inexistente, arquivado ou sem acesso abre o padrão e avisa. Esse caso é provável, porque a própria spec estimula compartilhar o link do board.

**Files:**
- Create: `src/features/funnels/engine/resolveInitialFunnel.ts`
- Create: `src/features/funnels/engine/resolveInitialFunnel.test.ts`
- Modify: `src/features/funnels/index.ts`
- Modify: `src/features/leads/hooks/useLeadsUrlState.ts`

**Interfaces:**
- Consumes: `ILeadFunnel` de `@/shared/types`.
- Produces: `resolveInitialFunnel(input): IInitialFunnelResolution` com `{ funnelId: ID | null; invalidLink: boolean; clearLastFunnel: boolean }`. `useLeadsUrlState` ganha `funnelId: ID | undefined` e `setFunnel(id: ID | undefined): void`, e `ILeadsListSearch` ganha `funil?: string`.

- [ ] **Step 1: Escrever o teste primeiro**

```ts
import { describe, expect, it } from "vitest";
import type { ILeadFunnel } from "@/shared/types";
import { ALL_FUNNELS, resolveInitialFunnel } from "./resolveInitialFunnel";

function funnel(over: Partial<ILeadFunnel> & { id: string }): ILeadFunnel {
  return {
    storeId: "s1",
    name: over.id,
    accent: 0,
    icon: "mdi:filter-variant",
    position: 0,
    isDefault: false,
    openToStore: true,
    entryAlertThreshold: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as ILeadFunnel;
}

const geral = funnel({ id: "f-geral", isDefault: true });
const cata = funnel({ id: "f-cata" });
const accessible = [geral, cata];

describe("resolveInitialFunnel", () => {
  it("honours a valid ?funil= above everything else", () => {
    const r = resolveInitialFunnel({ urlFunnelId: "f-cata", lastFunnelId: "f-geral", accessible });
    expect(r).toEqual({ funnelId: "f-cata", invalidLink: false, clearLastFunnel: false });
  });

  it("falls back to the default funnel and flags an invalid link", () => {
    const r = resolveInitialFunnel({ urlFunnelId: "f-nope", lastFunnelId: null, accessible });
    expect(r.funnelId).toBe("f-geral");
    expect(r.invalidLink).toBe(true);
  });

  it("treats a funnel the user cannot reach exactly like a missing one", () => {
    const r = resolveInitialFunnel({ urlFunnelId: "f-secreto", lastFunnelId: null, accessible });
    expect(r.funnelId).toBe("f-geral");
    expect(r.invalidLink).toBe(true);
  });

  it("uses the last funnel when the URL says nothing, without flagging a bad link", () => {
    const r = resolveInitialFunnel({ urlFunnelId: undefined, lastFunnelId: "f-cata", accessible });
    expect(r).toEqual({ funnelId: "f-cata", invalidLink: false, clearLastFunnel: false });
  });

  it("asks to clear a stale last-funnel key and does NOT flag an invalid link", () => {
    const r = resolveInitialFunnel({ urlFunnelId: undefined, lastFunnelId: "f-morto", accessible });
    expect(r.funnelId).toBe("f-geral");
    expect(r.clearLastFunnel).toBe(true);
    // The user did not follow a bad link — no toast for a stale local key.
    expect(r.invalidLink).toBe(false);
  });

  it("passes the consolidated sentinel through untouched", () => {
    const r = resolveInitialFunnel({ urlFunnelId: ALL_FUNNELS, lastFunnelId: null, accessible });
    expect(r.funnelId).toBe(ALL_FUNNELS);
    expect(r.invalidLink).toBe(false);
  });

  it("returns null when the user reaches no funnel at all", () => {
    const r = resolveInitialFunnel({ urlFunnelId: undefined, lastFunnelId: null, accessible: [] });
    expect(r.funnelId).toBeNull();
  });

  it("falls back to the first funnel when none is marked default", () => {
    const r = resolveInitialFunnel({
      urlFunnelId: undefined,
      lastFunnelId: null,
      accessible: [cata],
    });
    expect(r.funnelId).toBe("f-cata");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/funnels/engine/resolveInitialFunnel.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

```ts
import type { ID, ILeadFunnel } from "@/shared/types";

/**
 * Sentinel for the consolidated view. Not a funnel id: every funnel owns its
 * own stages, so there is no common X axis and a unified board is impossible
 * (spec 6.3). Selecting it forces the list view.
 */
export const ALL_FUNNELS = "todos" as const;

export interface IResolveInitialFunnelInput {
  /** `?funil=` — may be the ALL_FUNNELS sentinel. */
  urlFunnelId: string | undefined;
  /** `gallo-leads-last-funnel`, scoped per store. */
  lastFunnelId: string | null;
  /** Funnels this user actually reaches, archived already excluded. */
  accessible: ILeadFunnel[];
}

export interface IInitialFunnelResolution {
  funnelId: ID | typeof ALL_FUNNELS | null;
  /** The URL pointed at something unreachable — worth telling the user. */
  invalidLink: boolean;
  /** The stored key is stale and should be dropped. Not worth a toast. */
  clearLastFunnel: boolean;
}

function fallbackFunnelId(accessible: ILeadFunnel[]): ID | null {
  const preferred = accessible.find((f) => f.isDefault) ?? accessible[0];
  return preferred ? preferred.id : null;
}

export function resolveInitialFunnel({
  urlFunnelId,
  lastFunnelId,
  accessible,
}: IResolveInitialFunnelInput): IInitialFunnelResolution {
  if (urlFunnelId === ALL_FUNNELS) {
    return { funnelId: ALL_FUNNELS, invalidLink: false, clearLastFunnel: false };
  }

  const reachable = (id: string) => accessible.some((f) => f.id === id);

  if (urlFunnelId) {
    if (reachable(urlFunnelId)) {
      return { funnelId: urlFunnelId, invalidLink: false, clearLastFunnel: false };
    }
    // A shared link the user cannot open. Tell them, and land somewhere useful.
    return { funnelId: fallbackFunnelId(accessible), invalidLink: true, clearLastFunnel: false };
  }

  if (lastFunnelId) {
    if (reachable(lastFunnelId)) {
      return { funnelId: lastFunnelId, invalidLink: false, clearLastFunnel: false };
    }
    // Local leftover, not a user action: drop it quietly.
    return { funnelId: fallbackFunnelId(accessible), invalidLink: false, clearLastFunnel: true };
  }

  return { funnelId: fallbackFunnelId(accessible), invalidLink: false, clearLastFunnel: false };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/funnels/engine/resolveInitialFunnel.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Acrescentar `?funil=` ao estado de URL**

Em `src/features/leads/hooks/useLeadsUrlState.ts`:

1. `ILeadsListSearch` ganha `funil?: string;`
2. Em `validateLeadsSearch`, junto dos outros campos string:
   ```ts
   if (typeof raw.funil === "string" && raw.funil.length > 0) out.funil = raw.funil;
   ```
3. `ILeadsUrlState` ganha `funnelId: string | undefined;` e `setFunnel: (id: string | undefined) => void;`
4. No corpo do hook:
   ```ts
   const funnelId = search.funil;
   ```
   e no objeto de retorno:
   ```ts
   funnelId,
   // Changing funnel resets pagination but keeps filters, sort and search:
   // the user is narrowing the same question, not asking a new one.
   setFunnel: (id) => apply({ funil: id, page: undefined }),
   ```

- [ ] **Step 6: Exportar pelo barrel e verificar**

Em `src/features/funnels/index.ts`:

```ts
export { resolveInitialFunnel, ALL_FUNNELS } from "./engine/resolveInitialFunnel";
export type { IInitialFunnelResolution } from "./engine/resolveInitialFunnel";
```

Run: `bun run test && bunx tsc --noEmit 2>&1 | grep -E "funnels/engine|useLeadsUrlState" || echo "sem erros novos"`
Expected: suíte verde, sem erro de tipo nos arquivos novos.

- [ ] **Step 7: Commit**

```bash
git add src/features/funnels/engine/resolveInitialFunnel.ts src/features/funnels/engine/resolveInitialFunnel.test.ts src/features/funnels/index.ts src/features/leads/hooks/useLeadsUrlState.ts
git commit -m "feat(funnels): resolve the initial funnel and put it in the URL

Precedence from spec 6.4 as a pure function, plus ?funil= in the leads
URL state so the board is deep-linkable and survives F5.

The two failure modes are deliberately distinct: a URL pointing at a
funnel the user cannot reach is a shared link worth a toast, while a
stale localStorage key is local leftover that should be dropped
silently. Conflating them either nags people about their own history or
swallows the case the spec explicitly wanted surfaced."
```

---

# Task 5: `useFunnelNavigation` — o estado único

Um estado, três projeções. O hook é dono de tudo; as views não têm lógica, ordem, rótulo nem recurso próprio.

**Files:**
- Create: `src/features/funnels/hooks/useFunnelNavigation.ts`
- Create: `src/features/funnels/hooks/useFunnelLayoutPreference.ts`
- Create: `src/features/funnels/hooks/useFunnelLayoutPreference.test.ts`
- Modify: `src/features/funnels/index.ts`

**Interfaces:**
- Consumes: `resolveLayout`, `resolveInitialFunnel`, `ALL_FUNNELS` (Tasks 3-4); `useLeadFunnelsProvider` de `@/providers/data`; `useLeadsUrlState` (Task 4).
- Produces:
  ```ts
  useFunnelNavigation(): {
    funnels: ILeadFunnel[];          // acessíveis, sem arquivados, ordenados por position
    countsByFunnel: Record<ID, number>;
    activeFunnelId: ID | typeof ALL_FUNNELS | null;
    setActiveFunnel: (id: ID | typeof ALL_FUNNELS) => void;
    preferredLayout: FunnelLayout;
    setPreferredLayout: (l: FunnelLayout) => void;
    resolved: IResolvedLayout;
    isLoading: boolean;
  }
  ```

- [ ] **Step 1: Teste do normalizador da preferência**

`useFunnelLayoutPreference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeFunnelLayout } from "./useFunnelLayoutPreference";

describe("normalizeFunnelLayout", () => {
  it("accepts the three known layouts", () => {
    expect(normalizeFunnelLayout("rail")).toBe("rail");
    expect(normalizeFunnelLayout("tabs")).toBe("tabs");
    expect(normalizeFunnelLayout("header")).toBe("header");
  });

  it("falls back to the header switcher for anything else", () => {
    expect(normalizeFunnelLayout(null)).toBe("header");
    expect(normalizeFunnelLayout(undefined)).toBe("header");
    expect(normalizeFunnelLayout("")).toBe("header");
    expect(normalizeFunnelLayout("sidebar")).toBe("header");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/funnels/hooks/useFunnelLayoutPreference.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a preferência persistida**

Segue exatamente o padrão de `src/features/analytics-copilot/hooks/useCopilotViewMode.ts`.

```ts
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FUNNEL_LAYOUT, FUNNEL_LAYOUTS, type FunnelLayout } from "../engine/resolveLayout";

const STORAGE_KEY = "gallo-leads-funnel-layout";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeFunnelLayout(raw: string | null | undefined): FunnelLayout {
  return FUNNEL_LAYOUTS.includes(raw as FunnelLayout)
    ? (raw as FunnelLayout)
    : DEFAULT_FUNNEL_LAYOUT;
}

function read(): FunnelLayout {
  if (typeof window === "undefined") return DEFAULT_FUNNEL_LAYOUT;
  try {
    return normalizeFunnelLayout(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_FUNNEL_LAYOUT;
  }
}

/**
 * The user's chosen navigation pattern. Stores the RAW preference — never the
 * degraded result, so a narrow window does not permanently rewrite the choice.
 */
export function useFunnelLayoutPreference(): [FunnelLayout, (l: FunnelLayout) => void] {
  const [layout, setLayout] = useState<FunnelLayout>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, layout);
    } catch {
      // ignore
    }
  }, [layout]);

  const set = useCallback((next: FunnelLayout) => setLayout(next), []);
  return [layout, set];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/funnels/hooks/useFunnelLayoutPreference.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 5: Implementar o hook de navegação**

`src/features/funnels/hooks/useFunnelNavigation.ts`. Pontos que **não** podem ser improvisados:

- A largura vem de um `useState` + listener de `resize`, no mesmo formato do `useIsMobile` (`src/hooks/use-mobile.tsx`) — mas guardando `window.innerWidth`, não um booleano.
- `funnels` = `listFunnels(storeId)` **cruzado** com `listAccessibleFunnelIds(storeId)`, arquivados fora, ordenado por `position`. Use `resolveAccessibleFunnels` do barrel se a assinatura servir; se não servir, filtre aqui e **não** altere o engine.
- A chave `gallo-leads-last-funnel` é **por loja**: `` `gallo-leads-last-funnel:${storeId}` ``.
- `invalidLink` dispara `toast.error(COPY.funnels.invalidLink(nome))` **uma vez**, num `useEffect` com guarda de `useRef`, senão repete a cada render.
- Quando `resolveInitialFunnel` devolve um id e a URL está vazia, **escreva-o na URL** com `setFunnel` — assim o board fica compartilhável desde o primeiro acesso.

```ts
const storeId = useActiveStoreId();               // do MultistoreProvider
const provider = useLeadFunnelsProvider();
const url = useLeadsUrlState();
const [preferredLayout, setPreferredLayout] = useFunnelLayoutPreference();
const [width, setWidth] = useState(() =>
  typeof window === "undefined" ? 1440 : window.innerWidth,
);

useEffect(() => {
  const onResize = () => setWidth(window.innerWidth);
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);

const funnelsQuery = useQuery({
  queryKey: ["lead-funnels", storeId],
  queryFn: async () => {
    const [all, accessibleIds] = await Promise.all([
      provider.listFunnels(storeId),
      provider.listAccessibleFunnelIds(storeId),
    ]);
    const reach = new Set(accessibleIds);
    return all
      .filter((f) => !f.archivedAt && reach.has(f.id))
      .sort((a, b) => a.position - b.position);
  },
  staleTime: 60_000,
});

const countsQuery = useQuery({
  queryKey: ["lead-funnel-counts", storeId],
  queryFn: () => provider.countLeadsByFunnel(storeId),
  staleTime: 30_000,
});
```

O `resolved` sai de `resolveLayout({ preferred: preferredLayout, width, funnelCount: funnels.length })`.

`setActiveFunnel(id)` escreve na URL (`url.setFunnel(id)`) **e** grava a chave por loja no `localStorage` — exceto quando `id === ALL_FUNNELS`, que não é um funil e não deve virar "último funil".

- [ ] **Step 6: Exportar pelo barrel**

```ts
export { useFunnelNavigation } from "./hooks/useFunnelNavigation";
export { useFunnelLayoutPreference } from "./hooks/useFunnelLayoutPreference";
```

- [ ] **Step 7: Verificar**

Run: `bun run test && bunx tsc --noEmit 2>&1 | grep "features/funnels" || echo "sem erros novos em funnels"`
Expected: suíte verde, sem erro de tipo.

- [ ] **Step 8: Commit**

```bash
git add src/features/funnels/hooks src/features/funnels/index.ts
git commit -m "feat(funnels): add the single navigation state behind the three views

useFunnelNavigation owns funnels, counts, the active funnel and the
layout preference; the three views that follow are pure projections over
it. Storing the raw preference (not the resolved layout) is what lets a
narrow window degrade the display without destroying the choice.

The last-funnel key is scoped per store — a shared key would drop
someone into another store's funnel on switch."
```

---

# Task 6: As três views, sob contrato de paridade

`FunnelRail`, `FunnelSwitcher` e `FunnelTabs` são **views puras**. Contrato da spec §6.2: todo padrão oferece trocar de funil, contagem, ícone + accent, `Todos os funis`, `Gerenciar funis` (staff), atalhos `[` e `]`, `aria-current` no ativo e o controle de troca de padrão. **Se um padrão não consegue oferecer algo, nenhum oferece.**

**Files:**
- Create: `src/features/funnels/components/FunnelSwitcher.tsx`
- Create: `src/features/funnels/components/FunnelTabs.tsx`
- Create: `src/features/funnels/components/FunnelRail.tsx`
- Create: `src/features/funnels/components/FunnelNav.tsx`
- Create: `src/features/funnels/components/LayoutPreferenceMenu.tsx`
- Create: `src/features/funnels/i18n/pt-BR.ts`
- Modify: `src/features/funnels/index.ts`

**Interfaces:**
- Consumes: `useFunnelNavigation` (Task 5), `getAccentClasses` (fase 1), `ALL_FUNNELS` (Task 4).
- Produces: `<FunnelNav />` — escolhe a projeção por `resolved.layout` e é o **único** ponto que a página monta. As três views recebem `IFunnelViewProps`:
  ```ts
  export interface IFunnelViewProps {
    funnels: ILeadFunnel[];
    countsByFunnel: Record<ID, number>;
    activeFunnelId: ID | typeof ALL_FUNNELS | null;
    onSelect: (id: ID | typeof ALL_FUNNELS) => void;
    collapsed: boolean;
    staticLabel: boolean;
    canManage: boolean;
    preferredLayout: FunnelLayout;
    onPreferredLayoutChange: (l: FunnelLayout) => void;
  }
  ```

- [ ] **Step 1: Criar a microcopy**

`src/features/funnels/i18n/pt-BR.ts` — copiar **literalmente** da tabela §10 da spec:

```ts
export const COPY = {
  switcherTrigger: (nome: string) => `Trocar de funil. Funil atual: ${nome}`,
  searchPlaceholder: "Buscar funil…",
  allFunnels: "Todos os funis",
  allFunnelsNotice: "Cada funil tem etapas próprias, então a visão de todos abre em lista.",
  manage: "Gerenciar funis",
  layoutMenu: "Exibição dos funis",
  layoutOptions: {
    rail: "Barra lateral",
    header: "Seletor no cabeçalho",
    tabs: "Abas",
  },
  count: (n: number) => (n === 1 ? "1 lead" : `${n} leads`),
  countWithOverdue: (n: number, m: number) =>
    `${n === 1 ? "1 lead" : `${n} leads`} · ${m} ${m === 1 ? "atrasado" : "atrasados"}`,
  defaultFunnelHint: "Todo lead novo entra aqui até ser direcionado.",
  invalidLink: (nome: string) => `Você não tem acesso ao funil desse link. Abrimos o ${nome}.`,
  noPermissionToCreate: "Apenas donos e gestores criam funis.",
  nnHint: "Um lead pode estar em vários funis, com etapa própria em cada um.",
} as const;
```

- [ ] **Step 2: Criar o menu de troca de padrão**

`LayoutPreferenceMenu.tsx` — `DropdownMenuSub` com rótulo `COPY.layoutMenu` e três `DropdownMenuRadioItem` (`rail`/`header`/`tabs`), marca no ativo. É montado **dentro** de cada view (rodapé do popover, `⋮` do rail, `⋮` ao fim da tira), nunca como um `ToggleGroup` solto no header — spec §6.5 é explícita, e o header já tem 5 grupos.

- [ ] **Step 3: Criar o arquivo de props compartilhado**

`src/features/funnels/components/types.ts` — é este contrato que impede uma view de ganhar recurso que as outras não têm:

```ts
import type { ID, ILeadFunnel } from "@/shared/types";
import type { FunnelLayout } from "../engine/resolveLayout";
import type { ALL_FUNNELS } from "../engine/resolveInitialFunnel";

export type ActiveFunnel = ID | typeof ALL_FUNNELS | null;

/**
 * Every navigation projection takes exactly this. If a pattern cannot offer
 * something here, the answer is to drop it from all three — not to widen one
 * view's props (spec 6.2).
 */
export interface IFunnelViewProps {
  funnels: ILeadFunnel[];
  countsByFunnel: Record<ID, number>;
  activeFunnelId: ActiveFunnel;
  onSelect: (id: ID | typeof ALL_FUNNELS) => void;
  /** Rail only; the other two ignore it. */
  collapsed: boolean;
  /** Single funnel: render a static label instead of a chooser. */
  staticLabel: boolean;
  canManage: boolean;
  onCreate: () => void;
  preferredLayout: FunnelLayout;
  onPreferredLayoutChange: (l: FunnelLayout) => void;
}
```

- [ ] **Step 4: Implementar `FunnelSwitcher` — a referência que as outras duas seguem**

Este é o padrão de fábrica e o único que funciona em 100% das larguras. Implemente-o primeiro e completo; `FunnelTabs` e `FunnelRail` são reescritas da mesma lógica em outra forma.

```tsx
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import { ALL_FUNNELS } from "../engine/resolveInitialFunnel";
import { COPY } from "../i18n/pt-BR";
import { LayoutPreferenceMenu } from "./LayoutPreferenceMenu";
import type { IFunnelViewProps } from "./types";

export function FunnelSwitcher({
  funnels, countsByFunnel, activeFunnelId, onSelect, staticLabel,
  canManage, onCreate, preferredLayout, onPreferredLayoutChange,
}: IFunnelViewProps) {
  const [open, setOpen] = useState(false);
  const active = funnels.find((f) => f.id === activeFunnelId);
  const label = activeFunnelId === ALL_FUNNELS ? COPY.allFunnels : (active?.name ?? "—");

  // One funnel: a chooser with a single option is noise. Staff still needs the
  // affordance, so they keep the chevron; everyone else gets a plain heading.
  if (staticLabel && !canManage) {
    return <h1 className="text-base font-semibold text-foreground">{label}</h1>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={COPY.switcherTrigger(label)}
        >
          {active ? (
            <span className={cn("size-2 rounded-sm", getAccentClasses(active.accent).dot)} />
          ) : null}
          <h1 className="text-base font-semibold text-foreground">{label}</h1>
          <Icon icon="mdi:chevron-down" size={16} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={COPY.searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Nenhum funil encontrado.</CommandEmpty>
            <CommandGroup>
              {funnels.map((f) => (
                <CommandItem
                  key={f.id}
                  value={f.name}
                  aria-selected={f.id === activeFunnelId}
                  onSelect={() => { onSelect(f.id); setOpen(false); }}
                >
                  <span className={cn("size-2 rounded-sm", getAccentClasses(f.accent).dot)} />
                  <Icon icon={f.icon} size={14} className="text-muted-foreground" aria-hidden />
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {countsByFunnel[f.id] ?? 0}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value={COPY.allFunnels}
                aria-selected={activeFunnelId === ALL_FUNNELS}
                onSelect={() => { onSelect(ALL_FUNNELS); setOpen(false); }}
              >
                <Icon icon="mdi:view-list-outline" size={14} aria-hidden />
                {COPY.allFunnels}
              </CommandItem>
            </CommandGroup>

            {canManage ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value={COPY.newFunnel.trigger} onSelect={() => { onCreate(); setOpen(false); }}>
                    <Icon icon="mdi:plus" size={14} aria-hidden />
                    {COPY.newFunnel.trigger}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>

        <div className="border-t border-border p-1">
          <LayoutPreferenceMenu value={preferredLayout} onChange={onPreferredLayoutChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

`countsByFunnel[f.id] ?? 0` **não** é defensividade supérflua: o projeto não usa `noUncheckedIndexedAccess` e esse mapa vem do servidor — é exatamente a forma do incidente de 2026-07-18.

- [ ] **Step 5: Implementar `FunnelTabs`**

`role="tablist"`, cada aba `role="tab"` + `aria-selected`, navegação por setas ←/→. Aba = ponto de accent + nome + contagem. A ativa leva `border-b-2` com a cor do accent via `getAccentClasses(f.accent).bar`.

Ao fim da tira: `Todos os funis`, `+ Novo funil` (se `canManage`) e o `⋮` com o `LayoutPreferenceMenu`.

Com `staticLabel === true`, renderiza só o rótulo do funil — mais o chevron de `Gerenciar funis` se `canManage`.

- [ ] **Step 6: Implementar `FunnelRail`**

`<nav>` + `<ul>` + `aria-current="page"` no ativo. Largura **208px** expandida, **56px** colapsada (as duas medidas são da spec §6.6 — não invente outras).

Colapsada, cada item mostra só o ícone e **exige `aria-label`** com o nome — tooltip não é nome acessível. Item ativo com `box-shadow` interno na cor do accent (`getAccentClasses(f.accent).bar`).

Rodapé: `Todos os funis`, `Gerenciar funis` (se `canManage`) e o `⋮` com o `LayoutPreferenceMenu`.

- [ ] **Step 7: Implementar `FunnelNav` e os atalhos `[` / `]`**

`FunnelNav` lê `useFunnelNavigation()`, escolhe a projeção por `resolved.layout` e monta os atalhos globais — que pertencem ao contrato de paridade, logo vivem aqui, não em cada view.

**O mapeamento de props é aqui, e o nome muda de propósito:**

```tsx
const viewProps: IFunnelViewProps = {
  funnels,
  countsByFunnel,
  activeFunnelId,
  onSelect: setActiveFunnel,
  // The engine says `railCollapsed` because only the rail can collapse;
  // the view prop is plain `collapsed` because a view must not know which
  // of the three it is. Same value, deliberately different name.
  collapsed: resolved.railCollapsed,
  staticLabel: resolved.staticLabel,
  canManage,
  onCreate: () => setNewFunnelOpen(true),
  preferredLayout,
  onPreferredLayoutChange: setPreferredLayout,
};
```

Os atalhos:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "[" && e.key !== "]") return;
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (activeFunnelId === null || activeFunnelId === ALL_FUNNELS) return;
    const i = funnels.findIndex((f) => f.id === activeFunnelId);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === "]" ? (i + 1) % funnels.length : (i - 1 + funnels.length) % funnels.length;
    const target = funnels[next];
    if (target) setActiveFunnel(target.id);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [funnels, activeFunnelId, setActiveFunnel]);
```

Quando `resolved.isEmpty`, renderiza o estado vazio dedicado em vez de qualquer view.

- [ ] **Step 8: Montar na página**

Em `LeadsPage.tsx`: `FunnelNav` em modo `rail` é **irmão à esquerda** do board (dentro do `flex` da linha 138); em `header` ele substitui o `<h1>` dentro de `LeadsHeader`; em `tabs` fica entre o header e a barra de filtros.

Só **um** dos três renderiza por vez, e quem renderiza é dono do `aria-current` (spec §6.7). Nos modos `rail` e `tabs`, garanta um `<h1>` nomeando o funil ativo no topo do board — pode ser `sr-only`.

- [ ] **Step 9: Verificar**

Run: `bun run test && bun run build`
Expected: verde.

Manual, em `/app/leads` com o mock (que semeia 4 funis):
1. Trocar de padrão pelos três — funil ativo, scroll e filtros **não** mudam.
2. `]` e `[` andam entre funis.
3. Estreitar a janela abaixo de 1024px: vira `header`. Alargar de volta: **volta ao padrão escolhido** (a preferência não foi reescrita).
4. Navegar por teclado: `Tab` alcança o seletor; no rail colapsado, o leitor de tela anuncia o nome do funil.

- [ ] **Step 10: Commit**

```bash
git add src/features/funnels/components src/features/funnels/i18n src/features/funnels/index.ts src/features/leads/pages/LeadsPage.tsx
git commit -m "feat(funnels): add the three navigation projections under a parity contract

Rail, header switcher and tabs are pure views over useFunnelNavigation.
Everything that is not presentation — the [ and ] shortcuts, the empty
state, choosing which view renders — lives in FunnelNav, so a feature
cannot accidentally exist in one pattern and not the others.

The layout switch sits inside each selector and nowhere else: a second
ToggleGroup beside Kanban/Lista would put two 'mode' controls side by
side, one changing content and the other navigation."
```

---

# Task 7: A preferência também em Configurações → Aparência

Spec §6.5: dois lugares, e apenas dois. O segundo é `Configurações → Preferências → Aparência`, ao lado de tema e modo, como `RadioGroup` de 3 cartões com miniatura esquemática.

**Files:**
- Modify: `src/routes/app.configuracoes.aparencia.tsx` (ou a página que ela renderiza — siga o import)
- Modify: `src/features/funnels/index.ts` (se precisar exportar o cartão)

- [ ] **Step 1: Ler a página e localizar o padrão**

Run: `sed -n '1,80p' src/routes/app.configuracoes.aparencia.tsx`
Identifique como tema e modo são renderizados e **replique a mesma estrutura de seção** — não invente um layout novo.

- [ ] **Step 2: Adicionar a seção**

Título `Exibição dos funis`, descrição `Como você troca de funil na página de Leads.`, e um `RadioGroup` de 3 cartões usando `useFunnelLayoutPreference()`. Cada cartão traz uma miniatura esquemática em `div`s (barra lateral / seletor no topo / abas) usando **só tokens semânticos** — `bg-muted`, `border-border`, `bg-primary` para o elemento ativo da miniatura.

Rótulos vêm de `COPY.layoutOptions` (Task 6) — não redigite as strings.

- [ ] **Step 3: Verificar**

Run: `bun run build`
Manual: mudar em Configurações → abrir `/app/leads` → o padrão mudou. Mudar em Leads → voltar em Configurações → o cartão marcado acompanhou. **É o mesmo `localStorage`, então os dois lugares refletem um ao outro sem sincronia extra.**

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.configuracoes.aparencia.tsx
git commit -m "feat(settings): expose the funnel layout preference beside theme and mode

Second and last home for the control, per spec 6.5. Both places read and
write the same localStorage key, so they mirror each other with no
synchronisation code."
```

---

# Task 8: "Todos os funis"

Cada funil tem etapas próprias, logo **não existe eixo X comum e kanban unificado é impossível**. Sem esta especificação alguém tentaria construir o board unificado.

**Files:**
- Modify: `src/features/leads/pages/LeadsPage.tsx`
- Modify: `src/features/leads/components/LeadsHeader.tsx`
- Modify: `src/features/leads/components/LeadsList.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts`

- [ ] **Step 1: Forçar a lista e desabilitar o alternador**

Em `LeadsPage.tsx`, derivar:

```tsx
const isAllFunnels = activeFunnelId === ALL_FUNNELS;
const effectiveView: LeadsView = isAllFunnels ? "list" : view;
```

Usar `effectiveView` em todo lugar onde hoje se usa `view`. Passar `viewLocked={isAllFunnels}` ao `LeadsHeader`; lá, o `ToggleGroup` recebe `disabled` e um `Tooltip` com `COPY.allFunnelsNotice`.

- [ ] **Step 2: Toast único por sessão**

```tsx
const noticeShown = useRef(false);
useEffect(() => {
  if (!isAllFunnels || noticeShown.current) return;
  noticeShown.current = true;
  toast.info(FUNNEL_COPY.allFunnelsNotice);
}, [isAllFunnels]);
```

Uma vez por sessão, não por render nem por navegação.

- [ ] **Step 3: Coluna "Funis" na lista**

Em `LeadsList.tsx`, adicionar a coluna com até **2 chips** (ponto de accent + nome) + `+N`, tooltip com o resto, e cadeado (`mdi:lock-outline`) para participação em funil sem acesso.

A coluna aparece **sempre que o usuário alcança mais de um funil**, e obrigatoriamente em "Todos os funis" (spec §7.5). Respeite `useResizableColumns` e o menu de visibilidade de colunas — regra de UX §4.

Os dados vêm de `listEntriesByFunnel` já carregado pela Task 9; **não** faça uma chamada por lead (era o defeito O(leads × entries) que a fase 2 corrigiu).

- [ ] **Step 4: Verificar**

Run: `bun run test && bun run build`
Manual: escolher "Todos os funis" → cai em lista, o alternador Kanban/Lista fica desabilitado com tooltip, o toast aparece **uma vez**, e a coluna Funis mostra os chips.

- [ ] **Step 5: Commit**

```bash
git add src/features/leads
git commit -m "feat(leads): add the consolidated 'Todos os funis' view

Every funnel owns its stages, so there is no shared X axis and a unified
kanban cannot exist. Selecting the consolidated view forces the list,
disables the Kanban/Lista toggle with an explanation and adds the Funis
column — stated explicitly because the obvious next move for anyone
reading the feature is to try building the unified board."
```

---

# Task 9: Filtrar por funil no servidor

O contrato já tem `funnelId`/`funnelStageId` (fase 2), o Supabase já resolve por join e o mock já indexa por `Set`. Falta **passar o parâmetro**.

**Files:**
- Modify: `src/features/leads/hooks/useLeadsList.ts`
- Modify: `src/features/leads/pages/LeadsPage.tsx`

- [ ] **Step 1: Aceitar o funil no hook**

`useLeadsList` passa a receber `funnelId?: ID` e incluí-lo **na queryKey** — senão a troca de funil serve cache errado:

```ts
queryKey: ["leads-list", ownerCrossStore ? "all" : storeId, excludeLost, funnelId] as const,
queryFn: () =>
  provider.list({
    storeId: ownerCrossStore ? undefined : storeId,
    pageSize: FETCH_ALL_PAGE_SIZE,
    excludeLost,
    funnelId,
  }),
```

`ALL_FUNNELS` **não** é um id de funil: quando ele está ativo, passe `funnelId: undefined`.

- [ ] **Step 2: Ligar na página**

```tsx
const list = useLeadsList({
  filters,
  sort,
  funnelId: isAllFunnels || activeFunnelId === null ? undefined : activeFunnelId,
});
```

- [ ] **Step 3: Verificar**

Run: `bun run test && bun run build`
Manual: trocar de funil muda o conjunto de leads; voltar ao funil anterior traz o conjunto anterior (cache por funil, sem vazamento).

- [ ] **Step 4: Commit**

```bash
git add src/features/leads/hooks/useLeadsList.ts src/features/leads/pages/LeadsPage.tsx
git commit -m "feat(leads): scope the list to the active funnel, server-side

The contract, the Supabase join and the mock index all landed in phase 2;
this wires the parameter through. funnelId is part of the query key —
without it the switch would serve another funnel's cached rows."
```

---

# Task 10: Formulário mínimo de criar funil

Puxado para esta fase de propósito: com `funnelCount === 1` os três padrões degradam para rótulo estático (§6.6) e entregaríamos três componentes que ninguém consegue exercitar.

Escopo **mínimo** — nome, ícone, accent, descrição. Etapas, acesso e limite de acúmulo são da fase 6 (§9). O funil nasce com as três etapas obrigatórias (`entrada`, `ganho`, `perda`), porque `assert_funnel_has_terminal_stages` (migration `20260723120000`) é um constraint trigger deferido e **rejeita funil incompleto no commit**.

**Files:**
- Create: `src/features/funnels/components/NewFunnelModal.tsx`
- Modify: `src/features/funnels/i18n/pt-BR.ts`
- Modify: `src/features/funnels/components/FunnelNav.tsx`

- [ ] **Step 1: Microcopy**

```ts
newFunnel: {
  trigger: "Novo funil",
  title: "Novo funil",
  name: "Nome",
  namePlaceholder: "Catalisador",
  icon: "Ícone",
  accent: "Identidade",
  description: "Descrição",
  descriptionPlaceholder: "Opcional — para que serve este funil.",
  cancel: "Cancelar",
  submit: "Criar funil",
  created: (nome: string) => `Funil ${nome} criado.`,
  nameRequired: "Dê um nome ao funil.",
  nameTaken: "Já existe um funil com esse nome.",
},
```

- [ ] **Step 2: Implementar o modal**

`Dialog` + react-hook-form + zod. Campos: nome (obrigatório, ≤ 40), grade de ~24 ícones `mdi:` curados do mundo de peças pesadas (filtro, turbo, injeção, freio…), 9 swatches de accent via `getAccentClasses(n).chip`, descrição opcional.

O accent sugerido é **o próximo slot livre** entre os funis existentes (spec: "grade fechada de 8, com sugestão automática do próximo slot livre"). Slot 0 é reservado ao `Geral` — não ofereça.

Ao submeter, `createFunnel({ storeId, name, description, accent, icon, position, isDefault: false, openToStore: true, entryAlertThreshold: 50 })`. `position` = maior `position` atual + 1.

**As três etapas obrigatórias** são criadas em seguida com `replaceStages(novoFunnel.id, [...])`: `Novo` (`entrada`, position 0), `Em andamento` (`aberta`, position 1), `Ganho` (`ganho`, position 2), `Perdido` (`perda`, position 3). Sem isso o constraint trigger derruba a transação.

Invalidar `["lead-funnels", storeId]` e `["lead-funnel-counts", storeId]`, e `setActiveFunnel(novo.id)`.

- [ ] **Step 3: Gate de permissão**

Só `canManage` (Dono/Gestor) vê o gatilho. Se alguém chegar sem permissão, `toast.error(COPY.noPermissionToCreate)`.

- [ ] **Step 4: Verificar**

Run: `bun run test && bun run build`
Manual em modo Demonstração: criar um funil → ele aparece nos três padrões, com a contagem em 0 → o board abre vazio → o accent sugerido é o próximo livre.

- [ ] **Step 5: Commit**

```bash
git add src/features/funnels
git commit -m "feat(funnels): add the minimal create-funnel form

Pulled into the navigation phase on purpose: with a single funnel all
three patterns degrade to a static label, so without creation we would
ship three components nobody can exercise.

The funnel is created with its three mandatory stages in the same flow —
assert_funnel_has_terminal_stages is a deferred constraint trigger and
rejects an incomplete funnel at commit, so a two-step 'create then add
stages' UI would fail on the first step."
```

---

# Task 11: Sincronia `leads` → participação

**O débito que a fase 3 herda.** Hoje quem muda a etapa de um lead pelo kanban escreve em `leads.stage` e a participação não acompanha. É inócuo enquanto nada lê a etapa da participação — mas a fase 4 troca as colunas do board pelas etapas do funil, e nesse instante os dados divergem em silêncio.

Pagar aqui, com a fase 3 fresca, é mais barato que descobrir na 4.

**Files:**
- Create: `supabase/migrations/<timestamp>_lead_stage_membership_sync.sql`
- Create: `docs/dev/lead-funnel-sync.md`

- [ ] **Step 1: Mapear o que escreve em `leads.stage` hoje**

```bash
grep -rn "stage" src/providers/data/impl/supabase/leads.ts | grep -iE "update|patch"
grep -rn "\.update(" src/features/leads/ | head -20
```

Anote cada chamador. **Não altere nenhum ainda** — o passo seguinte resolve no banco, que é onde a garantia é total.

- [ ] **Step 2: Escrever a migration**

A heurística de nome é **a mesma do backfill** `20260723122000:148` — `lower(s.name) = lower(left(l.stage->>'name', 24))` com `s.kind not in ('ganho','perda')`. Não invente outra: divergir do backfill faria a sincronia discordar da migração que criou os dados.

```sql
-- Keep the default-funnel membership in step with leads.stage.
--
-- Phase 4 replaces the board columns with the funnel's own stages. From that
-- moment a lead moved on the kanban would leave leads.stage and
-- lead_funnel_entries.stage_id disagreeing, with nothing to notice it.
--
-- ONLY the default funnel is synced. Moving a lead in one funnel must not
-- touch its position in the others — that is the entire point of the N:N
-- model (owner decision 1). Outcome and estimated value are never synced:
-- they belong to the membership (owner decisions 5 and 6).
--
-- Best-effort by design. A stage name matching nothing leaves the membership
-- where it is instead of raising; trading a silent divergence for a blocked
-- screen is not an improvement.

create or replace function public.sync_default_funnel_membership_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_funnel uuid;
  v_stage  uuid;
begin
  if new.stage->>'name' is distinct from old.stage->>'name' then
    select f.id into v_funnel
      from public.lead_funnels f
     where f.store_id = new.store_id
       and f.is_default
       and f.archived_at is null
     limit 1;

    if v_funnel is null then
      return new;
    end if;

    -- Same matching rule as the backfill (20260723122000): truncated,
    -- case-insensitive, and never resolving onto a terminal stage.
    select s.id into v_stage
      from public.lead_funnel_stages s
     where s.funnel_id = v_funnel
       and lower(s.name) = lower(left(new.stage->>'name', 24))
       and s.kind not in ('ganho','perda')
     limit 1;

    if v_stage is null then
      return new;  -- unmatched name: leave the membership alone
    end if;

    update public.lead_funnel_entries e
       set stage_id = v_stage,
           entered_stage_at = now(),
           updated_at = now()
     where e.lead_id = new.id
       and e.funnel_id = v_funnel
       and e.stage_id is distinct from v_stage;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_sync_default_funnel_stage on public.leads;
create trigger leads_sync_default_funnel_stage
  after update of stage on public.leads
  for each row
  execute function public.sync_default_funnel_membership_stage();
```

Três detalhes que não são estilo:

- `security definer` + `set search_path` — as funções irmãs têm; `assert_funnel_has_terminal_stages` precisou de correção justamente por faltar.
- `entered_stage_at = now()` — o campo existe para dar "dias na etapa" **reais por funil**; sincronizar a etapa sem reiniciar o relógio o tornaria mentiroso.
- `stage_id is distinct from v_stage` no `WHERE` — sem isso um UPDATE que não muda a etapa ainda assim reescreveria `entered_stage_at`, zerando o contador a cada edição do lead.

- [ ] **Step 3: Ensaio com ROLLBACK antes de qualquer coisa**

Este é o rito que se pagou na fase 2 — foi o ensaio, não as cinco revisões de código, que pegou o `42804`.

```bash
{ echo "begin;"; cat supabase/migrations/<arquivo>.sql; echo "rollback;"; } > /tmp/ensaio.sql
supabase db query --linked -f /tmp/ensaio.sql
```

Expected: sem erro. Se houver, corrija **o arquivo** e repita — nunca aplique um arquivo que não passou no ensaio.

- [ ] **Step 4: Documentar**

`docs/dev/lead-funnel-sync.md`: o que sincroniza, o que deliberadamente **não** sincroniza (desfecho e valor seguem por participação — decisão 5 e 6 do dono), e por que a sincronia é best-effort.

- [ ] **Step 5: Commit — e PARAR**

```bash
git add supabase/migrations docs/dev/lead-funnel-sync.md
git commit -m "feat(db): sync the default-funnel membership when a lead changes stage

Phase 4 replaces the board columns with the funnel's own stages. From
that moment a lead moved on the kanban would keep leads.stage and
lead_funnel_entries.stage_id disagreeing, silently. This closes it while
the context is fresh.

Only the default funnel is synced: moving a lead in one funnel must not
touch its position in the others — that is the whole point of the N:N
model. Outcome and estimated value are never synced; they belong to the
membership by the owner's own decision.

Best-effort by design: a stage name that matches nothing leaves the
membership where it is instead of failing the lead's UPDATE. Trading a
silent divergence for a blocked screen is not an improvement.

VERSIONED, NOT APPLIED. Applying to production is a separate step and
requires the owner's explicit OK."
```

> ⚠️ **Não aplique a migration.** A regra do projeto (CLAUDE.md) é explícita: mergear o PR não aplica migration; a aplicação em produção é manual e exige OK do dono.

---

## Fechamento da Fase 3

- [ ] **Verificação final**

```bash
bun run test
bun run build
bunx tsc --noEmit 2>&1 | grep -E "features/(funnels|leads)" || echo "sem erros de tipo nos arquivos da fase"
bun run lint
```

Expected: suíte verde, build ok, sem erro de tipo novo, lint limpo.

- [ ] **Conferência manual**

`bun run dev`, em `/app/leads`, modo Demonstração (o mock semeia 4 funis):

1. Os três padrões trocam de funil e **nenhum** tem recurso que os outros não têm.
2. `?funil=<id>` é deep-link; F5 preserva; link inválido cai no padrão com aviso.
3. Estreitar/alargar a janela degrada e **volta** — a preferência sobrevive.
4. "Todos os funis" força a lista, desabilita o alternador e mostra a coluna Funis.
5. Criar um funil novo funciona e ele aparece nos três padrões.
6. A faixa de métricas sumiu; o popover mostra números reais.
7. Navegação por teclado: `/` busca, `[`/`]` trocam de funil, `Tab` alcança tudo.

- [ ] **Version bump**

A fase 3 é a **primeira entrega visível ao usuário** do multi-funil. Merece MINOR com codinome novo. Consultar `git tag -l` antes de escolher o número — a `main` anda rápido, e a fase 1–2 quase colidiu com um release feito em paralelo.

- [ ] **Atualizar o handoff**

Em `docs/superpowers/handoff-leads-multi-funil.md`: marcar a fase 3 como entregue na tabela §3, mover o débito de sincronia da tabela §7 para resolvido (com a ressalva de que a migration está versionada e **não aplicada**), e registrar o que a fase 4 herda.

**Próximo plano:** Fase 4 (Kanban) — card de 60px, indicador multi-funil, paginação por coluna, ordenação por tipo de etapa, colapso e `@dnd-kit`.
