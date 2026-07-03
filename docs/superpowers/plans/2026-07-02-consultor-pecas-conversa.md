# Consultor de peças na conversa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao vendedor um painel "Consultor de peças" embutido na conversa de WhatsApp para buscar uma peça, ver preço/referências/aplicação/estoque e agir (inserir texto, enviar card, copiar) sem sair do atendimento.

**Architecture:** Nova feature `src/features/part-lookup/` (engines puros testados + hooks + componentes) montada como um 3º painel do rail direito da `ConversationPage`, mutuamente exclusivo com ficha e mídias. Consome os providers de catálogo existentes (`useCatalogList`) e o fluxo de envio existente (`useSendProductCard`). Zero backend novo; preferência de layout em `localStorage`.

**Tech Stack:** React 19, TypeScript strict, TanStack Query (via `useCatalogList`), shadcn/ui, Tailwind v4 (tokens semânticos), Iconify, Vitest.

## Global Constraints

- **Tokens semânticos apenas** — `bg-background`/`bg-card`/`bg-muted`, `text-foreground`/`text-muted-foreground`, `border-border`, `bg-primary`, e severidades `text-/bg-/border-severity-{info|success|warning|critical}`. **Nunca** hex, `--gallo-*` cru, nem a cor da marca (dourado/`primary`) para sinal de estoque.
- **Sem migration e sem Edge Function.** A feature só lê catálogo e reusa o envio existente.
- **Provider Pattern:** dados só via `@/providers/data` (aqui, via `useCatalogList`/`usePartsProvider` já expostos por `@/features/catalog`). Proibido importar `@/mocks`.
- **NÃO tocar no cache do atendimento:** assinatura de mídia em lote, Realtime, query keys de mensagens/conversas e RPCs gated-once. Abrir/fechar o painel e as ações não alteram esse cache.
- **UI em português do Brasil** com acentos corretos; **código/identificadores em inglês**; comentários em inglês.
- **Papel do usuário** via `useAuth().userRole` (`RoleName = "Owner" | "Gestor" | "Vendedor" | ...`). **Custo/margem** visível só a `Owner` e `Gestor`.
- **`localStorage`** no padrão do projeto: chaves declaradas em `LOCALSTORAGE_KEYS` (`src/config/themes.ts`), valores prefixados `"gallo-..."`.
- **Gate de CI:** `bun run test` (Vitest) + `bun run build` (Vite). `bun run build` **não** faz type-check; avaliar tipos novos por delta com `bunx tsc --noEmit` se necessário.
- **Commits:** Conventional Commits em inglês, atômicos, com trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

**Criar (feature):**
- `src/features/part-lookup/engine/partInsertText.ts` — texto "T1" para inserir/enviar + `appendToDraft`.
- `src/features/part-lookup/engine/partCopy.ts` — strings de "copiar valor/código/ficha".
- `src/features/part-lookup/engine/partLookupLayout.ts` — tipo/constantes + `parsePartLookupLayout`.
- `src/features/part-lookup/engine/recentParts.ts` — `pushRecent` puro.
- `src/features/part-lookup/hooks/usePartLookupLayout.ts` — preferência de modelo (localStorage).
- `src/features/part-lookup/hooks/useRecentParts.ts` — recentes (localStorage).
- `src/features/part-lookup/hooks/useCanViewCostMargin.ts` — gate RBAC.
- `src/features/part-lookup/hooks/usePartLookup.ts` — estado de busca/filtros + `useCatalogList`.
- `src/features/part-lookup/hooks/useConsultorPanel.ts` — abre/fecha do painel (localStorage).
- `src/features/part-lookup/components/PartResultRow.tsx`
- `src/features/part-lookup/components/PartResultList.tsx`
- `src/features/part-lookup/components/PartSearchBar.tsx`
- `src/features/part-lookup/components/detail/PriceChannelsTable.tsx`
- `src/features/part-lookup/components/detail/CostMarginGate.tsx`
- `src/features/part-lookup/components/detail/PartDetailActions.tsx`
- `src/features/part-lookup/components/detail/PartDetailHeadline.tsx` — modelo V1.
- `src/features/part-lookup/components/detail/PartDetailDense.tsx` — modelo V2.
- `src/features/part-lookup/components/detail/PartDetailTabs.tsx` — modelo V3.
- `src/features/part-lookup/components/detail/PartDetail.tsx` — roteia pelo modelo.
- `src/features/part-lookup/components/LayoutModePicker.tsx` — seletor S1 (ícone→menu).
- `src/features/part-lookup/components/PartLookupPanel.tsx` — container (lista ↔ detalhe).
- `src/features/part-lookup/i18n/pt-BR.ts` — strings.
- `src/features/part-lookup/index.ts` — barrel.
- Testes co-localizados `*.test.ts` para cada engine.

**Modificar (integração):**
- `src/config/themes.ts` — 2 chaves novas em `LOCALSTORAGE_KEYS`.
- `src/features/conversations/components/ConversationHeader.tsx` — 3º botão de rail + 2 props.
- `src/features/conversations/components/MessageInput.tsx` — item "Consultar peça" + 1 prop.
- `src/features/conversations/pages/ConversationPage.tsx` — montar o painel + coordenação de exclusividade + injeção no rascunho.

**Fora deste plano (fase 2, plano próprio):** atalho `/preco` inline no composer (estende `parseSlash`/`SlashMenu`).

---

### Task 1: Fundação — chaves localStorage + i18n

**Files:**
- Modify: `src/config/themes.ts` (objeto `LOCALSTORAGE_KEYS`)
- Create: `src/features/part-lookup/i18n/pt-BR.ts`

**Interfaces:**
- Produces: `LOCALSTORAGE_KEYS.partLookupLayout`, `LOCALSTORAGE_KEYS.partLookupRecent`; `PART_LOOKUP_STRINGS`.

- [ ] **Step 1: Adicionar chaves em `LOCALSTORAGE_KEYS`**

Em `src/config/themes.ts`, dentro do objeto `LOCALSTORAGE_KEYS` (após `lastSeenVersion`):

```ts
  lastSeenVersion: "gallo-last-seen-version",
  partLookupLayout: "gallo-part-lookup-layout",
  partLookupRecent: "gallo-part-lookup-recent",
} as const;
```

- [ ] **Step 2: Criar strings pt-BR**

`src/features/part-lookup/i18n/pt-BR.ts`:

```ts
export const PART_LOOKUP_STRINGS = {
  panelTitle: "Consultor de peças",
  toggle: "Consultor",
  searchPlaceholder: "Buscar peça: nome, código, OEM, referência…",
  filterInStock: "Em estoque",
  results: "Resultados",
  recent: "Consultadas recentemente",
  emptyQuery: "Busque por nome, código, OEM ou referência.",
  noResults: (q: string) => `Nenhuma peça para "${q}".`,
  noResultsHint: "Confira o código ou tente pela aplicação (veículo).",
  openCatalog: "Abrir no catálogo",
  error: "Não foi possível buscar. Tente novamente.",
  retry: "Tentar novamente",
  back: "Voltar aos resultados",
  priceStandard: "Preço · padrão",
  onRequest: "Sob consulta",
  consultValue: "Consultar valor",
  stock: "Estoque",
  location: "loc.",
  channels: "Canais de preço",
  application: "Aplicação",
  references: "Referências & equivalências",
  oem: "OEM",
  cross: "Cross",
  equivalent: "Equiv.",
  costMargin: "Custo & margem",
  costMarginGated: "gestor",
  reveal: "mostrar",
  hide: "ocultar",
  insert: "Inserir",
  send: "Enviar card",
  more: "Mais ações",
  copyValue: "Copiar valor",
  copyCode: "Copiar código / OEM",
  copySheet: "Copiar ficha completa",
  sendPhoto: "Enviar só a foto",
  layoutTitle: "Modelo de visualização",
  layoutHeadline: "Headline",
  layoutHeadlineHint: "preço grande + expandir",
  layoutDense: "Densa",
  layoutDenseHint: "tudo à vista",
  layoutTabs: "Hero + abas",
  layoutTabsHint: "sem scroll",
  stockIn: (n: number) => `${n} un`,
  stockLow: (n: number) => `Últimas ${n} un`,
  stockOut: "Sem estoque",
} as const;
```

- [ ] **Step 3: Verificar build**

Run: `cd .claude/worktrees/feat+inline-price-lookup && bun run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/config/themes.ts src/features/part-lookup/i18n/pt-BR.ts
git commit -m "feat(part-lookup): add localStorage keys and pt-BR strings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Engine — texto de inserção (T1) + `appendToDraft`

**Files:**
- Create: `src/features/part-lookup/engine/partInsertText.ts`
- Test: `src/features/part-lookup/engine/partInsertText.test.ts`

**Interfaces:**
- Consumes: `IPart` de `@/shared/types`.
- Produces: `buildPartInsertText(part: IPart): string`; `appendToDraft(prev: string, text: string): string`.

- [ ] **Step 1: Escrever o teste que falha**

`src/features/part-lookup/engine/partInsertText.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPartInsertText, appendToDraft } from "./partInsertText";
import type { IPart } from "@/shared/types";

const base: IPart = {
  id: "p1", sku: "21707133", name: "Filtro de óleo Scania DC13",
  oemCodes: ["1774715", "2036249"], equivalentPartIds: [], applications: [],
  brand: "Mahle", supplier: "Mahle", unitCost: 120, unitPrice: 189.9,
  marginPercent: 0.58, reference: "5805541", stockAvailable: 42, stockMinimum: 2,
  division: "parts", active: true, createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("buildPartInsertText", () => {
  it("formats name in bold with code, reference, price and stock", () => {
    const t = buildPartInsertText(base);
    expect(t).toContain("*Filtro de óleo Scania DC13*");
    expect(t).toContain("Código: 21707133");
    expect(t).toContain("Ref.: 5805541");
    expect(t).toContain("R$ 189,90");
    expect(t).toContain("42 un");
  });

  it("degrades missing price to 'Sob consulta', never R$ 0,00", () => {
    const t = buildPartInsertText({ ...base, unitPrice: 0 });
    expect(t).toContain("Sob consulta");
    expect(t).not.toContain("0,00");
  });

  it("omits reference when absent", () => {
    const t = buildPartInsertText({ ...base, reference: undefined });
    expect(t).not.toContain("Ref.:");
  });

  it("never leaks cost or margin", () => {
    const t = buildPartInsertText(base);
    expect(t).not.toContain("120");
    expect(t).not.toContain("margem");
    expect(t.toLowerCase()).not.toContain("custo");
  });

  it("shows 'sob consulta' stock when out of stock", () => {
    const t = buildPartInsertText({ ...base, stockAvailable: 0 });
    expect(t).toContain("Disp.: sob consulta");
  });
});

describe("appendToDraft", () => {
  it("returns the text when draft is empty", () => {
    expect(appendToDraft("", "novo")).toBe("novo");
    expect(appendToDraft("   ", "novo")).toBe("novo");
  });
  it("appends with a blank line, preserving existing draft", () => {
    expect(appendToDraft("oi", "peça")).toBe("oi\n\npeça");
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `bunx vitest run src/features/part-lookup/engine/partInsertText.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/features/part-lookup/engine/partInsertText.ts`:

```ts
import type { IPart } from "@/shared/types";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Price text — never "R$ 0,00"; missing/zero price degrades to a consult label. */
export function priceText(part: Pick<IPart, "unitPrice">): string {
  return part.unitPrice > 0 ? BRL.format(part.unitPrice) : "Sob consulta";
}

/** Stock phrase used in the inserted text. */
function stockPhrase(part: Pick<IPart, "stockAvailable">): string {
  return part.stockAvailable > 0 ? `${part.stockAvailable} un` : "sob consulta";
}

/**
 * Build the "T1 · Completo" WhatsApp text for a part: bold name (*..*), code +
 * manufacturer reference, price and stock. NEVER includes cost or margin.
 */
export function buildPartInsertText(part: IPart): string {
  const refLine = [`Código: ${part.sku}`];
  if (part.reference) refLine.push(`Ref.: ${part.reference}`);
  return [
    `*${part.name}*`,
    refLine.join(" · "),
    `Valor: ${priceText(part)} · Disp.: ${stockPhrase(part)}`,
  ].join("\n");
}

/** Append text to a draft, preserving any existing content (blank line between). */
export function appendToDraft(prev: string, text: string): string {
  const trimmed = prev.replace(/\s+$/, "");
  return trimmed.length === 0 ? text : `${trimmed}\n\n${text}`;
}
```

- [ ] **Step 4: Rodar o teste (deve passar)**

Run: `bunx vitest run src/features/part-lookup/engine/partInsertText.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/part-lookup/engine/partInsertText.ts src/features/part-lookup/engine/partInsertText.test.ts
git commit -m "feat(part-lookup): part insert-text builder (T1) and appendToDraft

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Engine — textos de cópia

**Files:**
- Create: `src/features/part-lookup/engine/partCopy.ts`
- Test: `src/features/part-lookup/engine/partCopy.test.ts`

**Interfaces:**
- Consumes: `IPart`; `buildPartInsertText`, `priceText` (Task 2).
- Produces: `copyValue(part)`, `copyCode(part)`, `copyFullSheet(part)` — todos `string`.

- [ ] **Step 1: Teste que falha**

`src/features/part-lookup/engine/partCopy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { copyValue, copyCode, copyFullSheet } from "./partCopy";
import type { IPart } from "@/shared/types";

const part: IPart = {
  id: "p1", sku: "21707133", name: "Filtro de óleo Scania DC13",
  oemCodes: ["1774715", "2036249"], equivalentPartIds: [],
  applications: [{ id: "a1", vehicleBrand: "Scania", vehicleModel: "R450", yearStart: 2017, yearEnd: 2022, engine: "DC13" }],
  brand: "Mahle", supplier: "Mahle", unitCost: 120, unitPrice: 189.9, marginPercent: 0.58,
  reference: "5805541", stockAvailable: 42, stockMinimum: 2, division: "parts",
  active: true, createdAt: "x", updatedAt: "x",
};

describe("partCopy", () => {
  it("copyValue returns BRL price", () => {
    expect(copyValue(part)).toBe("R$ 189,90");
  });
  it("copyValue degrades to 'Sob consulta' when zero", () => {
    expect(copyValue({ ...part, unitPrice: 0 })).toBe("Sob consulta");
  });
  it("copyCode joins sku and oem codes", () => {
    expect(copyCode(part)).toBe("21707133 · 1774715 · 2036249");
  });
  it("copyFullSheet includes application and never cost", () => {
    const s = copyFullSheet(part);
    expect(s).toContain("Scania R450");
    expect(s).not.toContain("120");
  });
});
```

- [ ] **Step 2: Rodar (falha)**

Run: `bunx vitest run src/features/part-lookup/engine/partCopy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/part-lookup/engine/partCopy.ts`:

```ts
import type { IApplication, IPart } from "@/shared/types";
import { buildPartInsertText, priceText } from "./partInsertText";

export function copyValue(part: IPart): string {
  return priceText(part);
}

export function copyCode(part: IPart): string {
  return [part.sku, ...part.oemCodes].filter(Boolean).join(" · ");
}

function applicationLine(a: IApplication): string {
  const years = `${a.yearStart}–${a.yearEnd}`;
  const engine = a.engine ? ` (${a.engine})` : "";
  return `${a.vehicleBrand} ${a.vehicleModel} ${years}${engine}`;
}

/** Full sheet for clipboard: insert text + applications. Never cost/margin. */
export function copyFullSheet(part: IPart): string {
  const lines = [buildPartInsertText(part)];
  if (part.applications.length > 0) {
    lines.push(`Aplicação: ${part.applications.map(applicationLine).join(" · ")}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Rodar (passa)**

Run: `bunx vitest run src/features/part-lookup/engine/partCopy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/part-lookup/engine/partCopy.ts src/features/part-lookup/engine/partCopy.test.ts
git commit -m "feat(part-lookup): clipboard copy builders (value/code/full sheet)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Engine — parsing da preferência de layout

**Files:**
- Create: `src/features/part-lookup/engine/partLookupLayout.ts`
- Test: `src/features/part-lookup/engine/partLookupLayout.test.ts`

**Interfaces:**
- Produces: `type PartLookupLayout = "headline" | "dense" | "tabs"`; `PART_LOOKUP_LAYOUTS`; `DEFAULT_PART_LOOKUP_LAYOUT`; `parsePartLookupLayout(raw: string | null): PartLookupLayout`.

- [ ] **Step 1: Teste que falha**

`src/features/part-lookup/engine/partLookupLayout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePartLookupLayout, DEFAULT_PART_LOOKUP_LAYOUT } from "./partLookupLayout";

describe("parsePartLookupLayout", () => {
  it("returns the value when valid", () => {
    expect(parsePartLookupLayout("dense")).toBe("dense");
    expect(parsePartLookupLayout("tabs")).toBe("tabs");
  });
  it("falls back to default for null/invalid", () => {
    expect(parsePartLookupLayout(null)).toBe(DEFAULT_PART_LOOKUP_LAYOUT);
    expect(parsePartLookupLayout("banana")).toBe(DEFAULT_PART_LOOKUP_LAYOUT);
  });
  it("default is headline", () => {
    expect(DEFAULT_PART_LOOKUP_LAYOUT).toBe("headline");
  });
});
```

- [ ] **Step 2: Rodar (falha)**

Run: `bunx vitest run src/features/part-lookup/engine/partLookupLayout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/part-lookup/engine/partLookupLayout.ts`:

```ts
export type PartLookupLayout = "headline" | "dense" | "tabs";

export const PART_LOOKUP_LAYOUTS: readonly PartLookupLayout[] = ["headline", "dense", "tabs"];
export const DEFAULT_PART_LOOKUP_LAYOUT: PartLookupLayout = "headline";

export function parsePartLookupLayout(raw: string | null): PartLookupLayout {
  return PART_LOOKUP_LAYOUTS.includes(raw as PartLookupLayout)
    ? (raw as PartLookupLayout)
    : DEFAULT_PART_LOOKUP_LAYOUT;
}
```

- [ ] **Step 4: Rodar (passa)**

Run: `bunx vitest run src/features/part-lookup/engine/partLookupLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/part-lookup/engine/partLookupLayout.ts src/features/part-lookup/engine/partLookupLayout.test.ts
git commit -m "feat(part-lookup): layout preference type + parser

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Engine — lista de recentes

**Files:**
- Create: `src/features/part-lookup/engine/recentParts.ts`
- Test: `src/features/part-lookup/engine/recentParts.test.ts`

**Interfaces:**
- Produces: `RECENT_CAP = 8`; `pushRecent(list: string[], id: string, cap?: number): string[]`; `parseRecent(raw: string | null): string[]`.

- [ ] **Step 1: Teste que falha**

`src/features/part-lookup/engine/recentParts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pushRecent, parseRecent, RECENT_CAP } from "./recentParts";

describe("pushRecent", () => {
  it("prepends new id", () => {
    expect(pushRecent(["b"], "a")).toEqual(["a", "b"]);
  });
  it("dedupes, moving existing id to front", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });
  it("caps the list length", () => {
    const long = Array.from({ length: RECENT_CAP }, (_, i) => `id${i}`);
    const out = pushRecent(long, "new");
    expect(out.length).toBe(RECENT_CAP);
    expect(out[0]).toBe("new");
  });
});

describe("parseRecent", () => {
  it("returns [] for null/invalid json", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{bad")).toEqual([]);
  });
  it("keeps only string entries", () => {
    expect(parseRecent(JSON.stringify(["a", 2, "b"]))).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Rodar (falha)**

Run: `bunx vitest run src/features/part-lookup/engine/recentParts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/part-lookup/engine/recentParts.ts`:

```ts
export const RECENT_CAP = 8;

export function pushRecent(list: string[], id: string, cap = RECENT_CAP): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, cap);
}

export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Rodar (passa)**

Run: `bunx vitest run src/features/part-lookup/engine/recentParts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/part-lookup/engine/recentParts.ts src/features/part-lookup/engine/recentParts.test.ts
git commit -m "feat(part-lookup): recent-parts pure helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Hooks — layout, recentes e gate RBAC

**Files:**
- Create: `src/features/part-lookup/hooks/usePartLookupLayout.ts`
- Create: `src/features/part-lookup/hooks/useRecentParts.ts`
- Create: `src/features/part-lookup/hooks/useCanViewCostMargin.ts`

**Interfaces:**
- Consumes: `LOCALSTORAGE_KEYS` (Task 1); `parsePartLookupLayout`/`PartLookupLayout` (Task 4); `pushRecent`/`parseRecent` (Task 5); `useAuth` de `@/features/auth/useAuth`.
- Produces: `usePartLookupLayout(): { layout, setLayout }`; `useRecentParts(): { recentIds, remember }`; `useCanViewCostMargin(): boolean`.

- [ ] **Step 1: `usePartLookupLayout`**

`src/features/part-lookup/hooks/usePartLookupLayout.ts`:

```ts
import { useCallback, useState } from "react";
import { LOCALSTORAGE_KEYS } from "@/config/themes";
import {
  parsePartLookupLayout,
  type PartLookupLayout,
} from "../engine/partLookupLayout";

export function usePartLookupLayout() {
  const [layout, setLayoutState] = useState<PartLookupLayout>(() =>
    parsePartLookupLayout(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(LOCALSTORAGE_KEYS.partLookupLayout),
    ),
  );

  const setLayout = useCallback((next: PartLookupLayout) => {
    setLayoutState(next);
    try {
      window.localStorage.setItem(LOCALSTORAGE_KEYS.partLookupLayout, next);
    } catch {
      /* storage unavailable — keep in-memory value */
    }
  }, []);

  return { layout, setLayout };
}
```

- [ ] **Step 2: `useRecentParts`**

`src/features/part-lookup/hooks/useRecentParts.ts`:

```ts
import { useCallback, useState } from "react";
import { LOCALSTORAGE_KEYS } from "@/config/themes";
import { parseRecent, pushRecent } from "../engine/recentParts";

export function useRecentParts() {
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    parseRecent(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(LOCALSTORAGE_KEYS.partLookupRecent),
    ),
  );

  const remember = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = pushRecent(prev, id);
      try {
        window.localStorage.setItem(LOCALSTORAGE_KEYS.partLookupRecent, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { recentIds, remember };
}
```

- [ ] **Step 3: `useCanViewCostMargin`**

`src/features/part-lookup/hooks/useCanViewCostMargin.ts`:

```ts
import { useAuth } from "@/features/auth/useAuth";

/** Cost & margin are internal data: only Owner and Gestor may reveal them. */
export function useCanViewCostMargin(): boolean {
  const { userRole } = useAuth();
  return userRole === "Owner" || userRole === "Gestor";
}
```

- [ ] **Step 4: Verificar build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 5: Commit**

```bash
git add src/features/part-lookup/hooks/usePartLookupLayout.ts src/features/part-lookup/hooks/useRecentParts.ts src/features/part-lookup/hooks/useCanViewCostMargin.ts
git commit -m "feat(part-lookup): layout/recent/cost-gate hooks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Hook — busca de peças

**Files:**
- Create: `src/features/part-lookup/hooks/usePartLookup.ts`

**Interfaces:**
- Consumes: `useCatalogList`, `EMPTY_FILTERS`, `DEFAULT_SORT`, `DEFAULT_PAGE_SIZE` de `@/features/catalog`; `ICatalogListQuery` (shape `{ data, total, isLoading, isFetching, isError, refetch, invalidate }`).
- Produces: `usePartLookup(): { query, setQuery, vehicleBrand, setVehicleBrand, inStockOnly, setInStockOnly, list, visibleParts }` onde `list: ICatalogListQuery` e `visibleParts: IPart[]`.

> Nota: confirmar que `useCatalogList`, `EMPTY_FILTERS`, `DEFAULT_SORT`, `DEFAULT_PAGE_SIZE` estão exportados por `@/features/catalog` (barrel). Se não estiverem, importar dos caminhos internos (`@/features/catalog/hooks/useCatalogList`, `@/features/catalog/utils/listFilters`) — ambos existem.

- [ ] **Step 1: Implementar**

`src/features/part-lookup/hooks/usePartLookup.ts`:

```ts
import { useEffect, useMemo, useState } from "react";
import type { IPart } from "@/shared/types";
import { useCatalogList } from "@/features/catalog/hooks/useCatalogList";
import {
  EMPTY_FILTERS,
  DEFAULT_SORT,
  DEFAULT_PAGE_SIZE,
} from "@/features/catalog/utils/listFilters";

function useDebounced<T>(value: T, delay = 250): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setD(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return d;
}

export function usePartLookup() {
  const [query, setQuery] = useState("");
  const [vehicleBrand, setVehicleBrand] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const debounced = useDebounced(query);

  const filters = useMemo(
    () => ({
      ...EMPTY_FILTERS,
      search: debounced,
      vehicleBrand: vehicleBrand ?? undefined,
    }),
    [debounced, vehicleBrand],
  );

  const list = useCatalogList(filters, DEFAULT_SORT, 1, DEFAULT_PAGE_SIZE);

  // "Em estoque" is applied client-side to avoid coupling to StockBucket literals.
  const visibleParts: IPart[] = useMemo(
    () => (inStockOnly ? list.data.filter((p) => p.stockAvailable > 0) : list.data),
    [list.data, inStockOnly],
  );

  return {
    query, setQuery,
    vehicleBrand, setVehicleBrand,
    inStockOnly, setInStockOnly,
    list, visibleParts,
  };
}
```

- [ ] **Step 2: Verificar build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 3: Commit**

```bash
git add src/features/part-lookup/hooks/usePartLookup.ts
git commit -m "feat(part-lookup): search hook over catalog provider

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Componentes — linha e lista de resultados

**Files:**
- Create: `src/features/part-lookup/components/PartResultRow.tsx`
- Create: `src/features/part-lookup/components/PartResultList.tsx`

**Interfaces:**
- Consumes: `IPart`; `priceText` (Task 2); `PART_LOOKUP_STRINGS` (Task 1); `Icon` de `@/components/Icon`.
- Produces: `PartResultRow({ part, active, onSelect })`; `PartResultList({ parts, isLoading, isError, query, activeId, onSelect, onRetry, onOpenCatalog })`.

> Padrão visual dos mockups aprovados (`.superpowers/brainstorm/.../placement.html`, `detail-layout-3up.html`): linha = nome (truncate) + SKU/marca à esquerda; preço (canal padrão) + badge de estoque à direita; estoque por severidade.

- [ ] **Step 1: `PartResultRow`**

`src/features/part-lookup/components/PartResultRow.tsx`:

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { priceText } from "../engine/partInsertText";

function stockClass(part: IPart): string {
  if (part.stockAvailable <= 0) return "text-severity-critical";
  if (part.stockAvailable <= part.stockMinimum) return "text-severity-warning";
  return "text-severity-success";
}

function stockLabel(part: IPart): string {
  if (part.stockAvailable <= 0) return "sem estoque";
  return `${part.stockAvailable} un`;
}

export interface IPartResultRowProps {
  part: IPart;
  active?: boolean;
  onSelect: (part: IPart) => void;
}

export function PartResultRow({ part, active, onSelect }: IPartResultRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(part)}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left transition-colors ${
        active ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/60"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon icon="mdi:cog-outline" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{part.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[`SKU ${part.sku}`, part.brand].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-primary">{priceText(part)}</span>
        <span className={`block text-[11px] font-semibold ${stockClass(part)}`}>{stockLabel(part)}</span>
      </span>
    </button>
  );
}
```

- [ ] **Step 2: `PartResultList`** (estados: loading/erro/vazio/lista)

`src/features/part-lookup/components/PartResultList.tsx`:

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { PartResultRow } from "./PartResultRow";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

export interface IPartResultListProps {
  parts: IPart[];
  isLoading: boolean;
  isError: boolean;
  query: string;
  activeId?: string;
  onSelect: (part: IPart) => void;
  onRetry: () => void;
  onOpenCatalog: () => void;
}

export function PartResultList(props: IPartResultListProps) {
  const { parts, isLoading, isError, query, activeId, onSelect, onRetry, onOpenCatalog } = props;

  if (isError) {
    return (
      <div className="rounded-md border border-severity-critical/50 bg-severity-critical/5 p-4 text-center text-sm">
        <p className="text-foreground">{S.error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>{S.retry}</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[52px] animate-pulse rounded-md border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-center text-sm">
        <p className="text-foreground">{query ? S.noResults(query) : S.emptyQuery}</p>
        {query && <p className="mt-1 text-xs text-muted-foreground">{S.noResultsHint}</p>}
        <Button variant="outline" size="sm" className="mt-2" onClick={onOpenCatalog}>
          <Icon icon="mdi:open-in-new" size={14} className="mr-1.5" />
          {S.openCatalog}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {parts.map((part) => (
        <PartResultRow key={part.id} part={part} active={part.id === activeId} onSelect={onSelect} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/features/part-lookup/components/PartResultRow.tsx src/features/part-lookup/components/PartResultList.tsx
git commit -m "feat(part-lookup): result row + list with loading/empty/error states

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Componente — barra de busca + filtros

**Files:**
- Create: `src/features/part-lookup/components/PartSearchBar.tsx`

**Interfaces:**
- Consumes: `Input` (`@/components/ui/input`), `Icon`, `PART_LOOKUP_STRINGS`.
- Produces: `PartSearchBar({ query, onQueryChange, vehicleBrand, onVehicleBrandChange, inStockOnly, onInStockToggle })`.

Constante local `VEHICLE_BRANDS = ["Volvo", "Scania", "Mercedes-Benz", "Ford", "Iveco"]`.

- [ ] **Step 1: Implementar**

`src/features/part-lookup/components/PartSearchBar.tsx`:

```tsx
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

const VEHICLE_BRANDS = ["Volvo", "Scania", "Mercedes-Benz", "Ford", "Iveco"];

export interface IPartSearchBarProps {
  query: string;
  onQueryChange: (v: string) => void;
  vehicleBrand: string | null;
  onVehicleBrandChange: (v: string | null) => void;
  inStockOnly: boolean;
  onInStockToggle: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {children}
    </button>
  );
}

export function PartSearchBar(props: IPartSearchBarProps) {
  const { query, onQueryChange, vehicleBrand, onVehicleBrandChange, inStockOnly, onInStockToggle, inputRef } = props;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Icon icon="mdi:magnify" size={16} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={S.searchPlaceholder}
          className="h-9 pl-8"
          aria-label={S.searchPlaceholder}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VEHICLE_BRANDS.map((b) => (
          <Chip key={b} active={vehicleBrand === b} onClick={() => onVehicleBrandChange(vehicleBrand === b ? null : b)}>
            {b}
          </Chip>
        ))}
        <Chip active={inStockOnly} onClick={onInStockToggle}>{S.filterInStock}</Chip>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 3: Commit**

```bash
git add src/features/part-lookup/components/PartSearchBar.tsx
git commit -m "feat(part-lookup): search bar with vehicle-brand and in-stock filters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Componentes de detalhe — canais, gate de custo e ações

**Files:**
- Create: `src/features/part-lookup/components/detail/PriceChannelsTable.tsx`
- Create: `src/features/part-lookup/components/detail/CostMarginGate.tsx`
- Create: `src/features/part-lookup/components/detail/PartDetailActions.tsx`

**Interfaces:**
- Consumes: `IPart`; `resolvePriceTables` de `@/features/catalog/utils/pricing`; `useCanViewCostMargin` (Task 6); `buildPartInsertText` (Task 2); `copyValue/copyCode/copyFullSheet` (Task 3); `useSendProductCard` de `@/features/quick-send`; `DropdownMenu*`, `Button`, `Icon`; `toast` de `sonner`.
- Produces:
  - `PriceChannelsTable({ part })`
  - `CostMarginGate({ part })`
  - `PartDetailActions({ part, conversation, whatsappAccount, onInsertText })`

- [ ] **Step 1: `PriceChannelsTable`**

`src/features/part-lookup/components/detail/PriceChannelsTable.tsx`:

```tsx
import type { IPart } from "@/shared/types";
import { resolvePriceTables } from "@/features/catalog/utils/pricing";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function PriceChannelsTable({ part }: { part: IPart }) {
  const tables = resolvePriceTables(part);
  if (tables.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem tabela de preços.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {tables.map((t) => (
        <div key={t.id} className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t.label}</span>
          <span className={`font-semibold tabular-nums ${t.id === "padrao" ? "text-primary" : "text-foreground"}`}>
            {BRL.format(t.price)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `CostMarginGate`** (mascarado + revelar; só Owner/Gestor)

`src/features/part-lookup/components/detail/CostMarginGate.tsx`:

```tsx
import { useState } from "react";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { useCanViewCostMargin } from "../../hooks/useCanViewCostMargin";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function CostMarginGate({ part }: { part: IPart }) {
  const canView = useCanViewCostMargin();
  const [revealed, setRevealed] = useState(false);
  if (!canView) return null;

  return (
    <div className="flex items-center justify-between border-l-2 border-severity-warning/60 bg-severity-warning/5 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-severity-warning">
        <Icon icon="mdi:lock-outline" size={13} />
        {S.costMargin} · {S.costMarginGated}
        {revealed && (
          <span className="ml-1 tabular-nums text-foreground">
            {BRL.format(part.unitCost)} · {Math.round(part.marginPercent * 100)}%
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="rounded-md border border-severity-warning px-2 py-0.5 text-[11px] text-severity-warning"
      >
        {revealed ? S.hide : S.reveal}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `PartDetailActions`** (Inserir / Enviar card / overflow)

`src/features/part-lookup/components/detail/PartDetailActions.tsx`:

```tsx
import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSendProductCard } from "@/features/quick-send";
import { useCanViewCostMargin } from "../../hooks/useCanViewCostMargin";
import { buildPartInsertText } from "../../engine/partInsertText";
import { copyCode, copyFullSheet, copyValue } from "../../engine/partCopy";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";

export interface IPartDetailActionsProps {
  part: IPart;
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  onInsertText: (text: string) => void;
}

async function copyToClipboard(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

export function PartDetailActions({ part, conversation, whatsappAccount, onInsertText }: IPartDetailActionsProps) {
  const { sendProductCard } = useSendProductCard(conversation, whatsappAccount);
  const canViewCost = useCanViewCostMargin();

  return (
    <div className="flex items-center gap-2 border-t border-border bg-card/60 p-2.5">
      <Button variant="secondary" size="sm" className="flex-1 gap-1.5" onClick={() => onInsertText(buildPartInsertText(part))}>
        <Icon icon="mdi:plus" size={14} />
        {S.insert}
      </Button>
      <Button size="sm" className="flex-1 gap-1.5" onClick={() => void sendProductCard(part)}>
        <Icon icon="mdi:send" size={14} />
        {S.send}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label={S.more}>
            <Icon icon="mdi:dots-horizontal" size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void copyToClipboard(copyValue(part), "Valor copiado")}>{S.copyValue}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyToClipboard(copyCode(part), "Código copiado")}>{S.copyCode}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyToClipboard(copyFullSheet(part), "Ficha copiada")}>{S.copySheet}</DropdownMenuItem>
          {canViewCost && (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {S.costMargin}: veja no bloco abaixo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

> Nota: "Enviar só a foto" fica fora da v1 (o card de produto já embute a imagem). Reavaliar em fase 2.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 5: Commit**

```bash
git add src/features/part-lookup/components/detail/PriceChannelsTable.tsx src/features/part-lookup/components/detail/CostMarginGate.tsx src/features/part-lookup/components/detail/PartDetailActions.tsx
git commit -m "feat(part-lookup): price channels, cost/margin gate, detail actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Componentes de detalhe — os 3 modelos + roteador

**Files:**
- Create: `src/features/part-lookup/components/detail/PartDetailHeadline.tsx`
- Create: `src/features/part-lookup/components/detail/PartDetailDense.tsx`
- Create: `src/features/part-lookup/components/detail/PartDetailTabs.tsx`
- Create: `src/features/part-lookup/components/detail/PartDetail.tsx`

**Interfaces:**
- Consumes: `IPart`, `IConversation`, `IWhatsAppAccount`; `priceText` (Task 2); `PriceChannelsTable`, `CostMarginGate`, `PartDetailActions` (Task 10); `PartLookupLayout` (Task 4); `PART_LOOKUP_STRINGS`.
- Produces: `PartDetail({ part, layout, conversation, whatsappAccount, onBack, onInsertText })` que delega para o modelo escolhido. Cada modelo recebe `{ part }` (blocos de conteúdo) e o `PartDetail` fornece header/voltar/ações comuns.

Sub-componentes compartilhados definidos em `PartDetail.tsx` e exportados para os modelos: `PartIdentity`, `StockPill`, `HeadlinePrice`, `ApplicationList`, `ReferencesList`.

- [ ] **Step 1: `PartDetail.tsx` (blocos compartilhados + roteador + header/ações)**

```tsx
import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import type { PartLookupLayout } from "../../engine/partLookupLayout";
import { priceText } from "../../engine/partInsertText";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartDetailActions } from "./PartDetailActions";
import { PartDetailHeadline } from "./PartDetailHeadline";
import { PartDetailDense } from "./PartDetailDense";
import { PartDetailTabs } from "./PartDetailTabs";

export function StockPill({ part }: { part: IPart }) {
  const cls =
    part.stockAvailable <= 0 ? "text-severity-critical"
    : part.stockAvailable <= part.stockMinimum ? "text-severity-warning"
    : "text-severity-success";
  const label = part.stockAvailable <= 0 ? S.stockOut : `● ${part.stockAvailable} un`;
  return <span className={`text-sm font-bold ${cls}`}>{label}</span>;
}

export function PartIdentity({ part }: { part: IPart }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {part.imageUrl ? (
          <img src={part.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
        ) : (
          <Icon icon="mdi:cog-outline" size={20} />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{part.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          SKU {part.sku}
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{part.brand}</Badge>
          {part.unitOfMeasure && <span>· {part.unitOfMeasure}</span>}
        </p>
      </div>
    </div>
  );
}

export function HeadlinePrice({ part }: { part: IPart }) {
  return (
    <div className="grid grid-cols-[1.3fr_1fr] gap-2">
      <div className="rounded-lg border border-primary/40 bg-muted/40 p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{S.priceStandard}</p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-primary">{priceText(part)}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">à vista</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{S.stock}</p>
        <div className="mt-1"><StockPill part={part} /></div>
        {part.storageLocation && <p className="mt-0.5 text-[11px] text-muted-foreground">{S.location} {part.storageLocation}</p>}
      </div>
    </div>
  );
}

export function ApplicationList({ part }: { part: IPart }) {
  if (part.applications.length === 0) return <p className="text-xs text-muted-foreground">Sem aplicação cadastrada.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {part.applications.map((a) => (
        <span key={a.id} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground">
          {a.vehicleBrand} {a.vehicleModel} · {a.yearStart}–{a.yearEnd}{a.engine ? ` · ${a.engine}` : ""}
        </span>
      ))}
    </div>
  );
}

export function ReferencesList({ part }: { part: IPart }) {
  const cross = part.crossReferences ?? [];
  return (
    <div className="space-y-1 text-xs text-foreground">
      {part.reference && <p><span className="text-muted-foreground">Fabricante</span> {part.reference}</p>}
      {part.oemCodes.length > 0 && <p><span className="text-muted-foreground">{S.oem}</span> {part.oemCodes.join(" · ")}</p>}
      {cross.length > 0 && <p><span className="text-muted-foreground">{S.cross}</span> {cross.map((c) => `${c.brand} ${c.code}`).join(" · ")}</p>}
    </div>
  );
}

export interface IPartDetailProps {
  part: IPart;
  layout: PartLookupLayout;
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  onBack: () => void;
  onInsertText: (text: string) => void;
}

export function PartDetail({ part, layout, conversation, whatsappAccount, onBack, onInsertText }: IPartDetailProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <button type="button" onClick={onBack} className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        <Icon icon="mdi:arrow-left" size={14} /> {S.back}
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {layout === "dense" ? <PartDetailDense part={part} />
          : layout === "tabs" ? <PartDetailTabs part={part} />
          : <PartDetailHeadline part={part} />}
      </div>
      <PartDetailActions part={part} conversation={conversation} whatsappAccount={whatsappAccount} onInsertText={onInsertText} />
    </div>
  );
}
```

- [ ] **Step 2: `PartDetailHeadline.tsx` (V1 — colapsáveis)**

```tsx
import type { IPart } from "@/shared/types";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/Icon";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartIdentity, HeadlinePrice, ApplicationList, ReferencesList } from "./PartDetail";
import { PriceChannelsTable } from "./PriceChannelsTable";
import { CostMarginGate } from "./CostMarginGate";

function Section({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-t border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        <Icon icon="mdi:chevron-down" size={16} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function PartDetailHeadline({ part }: { part: IPart }) {
  return (
    <div>
      <div className="p-3"><PartIdentity part={part} /></div>
      <div className="px-3 pb-3"><HeadlinePrice part={part} /></div>
      <Section label={S.channels}><PriceChannelsTable part={part} /></Section>
      <Section label={S.application} defaultOpen><ApplicationList part={part} /></Section>
      <Section label={S.references}><ReferencesList part={part} /></Section>
      <CostMarginGate part={part} />
    </div>
  );
}
```

- [ ] **Step 3: `PartDetailDense.tsx` (V2 — tudo aberto)**

```tsx
import type { IPart } from "@/shared/types";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartIdentity, HeadlinePrice, ApplicationList, ReferencesList } from "./PartDetail";
import { PriceChannelsTable } from "./PriceChannelsTable";
import { CostMarginGate } from "./CostMarginGate";

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-3 py-2.5">
      <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function PartDetailDense({ part }: { part: IPart }) {
  return (
    <div>
      <div className="p-3"><PartIdentity part={part} /></div>
      <div className="px-3 pb-3"><HeadlinePrice part={part} /></div>
      <Block label={S.channels}><PriceChannelsTable part={part} /></Block>
      <Block label={S.application}><ApplicationList part={part} /></Block>
      <Block label={S.references}><ReferencesList part={part} /></Block>
      <CostMarginGate part={part} />
    </div>
  );
}
```

- [ ] **Step 4: `PartDetailTabs.tsx` (V3 — hero fixo + abas)**

```tsx
import { useState } from "react";
import type { IPart } from "@/shared/types";
import { PART_LOOKUP_STRINGS as S } from "../../i18n/pt-BR";
import { PartIdentity, HeadlinePrice, ApplicationList, ReferencesList } from "./PartDetail";
import { PriceChannelsTable } from "./PriceChannelsTable";
import { CostMarginGate } from "./CostMarginGate";

type Tab = "price" | "application" | "refs";

export function PartDetailTabs({ part }: { part: IPart }) {
  const [tab, setTab] = useState<Tab>("price");
  const tabs: { id: Tab; label: string }[] = [
    { id: "price", label: S.channels },
    { id: "application", label: S.application },
    { id: "refs", label: S.references },
  ];
  return (
    <div>
      <div className="bg-gradient-to-b from-primary/[0.07] to-transparent p-3"><PartIdentity part={part} /></div>
      <div className="px-3 pb-3"><HeadlinePrice part={part} /></div>
      <div className="flex border-t border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-selected={tab === t.id}
            className={`flex-1 border-b-2 px-2 py-2 text-xs ${tab === t.id ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-[70px] p-3">
        {tab === "price" && <PriceChannelsTable part={part} />}
        {tab === "application" && <ApplicationList part={part} />}
        {tab === "refs" && <ReferencesList part={part} />}
      </div>
      <CostMarginGate part={part} />
    </div>
  );
}
```

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 6: Commit**

```bash
git add src/features/part-lookup/components/detail/PartDetail.tsx src/features/part-lookup/components/detail/PartDetailHeadline.tsx src/features/part-lookup/components/detail/PartDetailDense.tsx src/features/part-lookup/components/detail/PartDetailTabs.tsx
git commit -m "feat(part-lookup): three detail layouts + shared blocks + router

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Componente — seletor de modelo (S1)

**Files:**
- Create: `src/features/part-lookup/components/LayoutModePicker.tsx`

**Interfaces:**
- Consumes: `DropdownMenu*` (radio group), `Icon`, `Button`; `PART_LOOKUP_LAYOUTS`/`PartLookupLayout` (Task 4); `PART_LOOKUP_STRINGS`.
- Produces: `LayoutModePicker({ layout, onLayoutChange })`.

- [ ] **Step 1: Implementar**

`src/features/part-lookup/components/LayoutModePicker.tsx`:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { PartLookupLayout } from "../engine/partLookupLayout";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

const OPTIONS: { id: PartLookupLayout; label: string; hint: string }[] = [
  { id: "headline", label: S.layoutHeadline, hint: S.layoutHeadlineHint },
  { id: "dense", label: S.layoutDense, hint: S.layoutDenseHint },
  { id: "tabs", label: S.layoutTabs, hint: S.layoutTabsHint },
];

export interface ILayoutModePickerProps {
  layout: PartLookupLayout;
  onLayoutChange: (layout: PartLookupLayout) => void;
}

export function LayoutModePicker({ layout, onLayoutChange }: ILayoutModePickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={S.layoutTitle}>
          <Icon icon="mdi:view-dashboard-variant-outline" size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">{S.layoutTitle}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={layout} onValueChange={(v) => onLayoutChange(v as PartLookupLayout)}>
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id} className="flex-col items-start gap-0">
              <span className="text-sm">{o.label}</span>
              <span className="text-[11px] text-muted-foreground">{o.hint}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 3: Commit**

```bash
git add src/features/part-lookup/components/LayoutModePicker.tsx
git commit -m "feat(part-lookup): layout mode picker (header dropdown)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Container do painel + hook de abertura + barrel

**Files:**
- Create: `src/features/part-lookup/components/PartLookupPanel.tsx`
- Create: `src/features/part-lookup/hooks/useConsultorPanel.ts`
- Create: `src/features/part-lookup/index.ts`

**Interfaces:**
- Consumes: `usePartLookup` (Task 7), `usePartLookupLayout`/`useRecentParts` (Task 6), `usePart` de `@/features/catalog/hooks/useCatalogList`, `PartSearchBar`/`PartResultList`/`LayoutModePicker`/`PartDetail`, `PART_LOOKUP_STRINGS`, `useNavigate` de `@tanstack/react-router`, `Icon`, `Button`.
- Produces:
  - `useConsultorPanel(): { open, setOpen, toggle }` (localStorage key `"gallo-conversation-consultor-open"`).
  - `PartLookupPanel({ open, onOpenChange, conversation, whatsappAccount, onInsertText })`.
  - barrel exports.

- [ ] **Step 1: `useConsultorPanel`** (espelha `useConversationFiche`)

`src/features/part-lookup/hooks/useConsultorPanel.ts`:

```ts
import { useCallback, useState } from "react";

const KEY = "gallo-conversation-consultor-open";

export function useConsultorPanel() {
  const [open, setOpenState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(KEY) === "1";
  });
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try { window.localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  return { open, setOpen, toggle };
}
```

- [ ] **Step 2: `PartLookupPanel`** (coluna não-modal; lista ↔ detalhe)

`src/features/part-lookup/components/PartLookupPanel.tsx`:

```tsx
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { usePartLookup } from "../hooks/usePartLookup";
import { usePartLookupLayout } from "../hooks/usePartLookupLayout";
import { useRecentParts } from "../hooks/useRecentParts";
import { PartSearchBar } from "./PartSearchBar";
import { PartResultList } from "./PartResultList";
import { LayoutModePicker } from "./LayoutModePicker";
import { PartDetail } from "./detail/PartDetail";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

export interface IPartLookupPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  onInsertText: (text: string) => void;
}

export function PartLookupPanel(props: IPartLookupPanelProps) {
  const { open, onOpenChange, conversation, whatsappAccount, onInsertText } = props;
  const search = usePartLookup();
  const { layout, setLayout } = usePartLookupLayout();
  const { recentIds, remember } = useRecentParts();
  const [selected, setSelected] = useState<IPart | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Recent parts shown when the query is empty (search over the loaded window).
  const recentParts = useMemo(
    () => recentIds.map((id) => search.list.data.find((p) => p.id === id)).filter((p): p is IPart => Boolean(p)),
    [recentIds, search.list.data],
  );

  if (!open) return null;

  const showRecent = search.query.trim() === "" && recentParts.length > 0;
  const parts = showRecent ? recentParts : search.visibleParts;

  const handleSelect = (part: IPart) => {
    setSelected(part);
    remember(part.id);
  };

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-card" aria-label={S.panelTitle}>
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Icon icon="mdi:magnify-scan" size={16} /> {S.panelTitle}
        </span>
        <span className="flex items-center gap-1">
          <LayoutModePicker layout={layout} onLayoutChange={setLayout} />
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Fechar" onClick={() => onOpenChange(false)}>
            <Icon icon="mdi:close" size={16} />
          </Button>
        </span>
      </header>

      {selected ? (
        <PartDetail
          part={selected}
          layout={layout}
          conversation={conversation}
          whatsappAccount={whatsappAccount}
          onBack={() => setSelected(null)}
          onInsertText={onInsertText}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border p-3">
            <PartSearchBar
              query={search.query}
              onQueryChange={search.setQuery}
              vehicleBrand={search.vehicleBrand}
              onVehicleBrandChange={search.setVehicleBrand}
              inStockOnly={search.inStockOnly}
              onInStockToggle={() => search.setInStockOnly(!search.inStockOnly)}
              inputRef={inputRef}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {showRecent && <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">{S.recent}</p>}
            <PartResultList
              parts={parts}
              isLoading={search.list.isLoading}
              isError={search.list.isError}
              query={search.query}
              onSelect={handleSelect}
              onRetry={search.list.refetch}
              onOpenCatalog={() => void navigate({ to: "/app/catalogo" })}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
```

> Nota de rota: confirmar o path da lista de catálogo (provável `/app/catalogo`). Se diferente, ajustar o `navigate({ to })`. Não bloqueia o restante.

- [ ] **Step 3: `index.ts` (barrel)**

`src/features/part-lookup/index.ts`:

```ts
// Components
export { PartLookupPanel } from "./components/PartLookupPanel";
// Hooks
export { useConsultorPanel } from "./hooks/useConsultorPanel";
// Engines (pure)
export { buildPartInsertText, appendToDraft, priceText } from "./engine/partInsertText";
// i18n
export { PART_LOOKUP_STRINGS } from "./i18n/pt-BR";
```

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 5: Commit**

```bash
git add src/features/part-lookup/components/PartLookupPanel.tsx src/features/part-lookup/hooks/useConsultorPanel.ts src/features/part-lookup/index.ts
git commit -m "feat(part-lookup): panel container (search <-> detail) + open hook + barrel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Integração — 3º botão no header da conversa

**Files:**
- Modify: `src/features/conversations/components/ConversationHeader.tsx`

**Interfaces:**
- Consumes: `PART_LOOKUP_STRINGS` (para o rótulo do botão).
- Produces: novas props `consultorOpen?: boolean`, `onToggleConsultor?: () => void` em `IConversationHeaderProps`.

- [ ] **Step 1: Adicionar props**

Em `IConversationHeaderProps` (após `onToggleMedia?`):

```ts
  mediaOpen?: boolean;
  onToggleMedia?: () => void;
  consultorOpen?: boolean;
  onToggleConsultor?: () => void;
```

- [ ] **Step 2: Renderizar o botão** (após o bloco do botão de mídia, seguindo o padrão)

```tsx
{onToggleConsultor && (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={consultorOpen ? "secondary" : "ghost"}
        size="sm"
        className="gap-1.5"
        onClick={onToggleConsultor}
        aria-pressed={consultorOpen}
      >
        <Icon icon="mdi:magnify-scan" size={14} />
        <span className="hidden md:inline">{PART_LOOKUP_STRINGS.toggle}</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent>{PART_LOOKUP_STRINGS.panelTitle}</TooltipContent>
  </Tooltip>
)}
```

Adicionar o import no topo: `import { PART_LOOKUP_STRINGS } from "@/features/part-lookup";`

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/ConversationHeader.tsx
git commit -m "feat(conversations): consultor toggle button in header

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Integração — item "Consultar peça" no composer

**Files:**
- Modify: `src/features/conversations/components/MessageInput.tsx`

**Interfaces:**
- Produces: nova prop opcional `onOpenPartLookup?: () => void` em `IMessageInputProps`; novo `DropdownMenuItem` no menu de anexo.

- [ ] **Step 1: Adicionar a prop** em `IMessageInputProps` (após `onAssigned?`):

```ts
  onAssigned?: () => void;
  onOpenPartLookup?: () => void;
```

E desestruturar no componente junto das demais props.

- [ ] **Step 2: Adicionar o item no `DropdownMenuContent` de anexo** (após o item "Enviar produto"):

```tsx
<DropdownMenuItem onSelect={() => onOpenPartLookup?.()}>
  <Icon icon="mdi:magnify-scan" size={14} className="mr-2" />
  {PART_LOOKUP_STRINGS.panelTitle}
</DropdownMenuItem>
```

Adicionar o import: `import { PART_LOOKUP_STRINGS } from "@/features/part-lookup";`

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/MessageInput.tsx
git commit -m "feat(conversations): 'Consultar peça' entry opens the lookup panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Integração — montar o painel na ConversationPage (rail exclusivo)

**Files:**
- Modify: `src/features/conversations/pages/ConversationPage.tsx`

**Interfaces:**
- Consumes: `PartLookupPanel`, `useConsultorPanel`, `appendToDraft` de `@/features/part-lookup`; estado `draft`/`setDraft` (já existe em L94); `fiche`/`media` (já existem).
- Produces: rail com 3 painéis mutuamente exclusivos; injeção no rascunho.

- [ ] **Step 1: Imports + hook + coordenação**

No topo:
```ts
import { PartLookupPanel, useConsultorPanel, appendToDraft } from "@/features/part-lookup";
```

Junto de `const fiche = useConversationFiche();` / `const media = useMediaGallery();`:
```ts
const consultor = useConsultorPanel();

const openConsultor = () => { fiche.setOpen(false); media.setOpen(false); consultor.setOpen(true); };
const toggleConsultor = () => (consultor.open ? consultor.setOpen(false) : openConsultor());
const toggleFicheExclusive = () => { if (!fiche.open) { media.setOpen(false); consultor.setOpen(false); } fiche.toggle(); };
const toggleMediaExclusive = () => { if (!media.open) { fiche.setOpen(false); consultor.setOpen(false); } media.toggle(); };
```

> Substituir o antigo `ficheButtonClick`/`media.toggle` passados ao Header pelos handlers exclusivos abaixo. Se existir lógica extra em `ficheButtonClick` (ex.: telemetria), preservá-la dentro de `toggleFicheExclusive`.

- [ ] **Step 2: Header** — trocar os handlers e adicionar props do consultor:

```tsx
<ConversationHeader
  conversation={conversation}
  // ...demais props...
  ficheOpen={fiche.open}
  onToggleFiche={toggleFicheExclusive}
  mediaOpen={media.open}
  onToggleMedia={toggleMediaExclusive}
  consultorOpen={consultor.open}
  onToggleConsultor={toggleConsultor}
  // ...
/>
```

- [ ] **Step 3: MessageInput** — abrir o painel a partir do composer:

```tsx
<MessageInput
  conversation={conversation}
  whatsappAccount={whatsappAccount}
  onSent={detail.refresh}
  draft={draft}
  onDraftChange={setDraft}
  onOpenPartLookup={openConsultor}
  // ...demais props...
/>
```

- [ ] **Step 4: Montar o painel** como irmão (após `<ConversationMediaPanel .../>`):

```tsx
<PartLookupPanel
  open={consultor.open}
  onOpenChange={consultor.setOpen}
  conversation={conversation}
  whatsappAccount={whatsappAccount}
  onInsertText={(text) => setDraft((prev) => appendToDraft(prev, text))}
/>
```

> `setDraft` precisa aceitar updater. Confirmar que `const [draft, setDraft] = useState("")` (é `useState`, então aceita função). Se `whatsappAccount` não estiver no escopo desta página com esse nome, usar a mesma variável já passada ao `MessageInput`.

- [ ] **Step 5: Build + teste manual**

Run: `bun run build && bun run test`
Expected: build ok; testes verdes.

Teste manual (dev server): abrir uma conversa, clicar em **Consultor** no header (ou "Consultar peça" no `＋`), buscar "filtro", abrir uma peça, alternar os 3 modelos pelo ícone do header, clicar **Inserir** (texto vai pro composer sem apagar rascunho) e **Enviar card**; confirmar que ficha/mídias/consultor nunca ficam abertos juntos; confirmar que Vendedor não vê o bloco de custo/margem.

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(conversations): mount part-lookup panel with mutually-exclusive rail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- Intenção consultar+agir → Tasks 10 (ações), 13 (container). ✅
- Rail não-modal exclusivo → Tasks 13 (aside sem overlay), 16 (coordenação). ✅
- 3 modelos + seletor S1 + localStorage → Tasks 11, 12, 6/4. ✅
- Busca por nome/SKU/OEM/ref + filtros → Task 7 (search via provider) + 9 (UI). Match por OEM/cross-ref é entregue pelo `search.ts` do catálogo usado por `useCatalogList`. ✅
- Ações Inserir(T1)/Enviar/Copiar + overflow → Tasks 2, 3, 10. ✅
- Custo/margem gated (Owner/Gestor) → Tasks 6 (hook), 10 (gate). ✅
- Estados (loading/vazio/erro/sem preço/estoque severidade) → Tasks 8, 2. ✅
- Sem backend, tokens semânticos, não tocar cache → respeitado (só catálogo + envio existente). ✅
- `/preco` inline → **deliberadamente fora** (fase 2), anotado no cabeçalho e na spec. ✅

**Placeholder scan:** As 3 "Notas" (barrel do catálogo, rota do catálogo, preservar lógica de `ficheButtonClick`) são verificações pontuais com fallback explícito, não trabalho em aberto. Sem TODOs de implementação.

**Type consistency:** `ICatalogListQuery` (`{ data, total, isLoading, isFetching, isError, refetch, invalidate }`) usado consistentemente (Task 7 expõe `list`, Task 13 usa `list.isLoading`/`list.isError`/`list.refetch`/`list.data`). `PartLookupLayout` idêntico entre Tasks 4/6/11/12. `onInsertText`/`buildPartInsertText`/`appendToDraft` batem entre Tasks 2/10/13/16. `useSendProductCard(conversation, whatsappAccount)` conforme assinatura real. `userRole === "Owner" | "Gestor"` conforme literais reais de `RoleName`.

**Riscos conhecidos:** (a) exports do barrel `@/features/catalog` — se ausentes, usar caminhos internos (já indicado); (b) path da rota do catálogo; (c) `resolvePriceTables` deriva de custo quando não há `priceTables` — em produção todas têm `price_tables`, então o caminho comum não expõe custo. Nenhum bloqueia a entrega.
