# Leads Multi-Funil — Plano 1 (Fases 1–2: Fundação e Modelo N:N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer o sistema de identidade visual por funil (tokens, sem hex) e o modelo de dados N:N lead↔funil com RLS, migração dos 957 leads e o 38º provider — sem nenhuma mudança visível na interface além do contraste correto.

**Architecture:** Fase 1 introduz 9 slots de cor (`funnel-0..8`) em `src/styles.css` seguindo o padrão já estabelecido da escala de severidade (constante nos 4 temas, variante `.dark`), erradica todo hex inline e paleta Tailwind crua da feature `leads`, e prepara a aposentadoria de `CLOSING_STAGE_ID` com o tipo `LeadFunnelStageKind`. Fase 2 cria 4 tabelas (`lead_funnels`, `lead_funnel_stages`, `lead_funnel_entries`, `lead_funnel_access`), a RLS que espelha a de `leads`, dois triggers (derivação no INSERT, sincronia no UPDATE), a migração que materializa o funil `Geral` a partir de `stores.settings->'pipelineStages'`, e o provider `leadFunnels` no Provider Pattern (mock + supabase).

**Tech Stack:** React 19 · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres + RLS) · TanStack Query · Vitest · bun

**Spec:** `docs/superpowers/specs/2026-07-23-leads-multi-funil-design.md`

**Worktree:** `.claude/worktrees/leads-multi-funil`, branch `feat/leads-multi-funil`. Todo comando roda a partir da raiz dessa worktree.

## Global Constraints

- **Componentes consomem APENAS tokens semânticos.** Nunca hex literal, nunca `--gallo-*` direto, nunca classe de paleta Tailwind crua (`bg-red-500`, `text-emerald-300`). Severidades via `text-/bg-/border-severity-{info|success|warning|critical}`.
- **Tailwind v4 não gera classe montada por template string.** `` `bg-funnel-${n}` `` produz CSS inexistente. Sempre mapa de literais.
- **O projeto não usa `noUncheckedIndexedAccess`.** Todo acesso a mapa indexado por valor vindo do banco precisa de fallback explícito (incidente 2026-07-18: `origin='import'` derrubou `/app/leads` com `undefined.tone`).
- **Comentários em inglês. UI em português do Brasil com acentuação correta** (nunca `nao`, `avaliacao`, `orcamento`).
- **Interfaces de domínio prefixadas com `I`.** `camelCase` em TS, `snake_case` no banco.
- **Toda migration aplicada via MCP Supabase deve ser espelhada em `supabase/migrations/` no mesmo PR.** Este plano cria apenas os arquivos versionados; a aplicação em produção é passo separado do dono.
- **Features nunca importam `@/mocks` nem `@/providers/data/impl/*`** — ESLint bloqueia. Tudo pelo barrel `@/providers/data`.
- **Commits em Conventional Commits, em inglês, atômicos.**
- `bun run test` = `vitest run`. Para um arquivo: `bun run test <caminho>`.
- `bun run build` **não** faz type-check. Type-check é `bunx tsc --noEmit`, e existe baseline de erros pré-existentes — avalie por delta nos arquivos que você criou.

---

# FASE 1 — Fundação

### Task 1: Slots de cor `funnel-0..8` e o engine de classes

Introduz o eixo cromático de funil como tokens semânticos, no mesmo padrão da escala de severidade (`styles.css:71` — "escala dedicada, constante nos 4 temas; tratamento tonal"), e o acesso null-safe a esse mapa.

**Files:**
- Modify: `src/styles.css` (camada 1 em `:root`, variante em `.dark`, camada 2 em `@theme inline`)
- Create: `src/shared/types/funnel.ts`
- Modify: `src/shared/types/index.ts`
- Create: `src/features/funnels/engine/accentClasses.ts`
- Test: `src/features/funnels/engine/accentClasses.test.ts`

**Interfaces:**
- Produces: `FunnelAccent` (`0|1|…|8`), `getAccentClasses(accent: number): IFunnelAccentClasses`, `IFunnelAccentClasses` com `{ dot, chip, border, bar, text }` — todas `string` de classes Tailwind.

- [ ] **Step 1: Criar o tipo do slot**

Criar `src/shared/types/funnel.ts`:

```ts
/**
 * Funnel identity slot. Persisted as a smallint, never as a hex string — the
 * user picks WHICH of the system's identities a funnel occupies, not a colour.
 * Slot 0 is the neutral one, reserved for the default triage funnel.
 */
export type FunnelAccent = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Lifecycle role of a stage inside its funnel. Retires CLOSING_STAGE_ID. */
export type LeadFunnelStageKind = "entrada" | "aberta" | "ganho" | "perda";
```

- [ ] **Step 2: Exportar pelo barrel**

Em `src/shared/types/index.ts`, adicionar na ordem alfabética das reexportações:

```ts
export type { FunnelAccent, LeadFunnelStageKind } from "./funnel";
```

- [ ] **Step 3: Escrever o teste do engine (falhando)**

Criar `src/features/funnels/engine/accentClasses.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getAccentClasses, FUNNEL_ACCENT_SLOTS } from "./accentClasses";

describe("getAccentClasses", () => {
  it("maps every declared slot", () => {
    for (const slot of FUNNEL_ACCENT_SLOTS) {
      const classes = getAccentClasses(slot);
      expect(classes.dot).toContain(`funnel-${slot}`);
      expect(classes.border).toContain(`funnel-${slot}`);
    }
  });

  it("never builds a class by template string", () => {
    // Tailwind v4 does not generate classes assembled at runtime; the map must
    // hold complete literals.
    expect(getAccentClasses(3).dot).toBe("bg-funnel-3");
  });

  // Regression: the 2026-07-18 incident, where origin='import' had no META
  // entry and took /app/leads down with `undefined.tone`. Accent comes from the
  // database and can hold a value this build does not know about.
  it("falls back to the neutral slot for an unknown accent", () => {
    expect(getAccentClasses(99)).toBe(getAccentClasses(0));
    expect(getAccentClasses(-1)).toBe(getAccentClasses(0));
    expect(getAccentClasses(Number.NaN)).toBe(getAccentClasses(0));
  });

  it("uses the muted token for the neutral slot chip", () => {
    expect(getAccentClasses(0).chip).toBe("bg-muted");
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `bun run test src/features/funnels/engine/accentClasses.test.ts`
Expected: FAIL — `Failed to resolve import "./accentClasses"`

- [ ] **Step 5: Implementar o engine**

Criar `src/features/funnels/engine/accentClasses.ts`:

```ts
import type { FunnelAccent } from "@/shared/types";

export interface IFunnelAccentClasses {
  /** Solid 8px dot — non-textual, needs 3:1. */
  dot: string;
  /** Soft background for a chip whose TEXT is `text-foreground`, never the accent. */
  chip: string;
  /** 1–3px border / indicator bar. */
  border: string;
  /** Vertical or horizontal indicator bar (active item in nav). */
  bar: string;
  /** Icon-only usage, always paired with a `text-foreground` label. */
  text: string;
}

export const FUNNEL_ACCENT_SLOTS: readonly FunnelAccent[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Literal class map. Tailwind v4 scans source for complete class names, so a
 * template-string class (`bg-funnel-${n}`) yields no CSS at all.
 */
const FUNNEL_CLASSES: Record<FunnelAccent, IFunnelAccentClasses> = {
  0: { dot: "bg-funnel-0", chip: "bg-muted",       border: "border-funnel-0", bar: "bg-funnel-0", text: "text-funnel-0" },
  1: { dot: "bg-funnel-1", chip: "bg-funnel-1/12", border: "border-funnel-1", bar: "bg-funnel-1", text: "text-funnel-1" },
  2: { dot: "bg-funnel-2", chip: "bg-funnel-2/12", border: "border-funnel-2", bar: "bg-funnel-2", text: "text-funnel-2" },
  3: { dot: "bg-funnel-3", chip: "bg-funnel-3/12", border: "border-funnel-3", bar: "bg-funnel-3", text: "text-funnel-3" },
  4: { dot: "bg-funnel-4", chip: "bg-funnel-4/12", border: "border-funnel-4", bar: "bg-funnel-4", text: "text-funnel-4" },
  5: { dot: "bg-funnel-5", chip: "bg-funnel-5/12", border: "border-funnel-5", bar: "bg-funnel-5", text: "text-funnel-5" },
  6: { dot: "bg-funnel-6", chip: "bg-funnel-6/12", border: "border-funnel-6", bar: "bg-funnel-6", text: "text-funnel-6" },
  7: { dot: "bg-funnel-7", chip: "bg-funnel-7/12", border: "border-funnel-7", bar: "bg-funnel-7", text: "text-funnel-7" },
  8: { dot: "bg-funnel-8", chip: "bg-funnel-8/12", border: "border-funnel-8", bar: "bg-funnel-8", text: "text-funnel-8" },
};

/**
 * Null-safe slot lookup. `accent` arrives from the database, from migrations and
 * from import scripts that this build's type system cannot police — an unknown
 * value must degrade to neutral, never render `undefined` into `cn()`.
 */
export function getAccentClasses(accent: number): IFunnelAccentClasses {
  return FUNNEL_CLASSES[accent as FunnelAccent] ?? FUNNEL_CLASSES[0];
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `bun run test src/features/funnels/engine/accentClasses.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 7: Declarar os primitivos no `:root`**

Em `src/styles.css`, logo após o bloco de severidade (que termina com `--gallo-sev-critical: #dc2626;`, por volta da linha 75), inserir:

```css
  /* Identidade de funil — escala dedicada (constante nos 4 temas; tratamento
     tonal, mesmo padrão da severidade). Slot 0 é o neutro, reservado ao funil
     de triagem. Usada SEMPRE em superfície não-textual (3:1), nunca como cor
     de texto que precise passar AA. */
  --gallo-funnel-0: #71717a;
  --gallo-funnel-1: #c8262c;
  --gallo-funnel-2: #b45309;
  --gallo-funnel-3: #1e7a3c;
  --gallo-funnel-4: #475569;
  --gallo-funnel-5: #7c3aed;
  --gallo-funnel-6: #0f766e;
  --gallo-funnel-7: #c2410c;
  --gallo-funnel-8: #a21caf;
```

- [ ] **Step 8: Declarar a variante dark**

No bloco `.dark` (linha ~199), logo após as severidades dark (que terminam com `--gallo-sev-critical: #f87171;`), inserir:

```css
  /* Identidade de funil — variante dark (paridade 3:1 sobre bg escuro) */
  --gallo-funnel-0: #a1a1aa;
  --gallo-funnel-1: #f87171;
  --gallo-funnel-2: #fbbf24;
  --gallo-funnel-3: #4ade80;
  --gallo-funnel-4: #94a3b8;
  --gallo-funnel-5: #a78bfa;
  --gallo-funnel-6: #2dd4bf;
  --gallo-funnel-7: #fb923c;
  --gallo-funnel-8: #e879f9;
```

- [ ] **Step 9: Mapear na camada 2**

Em `src/styles.css`, dentro de `@theme inline`, logo após as quatro linhas `--color-severity-*` (linha ~141), inserir:

```css
  --color-funnel-0: var(--gallo-funnel-0);
  --color-funnel-1: var(--gallo-funnel-1);
  --color-funnel-2: var(--gallo-funnel-2);
  --color-funnel-3: var(--gallo-funnel-3);
  --color-funnel-4: var(--gallo-funnel-4);
  --color-funnel-5: var(--gallo-funnel-5);
  --color-funnel-6: var(--gallo-funnel-6);
  --color-funnel-7: var(--gallo-funnel-7);
  --color-funnel-8: var(--gallo-funnel-8);
```

- [ ] **Step 10: Verificar que o build gera as classes**

Run: `bun run build`
Expected: build conclui sem erro. Em seguida confirme que as utilities existem:

Run: `grep -o "bg-funnel-[0-8]" dist/assets/*.css | sort -u | head`
Expected: lista com `bg-funnel-0` … `bg-funnel-8`. Se vier vazio, a classe não foi gerada — reveja o mapa de literais do Step 5.

- [ ] **Step 11: Commit**

```bash
git add src/styles.css src/shared/types/funnel.ts src/shared/types/index.ts src/features/funnels/engine/accentClasses.ts src/features/funnels/engine/accentClasses.test.ts
git commit -m "feat: add funnel identity colour slots as semantic tokens

Nine dedicated slots (funnel-0..8) following the severity scale pattern:
declared once in :root, overridden in .dark, constant across the four
themes. Funnel identity is its own axis, orthogonal to brand identity.

The slot lookup is null-safe: accent arrives from the database and can
hold a value this build does not know, which is the shape of the
2026-07-18 incident where origin='import' rendered undefined.tone."
```

---

### Task 2: Grade de contraste no `/design-system`

Torna a calibração dos 18 valores auditável com a ferramenta que o projeto já tem, em vez de confiar no olho.

**Files:**
- Modify: `src/routes/design-system.tsx`

**Interfaces:**
- Consumes: `FUNNEL_ACCENT_SLOTS`, `getAccentClasses` (Task 1)

- [ ] **Step 1: Localizar a seção de severidade da página**

Run: `grep -n "severity" src/routes/design-system.tsx | head`
Expected: linhas mostrando onde as severidades são renderizadas. A nova seção entra imediatamente depois.

- [ ] **Step 2: Adicionar a seção de slots de funil**

Inserir após a seção de severidade, dentro do mesmo container de seções:

```tsx
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Identidade de funil</h2>
        <p className="text-sm text-muted-foreground">
          Nove slots dedicados, constantes nos quatro temas, com variante para o modo escuro.
          Usados somente em superfície não-textual (ponto, borda, barra, fundo suave) — o nome do
          funil é sempre <code className="text-xs">text-foreground</code>. Alterne tema e modo no
          topo da página para conferir os dois modos.
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {FUNNEL_ACCENT_SLOTS.map((slot) => {
            const c = getAccentClasses(slot);
            return (
              <div
                key={slot}
                className={cn("flex flex-col items-center gap-2 rounded-md border p-3", c.border)}
              >
                <span className={cn("h-8 w-8 rounded-full", c.dot)} aria-hidden />
                <span className={cn("rounded px-2 py-0.5 text-xs text-foreground", c.chip)}>
                  Funil {slot}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {slot === 0 ? "neutro" : `slot ${slot}`}
                </span>
              </div>
            );
          })}
        </div>
      </section>
```

Adicionar os imports no topo do arquivo:

```tsx
import { FUNNEL_ACCENT_SLOTS, getAccentClasses } from "@/features/funnels/engine/accentClasses";
```

(`cn` já é importado pela página; confirme com `grep -n "import { cn }" src/routes/design-system.tsx`.)

- [ ] **Step 3: Conferir visualmente nos dois modos**

Run: `bun run dev`
Abra `http://localhost:5173/design-system`, role até "Identidade de funil".
Expected: 9 cartões. Alterne claro/escuro pelo seletor da página. **Cada ponto precisa ser claramente distinguível do fundo do cartão nos dois modos**, e o texto "Funil N" precisa estar legível sobre o chip.
Se algum slot ficar apagado demais no escuro ou lavado no claro, ajuste o hex correspondente no `styles.css` (Task 1, Steps 7–8) e recarregue. **É este o passo que calibra os 18 valores.**

- [ ] **Step 4: Commit**

```bash
git add src/routes/design-system.tsx
git commit -m "feat: add funnel accent grid to the design system page

Makes the 18 calibrated values (9 slots x 2 modes) auditable with the
contrast validator the page already hosts, instead of trusting the eye."
```

---

### Task 3: Erradicar a paleta Tailwind crua de `leadDisplay.ts`

Os metadados de temperatura, origem e próxima ação usam `sky-500`/`amber-500`/`red-500`/`emerald-500` com `dark:` manual, ignorando os quatro temas — no tema SERVICE (vermelho) o chip "quente" some no meio da UI.

**Files:**
- Modify: `src/features/leads/utils/leadDisplay.ts:15-29` (temperatura), `:38-70` (origem), `:110-140` (próxima ação)

**Interfaces:**
- Produces: `TEMPERATURE_META`, `ORIGIN_META`, `getOriginMeta`, `getNextActionInfo` — assinaturas **inalteradas**; muda apenas o conteúdo do campo `tone`.

- [ ] **Step 1: Trocar os tons de temperatura**

Em `src/features/leads/utils/leadDisplay.ts`, substituir os três `tone`/`dot` de `TEMPERATURE_META`:

```ts
export const TEMPERATURE_META: Record<LeadTemperature, ITemperatureMeta> = {
  frio: {
    label: LEADS_STRINGS.temperature.frio,
    icon: "mdi:snowflake",
    tone: "bg-severity-info/15 text-severity-info",
    dot: "bg-severity-info",
  },
  morno: {
    label: LEADS_STRINGS.temperature.morno,
    icon: "mdi:weather-partly-cloudy",
    tone: "bg-severity-warning/15 text-severity-warning",
    dot: "bg-severity-warning",
  },
  quente: {
    label: LEADS_STRINGS.temperature.quente,
    icon: "mdi:fire",
    tone: "bg-severity-critical/15 text-severity-critical",
    dot: "bg-severity-critical",
  },
};
```

- [ ] **Step 2: Trocar os tons de origem**

Substituir os `tone` de `ORIGIN_META`. Origem não é severidade — é categoria, então usa o eixo de funil e o neutro:

```ts
export const ORIGIN_META: Record<LeadOrigin, IOriginMeta> = {
  whatsapp: {
    label: LEADS_STRINGS.origin.whatsapp,
    icon: "mdi:whatsapp",
    tone: "bg-funnel-3/12 text-foreground",
  },
  ecommerce: {
    label: LEADS_STRINGS.origin.ecommerce,
    icon: "mdi:cart-outline",
    tone: "bg-funnel-5/12 text-foreground",
  },
  indicacao: {
    label: LEADS_STRINGS.origin.indicacao,
    icon: "mdi:account-multiple-outline",
    tone: "bg-funnel-2/12 text-foreground",
  },
  google: {
    label: LEADS_STRINGS.origin.google,
    icon: "mdi:google",
    tone: "bg-funnel-6/12 text-foreground",
  },
  outro: {
    label: LEADS_STRINGS.origin.outro,
    icon: "mdi:dots-horizontal",
    tone: "bg-muted text-muted-foreground",
  },
  // Funnel Frente 3: leads materialized from historical conversations/imports
  // (origin written by the migration script and the import Edge Functions).
  import: {
    label: LEADS_STRINGS.origin.import,
    icon: "mdi:database-import-outline",
    tone: "bg-muted text-muted-foreground",
  },
};
```

- [ ] **Step 3: Trocar os tons de próxima ação**

Nos quatro `return` de `getNextActionInfo`, substituir o campo `tone`:

- `overdue` → `tone: "bg-severity-critical/15 text-severity-critical",`
- `today` → `tone: "bg-severity-warning/15 text-severity-warning",`
- `tomorrow` → `tone: "bg-severity-success/15 text-severity-success",`
- `future` → `tone: "bg-severity-success/15 text-severity-success",`

- [ ] **Step 4: Confirmar que não sobrou paleta crua no arquivo**

Run: `grep -nE "(sky|amber|red|emerald|violet)-[0-9]{3}" src/features/leads/utils/leadDisplay.ts`
Expected: nenhuma saída.

- [ ] **Step 5: Rodar a suíte**

Run: `bun run test`
Expected: PASS. Os testes existentes de `leadDisplay` não asseguram strings de classe; se algum falhar, ele está acoplado a cor e precisa ser corrigido para asserir comportamento, não aparência.

- [ ] **Step 6: Commit**

```bash
git add src/features/leads/utils/leadDisplay.ts
git commit -m "refactor: replace raw Tailwind palette with semantic tokens in leadDisplay

Temperature and next-action now ride the severity scale; origin rides the
funnel identity axis. The previous sky/amber/red/emerald classes with
manual dark: variants ignored the four themes — the 'quente' chip was
invisible under the SERVICE theme."
```

---

### Task 4: Erradicar o hex inline dos componentes de lead

Quatro arquivos injetam `stage.color` (hex livre do banco) via `style={{}}`. Em dois deles a cor vira **cor de texto**, o que reprova WCAG AA sem correção possível — o `#5b6b7a` do seed rende ~2,5:1 no modo escuro.

**Files:**
- Create: `src/features/funnels/engine/legacyStageColor.ts`
- Test: `src/features/funnels/engine/legacyStageColor.test.ts`
- Modify: `src/features/leads/components/LeadCard.tsx:53-55,74,79`
- Modify: `src/features/leads/components/kanban/KanbanColumn.tsx:53-59`
- Modify: `src/features/leads/components/LeadsList.tsx:123-133`
- Modify: `src/features/leads/components/LeadProfileFiche.tsx:258-264`

**Interfaces:**
- Consumes: `getAccentClasses` (Task 1)
- Produces: `hexToAccentSlot(hex: string | undefined): FunnelAccent` — ponte temporária enquanto `IPipelineStage` ainda carrega `color`. Removida na Fase 2, quando a etapa passa a ter `accent`.

- [ ] **Step 1: Escrever o teste da ponte (falhando)**

Criar `src/features/funnels/engine/legacyStageColor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hexToAccentSlot } from "./legacyStageColor";

describe("hexToAccentSlot", () => {
  it("maps the seeded pipeline colours to distinct slots", () => {
    // The five colours seeded in SEED_PIPELINE_STAGES / the frontend fallback.
    const seeded = ["#5b6b7a", "#D2A809", "#337648", "#C79C2C", "#C4151C"];
    const slots = seeded.map(hexToAccentSlot);
    expect(new Set(slots).size).toBeGreaterThanOrEqual(4);
  });

  it("maps a red to the red slot and a green to the green slot", () => {
    expect(hexToAccentSlot("#C4151C")).toBe(1);
    expect(hexToAccentSlot("#337648")).toBe(3);
  });

  it("is case-insensitive and tolerates the leading hash being absent", () => {
    expect(hexToAccentSlot("c4151c")).toBe(hexToAccentSlot("#C4151C"));
  });

  it("falls back to neutral for undefined, empty or malformed input", () => {
    expect(hexToAccentSlot(undefined)).toBe(0);
    expect(hexToAccentSlot("")).toBe(0);
    expect(hexToAccentSlot("not-a-colour")).toBe(0);
    expect(hexToAccentSlot("#12")).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test src/features/funnels/engine/legacyStageColor.test.ts`
Expected: FAIL — `Failed to resolve import "./legacyStageColor"`

- [ ] **Step 3: Implementar a ponte**

Criar `src/features/funnels/engine/legacyStageColor.ts`:

```ts
import type { FunnelAccent } from "@/shared/types";

/**
 * Temporary bridge from the legacy free-form `IPipelineStage.color` hex to a
 * funnel accent slot, so components can stop injecting `style={{ color }}`
 * before the stage table (phase 2) gives every stage a real `accent`.
 *
 * Deleted once `lead_funnel_stages.accent` is the only source.
 */

/** Reference hue per slot, in degrees. Slot 0 is achromatic by definition. */
const SLOT_HUES: ReadonlyArray<{ slot: FunnelAccent; hue: number }> = [
  { slot: 1, hue: 0 },   // red
  { slot: 7, hue: 25 },  // orange
  { slot: 2, hue: 40 },  // amber
  { slot: 3, hue: 140 }, // green
  { slot: 6, hue: 175 }, // teal
  { slot: 4, hue: 215 }, // steel blue
  { slot: 5, hue: 265 }, // violet
  { slot: 8, hue: 300 }, // magenta
];

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function hexToAccentSlot(hex: string | undefined): FunnelAccent {
  if (!hex) return 0;
  const match = HEX_RE.exec(hex.trim());
  if (!match) return 0;

  const int = Number.parseInt(match[1], 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Near-achromatic colours (the seeded #5b6b7a steel included) land on neutral
  // only when they are genuinely grey; a desaturated blue still reads as blue.
  if (delta < 0.06) return 0;

  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;

  let best = SLOT_HUES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of SLOT_HUES) {
    const raw = Math.abs(hue - candidate.hue);
    const distance = Math.min(raw, 360 - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best.slot;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/funnels/engine/legacyStageColor.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 5: Remover o hex do `LeadCard`**

Em `src/features/leads/components/LeadCard.tsx`:

Apagar o bloco `cardStyle` (linhas 53-55):

```ts
  const cardStyle: CSSProperties = {
    borderLeftColor: lead.stage.color,
  };
```

Apagar `style={cardStyle}` da linha 79, e remover `border-l-[3px]` do `className` (linha 74) — a coluna já declara a etapa no topo, então a borda esquerda é redundante e era o único motivo do hex.

Remover o import agora órfão de `CSSProperties` na linha 1:

```ts
import type { DragEvent } from "react";
```

- [ ] **Step 6: Remover o hex do `KanbanColumn`**

Em `src/features/leads/components/kanban/KanbanColumn.tsx`, substituir o `<header>` (linhas 53-60):

```tsx
      <header
        className={cn(
          "flex items-center justify-between gap-2 rounded-t-lg border-b border-t-[3px] border-border px-3 py-2",
          getAccentClasses(hexToAccentSlot(stage.color)).border,
        )}
      >
```

Adicionar os imports:

```tsx
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import { hexToAccentSlot } from "@/features/funnels/engine/legacyStageColor";
```

Atenção: `getAccentClasses(...).border` traz `border-funnel-N`, que colore **todas** as bordas do elemento. Como a `<header>` declara `border-b` e `border-t-[3px]` e nenhuma outra, o efeito visível é a faixa superior — idêntico ao atual.

- [ ] **Step 7: Remover o hex do `LeadsList`**

Em `src/features/leads/components/LeadsList.tsx`, substituir o `<span>` do estágio (linhas ~123-133) por:

```tsx
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-foreground",
                      getAccentClasses(hexToAccentSlot(lead.stage.color)).border,
                    )}
                  >
                    {lead.stage.name}
                  </span>
```

O nome do estágio passa a ser `text-foreground`. Era este o pior dos quatro casos: a cor do banco era a cor do texto.

Adicionar os mesmos dois imports do Step 6, e `cn` se ainda não estiver importado (`grep -n "import { cn }" src/features/leads/components/LeadsList.tsx`).

- [ ] **Step 8: Remover o hex do `LeadProfileFiche`**

Em `src/features/leads/components/LeadProfileFiche.tsx`, substituir o badge de estágio (linhas ~259-264):

```tsx
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-foreground",
                  getAccentClasses(hexToAccentSlot(lead.stage.color)).border,
                )}
              >
                {lead.stage.name}
              </span>
```

Adicionar os dois imports do Step 6.

- [ ] **Step 9: Confirmar que não sobrou hex injetado na feature**

Run: `grep -rn "stage.color\|borderLeftColor\|backgroundColor: stage" src/features/leads/`
Expected: nenhuma saída. Se aparecer algo em `NewLeadModal` ou em componentes de `detail/`, aplique o mesmo tratamento (borda por slot + `text-foreground`).

- [ ] **Step 10: Verificar build e tipos**

Run: `bun run build && bunx tsc --noEmit 2>&1 | grep -E "features/(leads|funnels)"`
Expected: build conclui; nenhum erro de tipo nos arquivos tocados (o baseline pré-existente de `tsc` pode reportar outros arquivos — ignore os que você não tocou).

- [ ] **Step 11: Conferir na tela**

Run: `bun run dev`
Abra `/app/leads` no modo escuro e no claro.
Expected: cabeçalhos de coluna com faixa colorida no topo; cards sem borda esquerda colorida; nome do estágio legível na lista e na ficha. **Nenhum texto colorido de baixo contraste.**

- [ ] **Step 12: Commit**

```bash
git add src/features/funnels/engine/legacyStageColor.ts src/features/funnels/engine/legacyStageColor.test.ts src/features/leads/components/
git commit -m "refactor: drop inline hex from lead components

Four components injected IPipelineStage.color — a free-form hex from the
database — through style={{}}. In LeadsList and LeadProfileFiche it was
the TEXT colour, and the seeded #5b6b7a scores ~2.5:1 on the dark card:
a WCAG AA failure with no possible fix at the component level.

Stage colour now resolves to a funnel accent slot through a temporary
bridge, and stage names render as text-foreground. The bridge dies in
phase 2, when stages carry a real accent."
```

---

### Task 5: Preparar a aposentadoria de `CLOSING_STAGE_ID`

A etapa terminal é identificada por um id literal (`"stage-fechado"`), o que impede que cada funil tenha o seu fechamento. Esta task introduz o predicado que a Fase 2 vai passar a alimentar por `kind`, sem alterar o comportamento atual.

**Files:**
- Create: `src/features/funnels/engine/stageKind.ts`
- Test: `src/features/funnels/engine/stageKind.test.ts`
- Modify: `src/features/leads/utils/leadDisplay.ts:157-165`

**Interfaces:**
- Consumes: `LeadFunnelStageKind` (Task 1)
- Produces: `isClosingKind(kind)`, `resolveStageKind(stage)` — aceita `{ kind?: LeadFunnelStageKind; id: string }` e devolve o `kind` explícito quando existe, caindo para a heurística do id legado.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/features/funnels/engine/stageKind.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isClosingKind, resolveStageKind } from "./stageKind";

describe("resolveStageKind", () => {
  it("trusts an explicit kind over the legacy id", () => {
    expect(resolveStageKind({ id: "stage-fechado", kind: "aberta" })).toBe("aberta");
    expect(resolveStageKind({ id: "stage-novo", kind: "ganho" })).toBe("ganho");
  });

  it("falls back to the legacy closing id when kind is absent", () => {
    expect(resolveStageKind({ id: "stage-fechado" })).toBe("ganho");
  });

  it("treats any other legacy id as an open stage", () => {
    expect(resolveStageKind({ id: "stage-novo" })).toBe("aberta");
    expect(resolveStageKind({ id: "stage-negociacao" })).toBe("aberta");
  });
});

describe("isClosingKind", () => {
  it("is true for both terminal outcomes", () => {
    expect(isClosingKind("ganho")).toBe(true);
    expect(isClosingKind("perda")).toBe(true);
  });

  it("is false for entry and open stages", () => {
    expect(isClosingKind("entrada")).toBe(false);
    expect(isClosingKind("aberta")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test src/features/funnels/engine/stageKind.test.ts`
Expected: FAIL — `Failed to resolve import "./stageKind"`

- [ ] **Step 3: Implementar**

Criar `src/features/funnels/engine/stageKind.ts`:

```ts
import type { LeadFunnelStageKind } from "@/shared/types";

/**
 * Legacy terminal stage id, seeded before stages carried a lifecycle role.
 * Only consulted when a stage has no explicit `kind` — i.e. until the phase 2
 * migration lands. Mirrors CLOSING_STAGE_ID in features/leads/utils/leadDisplay.
 */
const LEGACY_CLOSING_STAGE_ID = "stage-fechado";

export interface IStageKindInput {
  id: string;
  kind?: LeadFunnelStageKind;
}

/**
 * The lifecycle role of a stage. Prefers the explicit `kind`; falls back to the
 * legacy id heuristic so this predicate can replace every CLOSING_STAGE_ID
 * comparison today, before the new stage table exists.
 *
 * The legacy closing stage conflated both outcomes, so it resolves to 'ganho' —
 * lost leads were already distinguished by `lossReason`, never by the stage.
 */
export function resolveStageKind(stage: IStageKindInput): LeadFunnelStageKind {
  if (stage.kind) return stage.kind;
  return stage.id === LEGACY_CLOSING_STAGE_ID ? "ganho" : "aberta";
}

/** Terminal stages — reaching one closes the lead's participation in the funnel. */
export function isClosingKind(kind: LeadFunnelStageKind): boolean {
  return kind === "ganho" || kind === "perda";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/funnels/engine/stageKind.test.ts`
Expected: PASS — 5 testes

- [ ] **Step 5: Fazer `isClosedLead` usar o predicado**

Em `src/features/leads/utils/leadDisplay.ts`, na função que hoje compara com `CLOSING_STAGE_ID` (linha ~161), substituir a comparação:

```ts
  return (
    isClosingKind(resolveStageKind(lead.stage)) ||
    lead.convertedToCustomerId !== undefined ||
    lead.lossReason !== undefined
  );
```

Adicionar o import no topo:

```ts
import { isClosingKind, resolveStageKind } from "@/features/funnels/engine/stageKind";
```

**Não** remover `CLOSING_STAGE_ID` ainda — `LeadsKanban.tsx:88`, `leadMetrics.ts:43`, `ConvertLeadModal` e `MarkAsLostModal` ainda o consomem, e migram na Fase 4. A constante segue exportada.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `bun run test`
Expected: PASS. Comportamento idêntico ao anterior — `resolveStageKind` sem `kind` devolve `ganho` exatamente para `stage-fechado`.

- [ ] **Step 7: Commit**

```bash
git add src/features/funnels/engine/stageKind.ts src/features/funnels/engine/stageKind.test.ts src/features/leads/utils/leadDisplay.ts
git commit -m "feat: add stage kind predicate ahead of per-funnel closing stages

The terminal stage is identified by a literal id, which cannot survive
funnels owning their own stages. resolveStageKind prefers an explicit
kind and falls back to the legacy id, so call sites can migrate one at a
time without a behaviour change. CLOSING_STAGE_ID stays exported — four
call sites still read it and move in phase 4."
```

---

# FASE 2 — Modelo N:N

### Task 6: Migration — tabelas, índices e obrigatoriedade das etapas terminais

**Files:**
- Create: `supabase/migrations/20260723120000_lead_funnels_schema.sql`

**Interfaces:**
- Produces: tabelas `lead_funnels`, `lead_funnel_stages`, `lead_funnel_entries`, `lead_funnel_access`; enum `lead_funnel_stage_kind`; função `assert_funnel_has_terminal_stages()`.

- [ ] **Step 1: Escrever o DDL**

Criar `supabase/migrations/20260723120000_lead_funnels_schema.sql`:

```sql
-- Multi-funnel model for leads (spec 2026-07-23-leads-multi-funil-design.md).
-- A lead participates in N funnels, with an independent stage in each.

create type public.lead_funnel_stage_kind as enum ('entrada','aberta','ganho','perda');

create table public.lead_funnels (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  name         text not null,
  description  text,
  accent       smallint not null default 0 check (accent between 0 and 8),
  icon         text not null default 'mdi:filter-variant',
  position     int  not null default 0,
  is_default   boolean not null default false,
  open_to_store boolean not null default false,
  entry_alert_threshold int not null default 50 check (entry_alert_threshold > 0),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index lead_funnels_one_default_per_store
  on public.lead_funnels (store_id) where is_default and archived_at is null;
create unique index lead_funnels_unique_name
  on public.lead_funnels (store_id, lower(name)) where archived_at is null;
create index lead_funnels_store_position_idx
  on public.lead_funnels (store_id, position) where archived_at is null;

create table public.lead_funnel_stages (
  id         uuid primary key default gen_random_uuid(),
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  name       text not null check (char_length(name) <= 24),
  accent     smallint not null default 0 check (accent between 0 and 8),
  position   int  not null default 0,
  kind       public.lead_funnel_stage_kind not null default 'aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- target of the composite FK below
  unique (id, funnel_id)
);

create unique index lead_funnel_stages_one_entrada on public.lead_funnel_stages (funnel_id) where kind = 'entrada';
create unique index lead_funnel_stages_one_ganho   on public.lead_funnel_stages (funnel_id) where kind = 'ganho';
create unique index lead_funnel_stages_one_perda   on public.lead_funnel_stages (funnel_id) where kind = 'perda';
create unique index lead_funnel_stages_unique_name on public.lead_funnel_stages (funnel_id, lower(name));

create table public.lead_funnel_entries (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  stage_id   uuid not null,

  -- A membership must never point at a stage belonging to another funnel: the
  -- board would render a card with no matching column.
  constraint lead_funnel_entries_stage_belongs_to_funnel
    foreign key (funnel_id, stage_id)
    references public.lead_funnel_stages (funnel_id, id),

  -- Denormalised for cheap RLS; DERIVED by trigger, never taken from the client.
  store_id   uuid not null,
  seller_id  uuid,

  -- Value of the opportunity IN THIS FUNNEL. Inherited from the lead on
  -- creation. Without it the forecast would count one opportunity N times.
  estimated_value numeric,

  converted_to_customer_id uuid references public.customers(id),
  loss_reason text,
  loss_notes  text,

  entered_stage_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index lead_funnel_entries_unique on public.lead_funnel_entries (lead_id, funnel_id);
create index lead_funnel_entries_board_idx on public.lead_funnel_entries (funnel_id, stage_id, seller_id);
create index lead_funnel_entries_lead_idx  on public.lead_funnel_entries (lead_id);
create index lead_funnel_entries_owner_idx on public.lead_funnel_entries (store_id, seller_id);

create table public.lead_funnel_access (
  funnel_id  uuid not null references public.lead_funnels(id) on delete cascade,
  seller_id  uuid not null references public.sellers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (funnel_id, seller_id)
);

create index lead_funnel_access_seller_idx on public.lead_funnel_access (seller_id);

-- A partial unique index enforces "at most one" of each terminal kind, never
-- "exactly one". This deferred constraint trigger closes that gap, and being
-- deferred lets replaceStages reorder without tripping mid-transaction.
create or replace function public.assert_funnel_has_terminal_stages()
returns trigger language plpgsql as $$
declare
  target_funnel uuid := coalesce(new.funnel_id, old.funnel_id);
  missing text;
begin
  -- The funnel may have been dropped in this same transaction.
  if not exists (select 1 from public.lead_funnels where id = target_funnel) then
    return null;
  end if;

  select string_agg(k::text, ', ')
    into missing
    from unnest(array['entrada','ganho','perda']::public.lead_funnel_stage_kind[]) as k
   where not exists (
     select 1 from public.lead_funnel_stages s
      where s.funnel_id = target_funnel and s.kind = k
   );

  if missing is not null then
    raise exception 'funnel % is missing required stage kind(s): %', target_funnel, missing;
  end if;
  return null;
end $$;

create constraint trigger lead_funnel_stages_require_terminals
  after insert or update or delete on public.lead_funnel_stages
  deferrable initially deferred
  for each row execute function public.assert_funnel_has_terminal_stages();

comment on table public.lead_funnel_entries is
  'Lead participation in a funnel. estimated_value lives here, not on the lead: a lead in two funnels is two distinct revenues.';
```

- [ ] **Step 2: Verificar a sintaxe do SQL**

Se houver Postgres local disponível:
Run: `psql "$SUPABASE_DB_URL" -f supabase/migrations/20260723120000_lead_funnels_schema.sql --dry-run 2>&1 | head`

Sem Postgres local, verifique manualmente: cada `create table` fecha com `);`, cada `$$` tem par, e os nomes de tabela referenciados (`stores`, `leads`, `customers`, `sellers`) existem.
Run: `grep -c "create table" supabase/migrations/20260723120000_lead_funnels_schema.sql`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260723120000_lead_funnels_schema.sql
git commit -m "feat(db): add multi-funnel schema

Four tables plus a stage-kind enum. Two constraints deserve note: the
composite FK (funnel_id, stage_id) makes it impossible to store a
membership whose stage belongs to another funnel, and a deferred
constraint trigger enforces that every funnel keeps one entry, one won
and one lost stage — a partial unique index only prevents the second."
```

---

### Task 7: Migration — RLS e triggers

**Files:**
- Create: `supabase/migrations/20260723121000_lead_funnels_rls.sql`

**Interfaces:**
- Consumes: tabelas da Task 6; helpers existentes `public.current_store_id()`, `public.current_seller_id()`, `public.is_staff()`
- Produces: funções `derive_lead_funnel_entry_owner()`, `sync_lead_funnel_entries_owner()`

- [ ] **Step 1: Confirmar as assinaturas dos helpers existentes**

Run: `grep -rn "function public.is_staff\|function public.current_seller_id\|function public.current_store_id" supabase/migrations/*.sql | head -3`
Expected: as três funções aparecem. Se algum nome divergir, use o nome real nas policies abaixo.

- [ ] **Step 2: Escrever RLS e triggers**

Criar `supabase/migrations/20260723121000_lead_funnels_rls.sql`:

```sql
-- RLS for the multi-funnel model. Membership visibility mirrors `leads` exactly;
-- the accessible-funnel filter is applied by the board query, NOT here, so a
-- seller never loses sight of their own lead just because it sits in a funnel
-- they cannot open.

alter table public.lead_funnels        enable row level security;
alter table public.lead_funnel_stages  enable row level security;
alter table public.lead_funnel_entries enable row level security;
alter table public.lead_funnel_access  enable row level security;

-- ---------- lead_funnels ----------
-- Reading that a funnel exists is not confidential; the leads inside it are.
-- Keeping SELECT open avoids a gated join for every label lookup.
create policy lead_funnels_select on public.lead_funnels
  for select to authenticated
  using (store_id = (select public.current_store_id()));

create policy lead_funnels_insert on public.lead_funnels
  for insert to authenticated
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy lead_funnels_update on public.lead_funnels
  for update to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy lead_funnels_delete on public.lead_funnels
  for delete to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));

-- ---------- lead_funnel_stages ----------
create policy lead_funnel_stages_select on public.lead_funnel_stages
  for select to authenticated
  using (exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ));

create policy lead_funnel_stages_write on public.lead_funnel_stages
  for all to authenticated
  using ((select public.is_staff()) and exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ))
  with check ((select public.is_staff()) and exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ));

-- ---------- lead_funnel_entries ----------
-- Same semantics as `leads`. store_id/seller_id are derived by trigger, so the
-- with check below is true by construction and cannot be forged.
create policy lead_funnel_entries_select on public.lead_funnel_entries
  for select to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

create policy lead_funnel_entries_insert on public.lead_funnel_entries
  for insert to authenticated
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

create policy lead_funnel_entries_update on public.lead_funnel_entries
  for update to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  )
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

create policy lead_funnel_entries_delete on public.lead_funnel_entries
  for delete to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

-- ---------- lead_funnel_access ----------
create policy lead_funnel_access_select on public.lead_funnel_access
  for select to authenticated
  using (seller_id = (select public.current_seller_id()) or (select public.is_staff()));

create policy lead_funnel_access_write on public.lead_funnel_access
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- ---------- triggers ----------
-- INSERT: derive owner and store from the lead itself. Without this a seller
-- could insert a membership over someone else's lead carrying their own
-- seller_id and still satisfy the with check.
create or replace function public.derive_lead_funnel_entry_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lead_store uuid;
  lead_seller uuid;
  lead_value numeric;
begin
  select l.store_id, l.seller_id, l.estimated_value
    into lead_store, lead_seller, lead_value
    from public.leads l where l.id = new.lead_id;

  if lead_store is null then
    raise exception 'lead % not found', new.lead_id;
  end if;

  new.store_id  := lead_store;
  new.seller_id := lead_seller;
  if new.estimated_value is null then
    new.estimated_value := lead_value;
  end if;
  return new;
end $$;

create trigger lead_funnel_entries_derive_owner
  before insert on public.lead_funnel_entries
  for each row execute function public.derive_lead_funnel_entry_owner();

-- UPDATE on leads: keep every membership in sync with the wallet.
create or replace function public.sync_lead_funnel_entries_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seller_id is distinct from old.seller_id
     or new.store_id is distinct from old.store_id then
    update public.lead_funnel_entries
       set seller_id = new.seller_id, store_id = new.store_id, updated_at = now()
     where lead_id = new.id;
  end if;
  return new;
end $$;

create trigger leads_sync_funnel_entries
  after update of seller_id, store_id on public.leads
  for each row execute function public.sync_lead_funnel_entries_owner();
```

- [ ] **Step 3: Conferir que toda tabela nova tem RLS**

Run: `grep -c "enable row level security" supabase/migrations/20260723121000_lead_funnels_rls.sql`
Expected: `4`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723121000_lead_funnels_rls.sql
git commit -m "feat(db): add multi-funnel RLS and ownership triggers

Membership reads mirror the leads policy exactly. The accessible-funnel
filter deliberately lives in the board query rather than the policy, so
the owner of a lead sitting in a funnel they cannot open still sees that
the lead exists.

The before-insert trigger derives store_id and seller_id from the lead,
closing the hole where a seller could forge a membership over someone
else's lead and still pass the with check."
```

---

### Task 8: Migration — dados: funil `Geral`, etapas e participações

**Files:**
- Create: `supabase/migrations/20260723122000_lead_funnels_backfill.sql`

**Interfaces:**
- Consumes: Tasks 6 e 7
- Produces: um funil `Geral` por loja com as três etapas terminais; uma participação por lead existente

- [ ] **Step 1: Inspecionar os dados de origem**

Run: `grep -rn "SEED_PIPELINE_STAGES" src/mocks/data/seedPipelineStages.ts | head -3`
Depois abra o arquivo para ver a forma de cada estágio (`id`, `name`, `order`, `color`). O jsonb em `stores.settings->'pipelineStages'` tem a mesma forma.

- [ ] **Step 2: Escrever a migration de dados**

Criar `supabase/migrations/20260723122000_lead_funnels_backfill.sql`:

```sql
-- Backfill: materialise the default "Geral" triage funnel per store from
-- stores.settings->'pipelineStages', then give every existing lead exactly one
-- membership. Idempotent: re-running is a no-op.

do $$
declare
  store_row record;
  funnel uuid;
  stage_json jsonb;
  stage_count int;
  closing_seen boolean;
  next_position int;
  won_stage uuid;
  lost_stage uuid;
  entry_stage uuid;
  last_open_stage uuid;
begin
  for store_row in select id, settings from public.stores loop

    -- Already migrated?
    select id into funnel from public.lead_funnels
     where store_id = store_row.id and is_default limit 1;
    if funnel is not null then
      continue;
    end if;

    insert into public.lead_funnels
      (store_id, name, description, accent, icon, position, is_default, open_to_store)
    values
      (store_row.id, 'Geral', 'Todo lead novo entra aqui até ser direcionado.',
       0, 'mdi:inbox-outline', 0, true, true)
    returning id into funnel;

    next_position := 0;
    closing_seen := false;
    entry_stage := null;
    last_open_stage := null;

    -- Legacy stages, in order. The terminal one is identified by NAME, not by a
    -- literal id: 'stage-fechado' comes from the frontend fallback and may not
    -- exist in a given store's settings.
    for stage_json in
      select value from jsonb_array_elements(
        coalesce(store_row.settings->'pipelineStages', '[]'::jsonb)
      ) order by (value->>'order')::int
    loop
      if lower(stage_json->>'name') ~ '(fechad|convertid|perdid)' then
        closing_seen := true;
        -- The legacy stage conflated both outcomes; split it in two.
        insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
        values (funnel, 'Convertido', 3, next_position, 'ganho') returning id into won_stage;
        next_position := next_position + 1;
        insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
        values (funnel, 'Perdido', 1, next_position, 'perda') returning id into lost_stage;
        next_position := next_position + 1;
      else
        insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
        values (
          funnel,
          left(stage_json->>'name', 24),
          0,
          next_position,
          case when entry_stage is null then 'entrada' else 'aberta' end
        )
        returning id into last_open_stage;
        if entry_stage is null then
          entry_stage := last_open_stage;
          last_open_stage := null;
        end if;
        next_position := next_position + 1;
      end if;
    end loop;

    -- Store with no configured pipeline, or one whose stages were all terminal.
    if entry_stage is null then
      insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
      values (funnel, 'Novo', 0, next_position, 'entrada') returning id into entry_stage;
      next_position := next_position + 1;
    end if;

    if not closing_seen then
      insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
      values (funnel, 'Convertido', 3, next_position, 'ganho') returning id into won_stage;
      next_position := next_position + 1;
      insert into public.lead_funnel_stages (funnel_id, name, accent, position, kind)
      values (funnel, 'Perdido', 1, next_position, 'perda') returning id into lost_stage;
    end if;

    -- Fail loud rather than leave a funnel that leads can enter but never close.
    if won_stage is null or lost_stage is null or entry_stage is null then
      raise exception 'store % ended with an incomplete funnel', store_row.id;
    end if;

    -- One membership per lead. Destination:
    --   converted            -> won
    --   has a loss reason    -> lost
    --   otherwise            -> the stage matching its legacy snapshot, or the
    --                           entry stage when no name matches.
    -- A lead parked on the legacy closing stage with NEITHER outcome lands on
    -- the last open stage, never on 'lost': inventing a loss would poison the
    -- historical conversion rate.
    insert into public.lead_funnel_entries
      (lead_id, funnel_id, stage_id, store_id, seller_id, estimated_value,
       converted_to_customer_id, loss_reason, loss_notes, entered_stage_at)
    select
      l.id,
      funnel,
      case
        when l.converted_to_customer_id is not null then won_stage
        when l.loss_reason is not null then lost_stage
        else coalesce(
          (select s.id from public.lead_funnel_stages s
            where s.funnel_id = funnel
              and lower(s.name) = lower(l.stage->>'name')
              and s.kind not in ('ganho','perda')
            limit 1),
          coalesce(last_open_stage, entry_stage)
        )
      end,
      l.store_id,
      l.seller_id,
      l.estimated_value,
      l.converted_to_customer_id,
      l.loss_reason,
      l.loss_notes,
      l.updated_at
    from public.leads l
    where l.store_id = store_row.id
      and not exists (
        select 1 from public.lead_funnel_entries e
         where e.lead_id = l.id and e.funnel_id = funnel
      );

  end loop;

  -- Every lead must have landed somewhere.
  select count(*) into stage_count
    from public.leads l
   where not exists (select 1 from public.lead_funnel_entries e where e.lead_id = l.id);
  if stage_count > 0 then
    raise exception '% lead(s) ended with no funnel membership', stage_count;
  end if;
end $$;
```

**Nota sobre o trigger:** `derive_lead_funnel_entry_owner` sobrescreve `store_id`/`seller_id` no INSERT, então os valores selecionados do lead são redundantes — e idênticos. `estimated_value` explícito evita a segunda consulta ao lead.

- [ ] **Step 3: Conferir a idempotência**

Leia o SQL e confirme os dois guardas: `if funnel is not null then continue;` (loja já migrada) e o `not exists` no INSERT das participações. Rodar duas vezes deve produzir o mesmo estado.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723122000_lead_funnels_backfill.sql
git commit -m "feat(db): backfill the default funnel and one membership per lead

Materialises 'Geral' per store from stores.settings->'pipelineStages'.
The terminal stage is matched by NAME rather than the literal
'stage-fechado' id, which comes from a frontend fallback and may be
absent in production, and it is split into separate won and lost stages
because the legacy pipeline conflated both outcomes.

A lead parked on the closing stage with neither outcome lands on the last
open stage, never on lost: fabricating a loss would poison the historical
conversion rate. The block raises if any store ends with an incomplete
funnel or any lead with no membership."
```

---

### Task 9: Tipos de domínio do funil

**Files:**
- Modify: `src/shared/types/funnel.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/types/lead.ts:41,45`

**Interfaces:**
- Consumes: `FunnelAccent`, `LeadFunnelStageKind` (Task 1)
- Produces: `ILeadFunnel`, `ILeadFunnelStage`, `ILeadFunnelEntry`, `IFunnelBoardSummary`

- [ ] **Step 1: Estender `funnel.ts`**

Acrescentar a `src/shared/types/funnel.ts` (mantendo os dois tipos da Task 1):

```ts
import type { ID, ISO8601, Money } from "./common";

export interface ILeadFunnel {
  id: ID;
  storeId: ID;
  name: string;
  description?: string;
  accent: FunnelAccent;
  /** Iconify id. Mandatory: the icon, not the colour, carries the meaning. */
  icon: string;
  position: number;
  /** The store's triage funnel. Immutable in v1: unrestricted, unarchivable. */
  isDefault: boolean;
  /** Shortcut: every seller in the store reaches this funnel. */
  openToStore: boolean;
  /** Entry-stage count above which the column switches to triage mode. */
  entryAlertThreshold: number;
  archivedAt?: ISO8601;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface ILeadFunnelStage {
  id: ID;
  funnelId: ID;
  /** Max 24 chars — longer names break the kanban column header. */
  name: string;
  accent: FunnelAccent;
  position: number;
  kind: LeadFunnelStageKind;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/**
 * A lead's participation in one funnel. This — not the lead — owns the stage,
 * the outcome and the estimated value: a lead in two funnels is two distinct
 * opportunities, and counting the lead's single value twice would inflate the
 * forecast.
 */
export interface ILeadFunnelEntry {
  id: ID;
  leadId: ID;
  funnelId: ID;
  stageId: ID;
  storeId: ID;
  sellerId: ID | null;
  estimatedValue?: Money;
  convertedToCustomerId?: ID;
  lossReason?: string;
  lossNotes?: string;
  /** Real "days in stage", per funnel — not derived from the lead's updatedAt. */
  enteredStageAt: ISO8601;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** Per-stage aggregate for the column header. Computed server-side. */
export interface IFunnelBoardSummary {
  stageId: ID;
  count: number;
  sumValue: Money;
  overdueCount: number;
}
```

- [ ] **Step 2: Exportar pelo barrel**

Em `src/shared/types/index.ts`, ampliar a linha da Task 1:

```ts
export type {
  FunnelAccent,
  LeadFunnelStageKind,
  ILeadFunnel,
  ILeadFunnelStage,
  ILeadFunnelEntry,
  IFunnelBoardSummary,
} from "./funnel";
```

- [ ] **Step 3: Marcar os campos legados do lead**

Em `src/shared/types/lead.ts`, acrescentar o aviso sobre os dois campos (sem removê-los — a Fase 4 é que troca os consumidores):

Sobre `stage: ILeadStage;` (linha ~41):

```ts
  /**
   * @deprecated Snapshot of the single-pipeline era. The truth now lives in
   * `lead_funnel_entries.stage_id`, one per funnel. Still written by legacy
   * call sites; removed once phase 4 migrates them.
   */
  stage: ILeadStage;
```

Sobre `estimatedValue?: Money;` (linha ~45):

```ts
  /**
   * @deprecated Aggregate/legacy value. The per-funnel value lives in
   * `ILeadFunnelEntry.estimatedValue` — a lead in two funnels is two distinct
   * revenues, and reading this one per membership double-counts the forecast.
   */
  estimatedValue?: Money;
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -E "shared/types|features/funnels"`
Expected: nenhum erro nesses caminhos. `@deprecated` não quebra build — só sinaliza no editor.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/funnel.ts src/shared/types/index.ts src/shared/types/lead.ts
git commit -m "feat: add funnel domain types

ILeadFunnelEntry owns stage, outcome and estimated value. Marks
ILead.stage and ILead.estimatedValue as deprecated: the first is a
single-pipeline snapshot, the second would double-count revenue once a
lead lives in two funnels."
```

---

### Task 10: Engine `membershipRules`

**Files:**
- Create: `src/features/funnels/engine/membershipRules.ts`
- Test: `src/features/funnels/engine/membershipRules.test.ts`

**Interfaces:**
- Consumes: `ILeadFunnel`, `ILeadFunnelStage`, `ILeadFunnelEntry` (Task 9)
- Produces: `planAddToFunnel(input)`, `planRemoveFromFunnel(input)` — funções puras que devolvem a intenção; quem persiste é o provider.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/features/funnels/engine/membershipRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { planAddToFunnel, planRemoveFromFunnel } from "./membershipRules";

function funnel(id: string, over: Partial<ILeadFunnel> = {}): ILeadFunnel {
  return {
    id, storeId: "store-1", name: id, accent: 1, icon: "mdi:filter-variant",
    position: 0, isDefault: false, openToStore: false, entryAlertThreshold: 50,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
function stage(id: string, funnelId: string, over: Partial<ILeadFunnelStage> = {}): ILeadFunnelStage {
  return {
    id, funnelId, name: id, accent: 0, position: 0, kind: "aberta",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
function entry(funnelId: string, stageId: string, over: Partial<ILeadFunnelEntry> = {}): ILeadFunnelEntry {
  return {
    id: `e-${funnelId}`, leadId: "lead-1", funnelId, stageId, storeId: "store-1",
    sellerId: "seller-1", enteredStageAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}

const geral = funnel("geral", { isDefault: true, openToStore: true, accent: 0 });
const catalisador = funnel("catalisador");
const geralEntry = stage("geral-entrada", "geral", { kind: "entrada" });
const cataEntry = stage("cata-entrada", "catalisador", { kind: "entrada" });

describe("planAddToFunnel", () => {
  it("adds to the funnel's entry stage when no stage is given", () => {
    const plan = planAddToFunnel({
      existing: [entry("geral", "geral-entrada")],
      funnel: catalisador,
      stages: [cataEntry],
      leadEstimatedValue: 12400,
    });
    expect(plan.action).toBe("create");
    if (plan.action !== "create") throw new Error("unreachable");
    expect(plan.stageId).toBe("cata-entrada");
  });

  it("inherits the lead's estimated value on the new membership", () => {
    const plan = planAddToFunnel({
      existing: [], funnel: catalisador, stages: [cataEntry], leadEstimatedValue: 12400,
    });
    if (plan.action !== "create") throw new Error("unreachable");
    expect(plan.estimatedValue).toBe(12400);
  });

  it("is a no-op when the lead already participates in that funnel", () => {
    const plan = planAddToFunnel({
      existing: [entry("catalisador", "cata-entrada")],
      funnel: catalisador, stages: [cataEntry], leadEstimatedValue: 12400,
    });
    expect(plan.action).toBe("noop");
  });

  it("refuses a funnel with no entry stage", () => {
    const plan = planAddToFunnel({
      existing: [], funnel: catalisador, stages: [], leadEstimatedValue: undefined,
    });
    expect(plan.action).toBe("error");
  });
});

describe("planRemoveFromFunnel", () => {
  it("removes plainly when other memberships remain", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("geral", "geral-entrada"), entry("catalisador", "cata-entrada")],
      entryId: "e-catalisador",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    expect(plan.action).toBe("remove");
    if (plan.action !== "remove") throw new Error("unreachable");
    expect(plan.movedToDefault).toBe(false);
  });

  // A lead with zero memberships would vanish from the entire UI without a trace.
  it("re-adds to the default funnel when removing the last membership", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("catalisador", "cata-entrada")],
      entryId: "e-catalisador",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    if (plan.action !== "remove") throw new Error("unreachable");
    expect(plan.movedToDefault).toBe(true);
    expect(plan.recreateInFunnelId).toBe("geral");
    expect(plan.recreateInStageId).toBe("geral-entrada");
  });

  it("is a no-op when the membership does not exist", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("geral", "geral-entrada")],
      entryId: "e-inexistente",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    expect(plan.action).toBe("noop");
  });

  it("does not re-add when the last membership IS the default funnel", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("geral", "geral-entrada")],
      entryId: "e-geral",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    expect(plan.action).toBe("error");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test src/features/funnels/engine/membershipRules.test.ts`
Expected: FAIL — `Failed to resolve import "./membershipRules"`

- [ ] **Step 3: Implementar**

Criar `src/features/funnels/engine/membershipRules.ts`:

```ts
import type { ID, ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage, Money } from "@/shared/types";

export type AddPlan =
  | { action: "create"; funnelId: ID; stageId: ID; estimatedValue?: Money }
  | { action: "noop"; reason: "already_member" }
  | { action: "error"; reason: "no_entry_stage" };

export type RemovePlan =
  | {
      action: "remove";
      entryId: ID;
      movedToDefault: boolean;
      recreateInFunnelId?: ID;
      recreateInStageId?: ID;
    }
  | { action: "noop"; reason: "not_a_member" }
  | { action: "error"; reason: "cannot_leave_default_alone" };

export interface IAddInput {
  existing: ILeadFunnelEntry[];
  funnel: ILeadFunnel;
  stages: ILeadFunnelStage[];
  leadEstimatedValue: Money | undefined;
  /** Explicit target stage; defaults to the funnel's entry stage. */
  stageId?: ID;
}

export function planAddToFunnel(input: IAddInput): AddPlan {
  if (input.existing.some((e) => e.funnelId === input.funnel.id)) {
    return { action: "noop", reason: "already_member" };
  }

  const target =
    (input.stageId && input.stages.find((s) => s.id === input.stageId)) ??
    input.stages.find((s) => s.kind === "entrada");

  if (!target) return { action: "error", reason: "no_entry_stage" };

  return {
    action: "create",
    funnelId: input.funnel.id,
    stageId: target.id,
    estimatedValue: input.leadEstimatedValue,
  };
}

export interface IRemoveInput {
  existing: ILeadFunnelEntry[];
  entryId: ID;
  defaultFunnel: ILeadFunnel;
  defaultFunnelStages: ILeadFunnelStage[];
}

/**
 * A lead must never end up with zero memberships — it would disappear from every
 * board and list with no trace. Removing the last one re-adds it to the default
 * funnel instead.
 */
export function planRemoveFromFunnel(input: IRemoveInput): RemovePlan {
  const target = input.existing.find((e) => e.id === input.entryId);
  if (!target) return { action: "noop", reason: "not_a_member" };

  const remaining = input.existing.filter((e) => e.id !== input.entryId);
  if (remaining.length > 0) {
    return { action: "remove", entryId: input.entryId, movedToDefault: false };
  }

  // Removing the last membership when it already IS the default funnel would
  // loop: there is nowhere further to fall back to.
  if (target.funnelId === input.defaultFunnel.id) {
    return { action: "error", reason: "cannot_leave_default_alone" };
  }

  const entryStage = input.defaultFunnelStages.find((s) => s.kind === "entrada");
  if (!entryStage) return { action: "error", reason: "cannot_leave_default_alone" };

  return {
    action: "remove",
    entryId: input.entryId,
    movedToDefault: true,
    recreateInFunnelId: input.defaultFunnel.id,
    recreateInStageId: entryStage.id,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/funnels/engine/membershipRules.test.ts`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit**

```bash
git add src/features/funnels/engine/membershipRules.ts src/features/funnels/engine/membershipRules.test.ts
git commit -m "feat: add membership rules engine

Pure planning functions for adding to and removing from a funnel. The
load-bearing rule: removing a lead's last membership re-adds it to the
default funnel, because a lead with zero memberships would vanish from
every board and list without a trace."
```

---

### Task 11: Engine `accessibleFunnels`

**Files:**
- Create: `src/features/funnels/engine/accessibleFunnels.ts`
- Test: `src/features/funnels/engine/accessibleFunnels.test.ts`

**Interfaces:**
- Consumes: `ILeadFunnel` (Task 9)
- Produces: `resolveAccessibleFunnels(input): ILeadFunnel[]`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/features/funnels/engine/accessibleFunnels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ILeadFunnel } from "@/shared/types";
import { resolveAccessibleFunnels } from "./accessibleFunnels";

function funnel(id: string, over: Partial<ILeadFunnel> = {}): ILeadFunnel {
  return {
    id, storeId: "store-1", name: id, accent: 1, icon: "mdi:filter-variant",
    position: 0, isDefault: false, openToStore: false, entryAlertThreshold: 50,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}

const geral = funnel("geral", { isDefault: true, openToStore: true, position: 0 });
const catalisador = funnel("catalisador", { position: 1 });
const filtros = funnel("filtros", { position: 2 });
const modulos = funnel("modulos", { position: 3 });
const arquivado = funnel("antigo", { position: 4, archivedAt: "2026-05-01T00:00:00.000Z" });

const all = [geral, catalisador, filtros, modulos, arquivado];

describe("resolveAccessibleFunnels", () => {
  it("gives staff every active funnel", () => {
    const r = resolveAccessibleFunnels({ funnels: all, grantedFunnelIds: [], isStaff: true });
    expect(r.map((f) => f.id)).toEqual(["geral", "catalisador", "filtros", "modulos"]);
  });

  it("gives a seller the funnels they were granted", () => {
    const r = resolveAccessibleFunnels({
      funnels: all, grantedFunnelIds: ["catalisador", "filtros"], isStaff: false,
    });
    expect(r.map((f) => f.id)).toEqual(["geral", "catalisador", "filtros"]);
  });

  // Without this, every non-staff user lands on "no funnel access" on deploy
  // day: the backfill grants nobody explicitly.
  it("always includes the default funnel, even with no grant at all", () => {
    const r = resolveAccessibleFunnels({ funnels: all, grantedFunnelIds: [], isStaff: false });
    expect(r.map((f) => f.id)).toEqual(["geral"]);
  });

  it("includes a funnel opened to the whole store without an explicit grant", () => {
    const open = funnel("balcao", { openToStore: true, position: 5 });
    const r = resolveAccessibleFunnels({
      funnels: [...all, open], grantedFunnelIds: [], isStaff: false,
    });
    expect(r.map((f) => f.id)).toContain("balcao");
  });

  it("never includes an archived funnel, not even for staff", () => {
    const r = resolveAccessibleFunnels({
      funnels: all, grantedFunnelIds: ["antigo"], isStaff: true,
    });
    expect(r.map((f) => f.id)).not.toContain("antigo");
  });

  it("returns them ordered by position", () => {
    const shuffled = [modulos, geral, filtros, catalisador];
    const r = resolveAccessibleFunnels({ funnels: shuffled, grantedFunnelIds: [], isStaff: true });
    expect(r.map((f) => f.position)).toEqual([0, 1, 2, 3]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test src/features/funnels/engine/accessibleFunnels.test.ts`
Expected: FAIL — `Failed to resolve import "./accessibleFunnels"`

- [ ] **Step 3: Implementar**

Criar `src/features/funnels/engine/accessibleFunnels.ts`:

```ts
import type { ID, ILeadFunnel } from "@/shared/types";

export interface IAccessibleFunnelsInput {
  funnels: ILeadFunnel[];
  /** Funnel ids explicitly granted to this seller (lead_funnel_access). */
  grantedFunnelIds: ID[];
  /** Owner and Gestor reach every funnel by role, never by grant. */
  isStaff: boolean;
}

/**
 * The funnels a user can open, ordered by position.
 *
 * The default funnel is ALWAYS reachable. It receives every new lead, it is
 * where triage happens and it is the fallback destination when a lead leaves
 * its last funnel — restricting it would lock the operation. It is also why the
 * backfill grants nobody explicitly: without this rule every non-staff user
 * would land on "no funnel access" on deploy day.
 *
 * Archived funnels are never returned, staff included: they are out of the
 * navigation by definition, and still present in reports.
 */
export function resolveAccessibleFunnels(input: IAccessibleFunnelsInput): ILeadFunnel[] {
  const granted = new Set(input.grantedFunnelIds);

  return input.funnels
    .filter((f) => !f.archivedAt)
    .filter((f) => input.isStaff || f.isDefault || f.openToStore || granted.has(f.id))
    .sort((a, b) => a.position - b.position);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/funnels/engine/accessibleFunnels.test.ts`
Expected: PASS — 6 testes

- [ ] **Step 5: Commit**

```bash
git add src/features/funnels/engine/accessibleFunnels.ts src/features/funnels/engine/accessibleFunnels.test.ts
git commit -m "feat: add accessible funnels engine

The default funnel is always reachable, which is what keeps the backfill
from locking every non-staff user out: it grants nobody explicitly.
Archived funnels are excluded for staff too — out of navigation by
definition, still present in reports."
```

---

### Task 12: Engine `stageTransition`

**Files:**
- Create: `src/features/funnels/engine/stageTransition.ts`
- Test: `src/features/funnels/engine/stageTransition.test.ts`

**Interfaces:**
- Consumes: `ILeadFunnelEntry`, `ILeadFunnelStage`, `isClosingKind` (Tasks 5 e 9)
- Produces: `planStageTransition(input): TransitionPlan`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/features/funnels/engine/stageTransition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { planStageTransition } from "./stageTransition";

function stage(id: string, kind: ILeadFunnelStage["kind"] = "aberta"): ILeadFunnelStage {
  return {
    id, funnelId: "catalisador", name: id, accent: 0, position: 0, kind,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
function entry(over: Partial<ILeadFunnelEntry> = {}): ILeadFunnelEntry {
  return {
    id: "e-1", leadId: "lead-1", funnelId: "catalisador", stageId: "aberta-1",
    storeId: "store-1", sellerId: "seller-1", enteredStageAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}

describe("planStageTransition", () => {
  it("moves plainly between open stages", () => {
    const plan = planStageTransition({
      entry: entry(), target: stage("negociacao"), siblingEntries: [],
    });
    expect(plan.action).toBe("move");
  });

  it("is a no-op when the target is the current stage", () => {
    const plan = planStageTransition({
      entry: entry({ stageId: "negociacao" }), target: stage("negociacao"), siblingEntries: [],
    });
    expect(plan.action).toBe("noop");
  });

  it("requires conversion when entering a won stage", () => {
    const plan = planStageTransition({
      entry: entry(), target: stage("convertido", "ganho"), siblingEntries: [],
    });
    expect(plan.action).toBe("require_conversion");
    if (plan.action !== "require_conversion") throw new Error("unreachable");
    expect(plan.linkToCustomerId).toBeUndefined();
  });

  // Without this the second conversion opens the modal in "new" mode and
  // creates a SECOND customer for the same person.
  it("links to the existing customer when another membership already converted", () => {
    const plan = planStageTransition({
      entry: entry(),
      target: stage("convertido", "ganho"),
      siblingEntries: [entry({ id: "e-2", funnelId: "filtros", convertedToCustomerId: "cust-9" })],
    });
    if (plan.action !== "require_conversion") throw new Error("unreachable");
    expect(plan.linkToCustomerId).toBe("cust-9");
  });

  it("requires a loss reason when entering a lost stage", () => {
    const plan = planStageTransition({
      entry: entry(), target: stage("perdido", "perda"), siblingEntries: [],
    });
    expect(plan.action).toBe("require_loss_reason");
  });

  it("allows reopening a closed membership back into an open stage", () => {
    const plan = planStageTransition({
      entry: entry({ stageId: "perdido", lossReason: "Preço" }),
      target: stage("negociacao"),
      siblingEntries: [],
    });
    expect(plan.action).toBe("move");
    if (plan.action !== "move") throw new Error("unreachable");
    expect(plan.clearOutcome).toBe(true);
  });

  it("rejects a stage from another funnel", () => {
    const foreign: ILeadFunnelStage = { ...stage("de-outro"), funnelId: "filtros" };
    const plan = planStageTransition({ entry: entry(), target: foreign, siblingEntries: [] });
    expect(plan.action).toBe("error");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test src/features/funnels/engine/stageTransition.test.ts`
Expected: FAIL — `Failed to resolve import "./stageTransition"`

- [ ] **Step 3: Implementar**

Criar `src/features/funnels/engine/stageTransition.ts`:

```ts
import type { ID, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { isClosingKind } from "./stageKind";

export type TransitionPlan =
  | { action: "move"; entryId: ID; stageId: ID; clearOutcome: boolean }
  | { action: "require_conversion"; entryId: ID; stageId: ID; linkToCustomerId?: ID }
  | { action: "require_loss_reason"; entryId: ID; stageId: ID }
  | { action: "noop"; reason: "same_stage" }
  | { action: "error"; reason: "stage_from_another_funnel" };

export interface ITransitionInput {
  entry: ILeadFunnelEntry;
  target: ILeadFunnelStage;
  /** The lead's OTHER memberships — needed to avoid a duplicate customer. */
  siblingEntries: ILeadFunnelEntry[];
}

/**
 * Decides what a stage change means for one membership. Never touches the
 * lead's other funnels: dropping a card in Catalisador leaves Filtros alone.
 */
export function planStageTransition(input: ITransitionInput): TransitionPlan {
  const { entry, target } = input;

  if (target.funnelId !== entry.funnelId) {
    return { action: "error", reason: "stage_from_another_funnel" };
  }
  if (target.id === entry.stageId) {
    return { action: "noop", reason: "same_stage" };
  }

  if (target.kind === "ganho") {
    // If any other membership of this lead already produced a customer, the
    // second conversion must LINK to it. Offering "create new" here is how the
    // same person ends up with two customer records.
    const alreadyConverted = input.siblingEntries.find((e) => e.convertedToCustomerId);
    return {
      action: "require_conversion",
      entryId: entry.id,
      stageId: target.id,
      linkToCustomerId: alreadyConverted?.convertedToCustomerId,
    };
  }

  if (target.kind === "perda") {
    return { action: "require_loss_reason", entryId: entry.id, stageId: target.id };
  }

  // Moving back into an open stage reopens the membership.
  const wasClosed = Boolean(entry.convertedToCustomerId) || Boolean(entry.lossReason);
  return {
    action: "move",
    entryId: entry.id,
    stageId: target.id,
    clearOutcome: wasClosed && !isClosingKind(target.kind),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/funnels/engine/stageTransition.test.ts`
Expected: PASS — 7 testes

- [ ] **Step 5: Commit**

```bash
git add src/features/funnels/engine/stageTransition.ts src/features/funnels/engine/stageTransition.test.ts
git commit -m "feat: add stage transition engine

Decides what a stage change means for a single membership, never
touching the lead's other funnels. Carries the rule that prevents
duplicate customers: if another membership already converted, the second
conversion links to that customer instead of offering to create one."
```

---

### Task 13: Engine `funnelMetrics`

**Files:**
- Create: `src/features/funnels/engine/funnelMetrics.ts`
- Test: `src/features/funnels/engine/funnelMetrics.test.ts`

**Interfaces:**
- Consumes: `ILeadFunnelEntry`, `IFunnelBoardSummary` (Task 9)
- Produces: `countDistinctLeads(entries)`, `summariseStage(input)`, `daysInStage(entry, now)`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/features/funnels/engine/funnelMetrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ILeadFunnelEntry } from "@/shared/types";
import { countDistinctLeads, daysInStage, summariseStage } from "./funnelMetrics";

function entry(leadId: string, funnelId: string, over: Partial<ILeadFunnelEntry> = {}): ILeadFunnelEntry {
  return {
    id: `${leadId}-${funnelId}`, leadId, funnelId, stageId: "s-1", storeId: "store-1",
    sellerId: "seller-1", enteredStageAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", ...over,
  };
}

describe("countDistinctLeads", () => {
  // Summing per-funnel counts would report 3 for a base of 2 people.
  it("counts a lead once even when it lives in several funnels", () => {
    const entries = [
      entry("lead-1", "catalisador"),
      entry("lead-1", "filtros"),
      entry("lead-2", "filtros"),
    ];
    expect(countDistinctLeads(entries)).toBe(2);
  });

  it("is zero for an empty list", () => {
    expect(countDistinctLeads([])).toBe(0);
  });
});

describe("summariseStage", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");

  it("sums the membership value, never the lead value", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [
        entry("lead-1", "catalisador", { estimatedValue: 8000 }),
        entry("lead-2", "catalisador", { estimatedValue: 4400 }),
      ],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.sumValue).toBe(12400);
    expect(summary.count).toBe(2);
  });

  it("treats a membership with no value as zero", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [entry("lead-1", "catalisador")],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.sumValue).toBe(0);
  });

  it("counts overdue next actions", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [entry("lead-1", "catalisador"), entry("lead-2", "catalisador")],
      nextActionByLeadId: {
        "lead-1": "2026-07-20T00:00:00.000Z", // past
        "lead-2": "2026-08-01T00:00:00.000Z", // future
      },
      now,
    });
    expect(summary.overdueCount).toBe(1);
  });

  it("does not count a lead with no scheduled next action as overdue", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [entry("lead-1", "catalisador")],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.overdueCount).toBe(0);
  });
});

describe("daysInStage", () => {
  it("measures from enteredStageAt, not from the lead's updatedAt", () => {
    const now = new Date("2026-07-23T00:00:00.000Z");
    const e = entry("lead-1", "catalisador", {
      enteredStageAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    });
    expect(daysInStage(e, now)).toBe(10);
  });

  it("is zero on the day it entered", () => {
    const now = new Date("2026-07-23T18:00:00.000Z");
    const e = entry("lead-1", "catalisador", { enteredStageAt: "2026-07-23T09:00:00.000Z" });
    expect(daysInStage(e, now)).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test src/features/funnels/engine/funnelMetrics.test.ts`
Expected: FAIL — `Failed to resolve import "./funnelMetrics"`

- [ ] **Step 3: Implementar**

Criar `src/features/funnels/engine/funnelMetrics.ts`:

```ts
import type { ID, IFunnelBoardSummary, ILeadFunnelEntry, ISO8601 } from "@/shared/types";

/**
 * Distinct leads across memberships.
 *
 * With N:N the per-funnel counts must never be summed: a lead in three funnels
 * would be reported three times. Every "total leads" figure in the UI goes
 * through here; per-funnel figures come from each funnel alone.
 */
export function countDistinctLeads(entries: ILeadFunnelEntry[]): number {
  return new Set(entries.map((e) => e.leadId)).size;
}

export interface ISummariseStageInput {
  stageId: ID;
  entries: ILeadFunnelEntry[];
  /** nextActionAt lives on the LEAD, so it arrives keyed by lead id. */
  nextActionByLeadId: Record<ID, ISO8601 | undefined>;
  now: Date;
}

/** Column header aggregate: count, summed value and how many are overdue. */
export function summariseStage(input: ISummariseStageInput): IFunnelBoardSummary {
  const nowMs = input.now.getTime();
  let sumValue = 0;
  let overdueCount = 0;

  for (const entry of input.entries) {
    // The MEMBERSHIP value, never the lead's: the same opportunity would
    // otherwise be counted in full inside every funnel it touches.
    sumValue += entry.estimatedValue ?? 0;

    const nextAction = input.nextActionByLeadId[entry.leadId];
    if (nextAction && new Date(nextAction).getTime() < nowMs) {
      overdueCount += 1;
    }
  }

  return { stageId: input.stageId, count: input.entries.length, sumValue, overdueCount };
}

const DAY_MS = 86_400_000;

/**
 * Days the membership has sat in its current stage — measured from
 * `enteredStageAt`, which is per funnel, rather than from the lead's
 * `updatedAt`, where any unrelated edit reset the count.
 */
export function daysInStage(entry: ILeadFunnelEntry, now: Date = new Date()): number {
  const elapsed = now.getTime() - new Date(entry.enteredStageAt).getTime();
  return Math.max(0, Math.floor(elapsed / DAY_MS));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test src/features/funnels/engine/funnelMetrics.test.ts`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit**

```bash
git add src/features/funnels/engine/funnelMetrics.ts src/features/funnels/engine/funnelMetrics.test.ts
git commit -m "feat: add funnel metrics engine

Two rules the UI depends on: totals count distinct leads (summing
per-funnel counts would report a lead once per funnel), and column value
sums the membership value rather than the lead's, so one opportunity is
not counted in full inside every funnel it touches."
```

---

### Task 14: Contrato do provider e implementação mock

**Files:**
- Create: `src/providers/data/contracts/leadFunnels.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/impl/mock/leadFunnels.ts`
- Create: `src/features/funnels/index.ts`

**Interfaces:**
- Consumes: tipos da Task 9, engines das Tasks 10–13
- Produces: `ILeadFunnelsProvider`, `mockLeadFunnelsProvider`

- [ ] **Step 1: Escrever o contrato**

Criar `src/providers/data/contracts/leadFunnels.ts`:

```ts
import type {
  ID,
  IFunnelBoardSummary,
  ILeadFunnel,
  ILeadFunnelEntry,
  ILeadFunnelStage,
} from "@/shared/types";

/**
 * Contract for the multi-funnel model (spec 2026-07-23).
 *
 * @see ../../../features/funnels/engine
 */
export interface ILeadFunnelsProvider {
  listFunnels(storeId: ID, opts?: { includeArchived?: boolean }): Promise<ILeadFunnel[]>;
  createFunnel(input: Omit<ILeadFunnel, "id" | "createdAt" | "updatedAt">): Promise<ILeadFunnel>;
  updateFunnel(id: ID, patch: Partial<ILeadFunnel>): Promise<ILeadFunnel>;
  archiveFunnel(id: ID): Promise<void>;

  listStages(funnelId: ID): Promise<ILeadFunnelStage[]>;
  /**
   * Upsert by id plus deletion of orphans only — NOT delete-all + insert.
   * `stage_id` carries a FK with no cascade, so dropping a stage that still has
   * memberships raises 23503.
   */
  replaceStages(funnelId: ID, stages: ILeadFunnelStage[]): Promise<ILeadFunnelStage[]>;

  listAccess(funnelId: ID): Promise<ID[]>;
  replaceAccess(funnelId: ID, sellerIds: ID[]): Promise<void>;
  /** Funnels the current user reaches. Staff gets all; default and open-to-store always in. */
  listAccessibleFunnelIds(storeId: ID): Promise<ID[]>;

  /** Aggregates resolved server-side — never by counting rows in the client. */
  countLeadsByFunnel(storeId: ID): Promise<Record<ID, number>>;
  getBoardSummary(funnelId: ID): Promise<IFunnelBoardSummary[]>;

  listEntriesByLead(leadId: ID): Promise<ILeadFunnelEntry[]>;
  /** Gated by the conversation, mirroring ILeadsProvider.getViaConversation. */
  listEntriesViaConversation(conversationId: ID): Promise<ILeadFunnelEntry[]>;
  addEntry(leadId: ID, funnelId: ID, stageId?: ID): Promise<ILeadFunnelEntry>;
  moveEntry(entryId: ID, stageId: ID): Promise<ILeadFunnelEntry>;
  updateEntry(
    entryId: ID,
    patch: Pick<ILeadFunnelEntry, "estimatedValue">,
  ): Promise<ILeadFunnelEntry>;
  removeEntry(entryId: ID): Promise<{ movedToDefault: boolean }>;
}
```

- [ ] **Step 2: Registrar no barrel de contratos**

Em `src/providers/data/contracts/index.ts`, três edições, cada uma junto das linhas equivalentes de `leads`:

```ts
import type { ILeadFunnelsProvider } from "./leadFunnels";
```

```ts
export type { ILeadFunnelsProvider } from "./leadFunnels";
```

E dentro da interface `IDataProviders`:

```ts
  leadFunnels: ILeadFunnelsProvider;
```

- [ ] **Step 3: Implementar o provider mock**

Criar `src/providers/data/impl/mock/leadFunnels.ts`:

```ts
import type {
  ID,
  IFunnelBoardSummary,
  ILeadFunnel,
  ILeadFunnelEntry,
  ILeadFunnelStage,
} from "@/shared/types";
import type { ILeadFunnelsProvider } from "../../contracts/leadFunnels";
import {
  planAddToFunnel,
  planRemoveFromFunnel,
} from "@/features/funnels/engine/membershipRules";
import { resolveAccessibleFunnels } from "@/features/funnels/engine/accessibleFunnels";
import { summariseStage } from "@/features/funnels/engine/funnelMetrics";
import { getMockStore } from "../../../../mocks/store/mockStore";

/**
 * In-memory multi-funnel provider. Seeds three funnels beyond the default so
 * the three navigation patterns can actually be exercised in demo mode — with
 * a single funnel they all degrade to a static label.
 */

const STORE_ID = "00000000-0000-0000-0000-000000000001";
const nowIso = () => new Date().toISOString();

function makeId(prefix: string, n: number): ID {
  return `${prefix}-${n}`;
}

let funnels: ILeadFunnel[] = [];
let stages: ILeadFunnelStage[] = [];
let entries: ILeadFunnelEntry[] = [];
let access: Array<{ funnelId: ID; sellerId: ID }> = [];
let seeded = false;

function seedOnce(): void {
  if (seeded) return;
  seeded = true;

  const specs: Array<{ id: string; name: string; accent: ILeadFunnel["accent"]; icon: string; isDefault: boolean }> = [
    { id: "geral", name: "Geral", accent: 0, icon: "mdi:inbox-outline", isDefault: true },
    { id: "catalisador", name: "Catalisador", accent: 1, icon: "mdi:air-filter", isDefault: false },
    { id: "filtros", name: "Filtros", accent: 2, icon: "mdi:filter-variant", isDefault: false },
    { id: "modulos", name: "Módulos", accent: 3, icon: "mdi:chip", isDefault: false },
  ];

  funnels = specs.map((s, index) => ({
    id: makeId("funnel", index),
    storeId: STORE_ID,
    name: s.name,
    description: s.isDefault ? "Todo lead novo entra aqui até ser direcionado." : undefined,
    accent: s.accent,
    icon: s.icon,
    position: index,
    isDefault: s.isDefault,
    openToStore: s.isDefault,
    entryAlertThreshold: 50,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));

  const stageSpecs: Array<{ name: string; kind: ILeadFunnelStage["kind"]; accent: ILeadFunnelStage["accent"] }> = [
    { name: "Novo", kind: "entrada", accent: 0 },
    { name: "Em qualificação", kind: "aberta", accent: 2 },
    { name: "Orçamento enviado", kind: "aberta", accent: 6 },
    { name: "Em negociação", kind: "aberta", accent: 7 },
    { name: "Convertido", kind: "ganho", accent: 3 },
    { name: "Perdido", kind: "perda", accent: 1 },
  ];

  stages = funnels.flatMap((f, fi) =>
    stageSpecs.map((s, si) => ({
      id: makeId(`stage-${fi}`, si),
      funnelId: f.id,
      name: s.name,
      accent: s.accent,
      position: si,
      kind: s.kind,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })),
  );

  // Every existing mock lead joins the default funnel, on the stage whose name
  // matches its legacy snapshot — mirroring the SQL backfill.
  const defaultFunnel = funnels[0];
  const defaultStages = stages.filter((s) => s.funnelId === defaultFunnel.id);
  const entryStage = defaultStages.find((s) => s.kind === "entrada");
  const wonStage = defaultStages.find((s) => s.kind === "ganho");
  const lostStage = defaultStages.find((s) => s.kind === "perda");

  entries = getMockStore()
    .leads.map((lead, index) => {
      const matched =
        lead.convertedToCustomerId
          ? wonStage
          : lead.lossReason
            ? lostStage
            : defaultStages.find(
                (s) => s.name.toLowerCase() === lead.stage.name.toLowerCase() && s.kind === "aberta",
              );
      const stage = matched ?? entryStage;
      if (!stage) return null;
      return {
        id: makeId("entry", index),
        leadId: lead.id,
        funnelId: defaultFunnel.id,
        stageId: stage.id,
        storeId: lead.storeId,
        sellerId: lead.sellerId,
        estimatedValue: lead.estimatedValue,
        convertedToCustomerId: lead.convertedToCustomerId,
        lossReason: lead.lossReason,
        lossNotes: lead.lossNotes,
        enteredStageAt: lead.updatedAt,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      } satisfies ILeadFunnelEntry;
    })
    .filter((e): e is ILeadFunnelEntry => e !== null);
}

export const mockLeadFunnelsProvider: ILeadFunnelsProvider = {
  async listFunnels(storeId, opts) {
    seedOnce();
    return funnels
      .filter((f) => f.storeId === storeId)
      .filter((f) => (opts?.includeArchived ? true : !f.archivedAt))
      .sort((a, b) => a.position - b.position);
  },

  async createFunnel(input) {
    seedOnce();
    const created: ILeadFunnel = {
      ...input,
      id: makeId("funnel", funnels.length),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    funnels = [...funnels, created];
    return created;
  },

  async updateFunnel(id, patch) {
    seedOnce();
    const index = funnels.findIndex((f) => f.id === id);
    if (index < 0) throw new Error(`[mock] funnel ${id} not found`);
    const updated: ILeadFunnel = { ...funnels[index], ...patch, id, updatedAt: nowIso() };
    funnels = funnels.map((f) => (f.id === id ? updated : f));
    return updated;
  },

  async archiveFunnel(id) {
    seedOnce();
    const target = funnels.find((f) => f.id === id);
    if (target?.isDefault) throw new Error("[mock] the default funnel cannot be archived");
    funnels = funnels.map((f) => (f.id === id ? { ...f, archivedAt: nowIso() } : f));
  },

  async listStages(funnelId) {
    seedOnce();
    return stages.filter((s) => s.funnelId === funnelId).sort((a, b) => a.position - b.position);
  },

  async replaceStages(funnelId, next) {
    seedOnce();
    // Upsert by id plus orphan removal, mirroring the Supabase implementation:
    // wipe-and-reinsert would orphan the memberships that point at these ids.
    const others = stages.filter((s) => s.funnelId !== funnelId);
    stages = [...others, ...next.map((s) => ({ ...s, funnelId, updatedAt: nowIso() }))];
    return this.listStages(funnelId);
  },

  async listAccess(funnelId) {
    seedOnce();
    return access.filter((a) => a.funnelId === funnelId).map((a) => a.sellerId);
  },

  async replaceAccess(funnelId, sellerIds) {
    seedOnce();
    access = [
      ...access.filter((a) => a.funnelId !== funnelId),
      ...sellerIds.map((sellerId) => ({ funnelId, sellerId })),
    ];
  },

  async listAccessibleFunnelIds(storeId) {
    seedOnce();
    // The mock has no session; demo mode behaves as staff.
    const reachable = resolveAccessibleFunnels({
      funnels: funnels.filter((f) => f.storeId === storeId),
      grantedFunnelIds: [],
      isStaff: true,
    });
    return reachable.map((f) => f.id);
  },

  async countLeadsByFunnel(storeId) {
    seedOnce();
    const result: Record<ID, number> = {};
    for (const funnel of funnels.filter((f) => f.storeId === storeId)) {
      result[funnel.id] = entries.filter((e) => e.funnelId === funnel.id).length;
    }
    return result;
  },

  async getBoardSummary(funnelId) {
    seedOnce();
    const leadsById = new Map(getMockStore().leads.map((l) => [l.id, l]));
    const nextActionByLeadId: Record<ID, string | undefined> = {};
    for (const [id, lead] of leadsById) nextActionByLeadId[id] = lead.nextActionAt;

    return stages
      .filter((s) => s.funnelId === funnelId)
      .sort((a, b) => a.position - b.position)
      .map((stage) =>
        summariseStage({
          stageId: stage.id,
          entries: entries.filter((e) => e.stageId === stage.id),
          nextActionByLeadId,
          now: new Date(),
        }),
      ) satisfies IFunnelBoardSummary[];
  },

  async listEntriesByLead(leadId) {
    seedOnce();
    return entries.filter((e) => e.leadId === leadId);
  },

  async listEntriesViaConversation(conversationId) {
    seedOnce();
    const lead = getMockStore().leads.find((l) => l.conversations.includes(conversationId));
    return lead ? entries.filter((e) => e.leadId === lead.id) : [];
  },

  async addEntry(leadId, funnelId, stageId) {
    seedOnce();
    const funnel = funnels.find((f) => f.id === funnelId);
    if (!funnel) throw new Error(`[mock] funnel ${funnelId} not found`);
    const lead = getMockStore().leads.find((l) => l.id === leadId);
    if (!lead) throw new Error(`[mock] lead ${leadId} not found`);

    const plan = planAddToFunnel({
      existing: entries.filter((e) => e.leadId === leadId),
      funnel,
      stages: stages.filter((s) => s.funnelId === funnelId),
      leadEstimatedValue: lead.estimatedValue,
      stageId,
    });

    if (plan.action === "error") throw new Error(`[mock] cannot add to funnel: ${plan.reason}`);
    if (plan.action === "noop") {
      const existing = entries.find((e) => e.leadId === leadId && e.funnelId === funnelId);
      if (!existing) throw new Error("[mock] inconsistent membership state");
      return existing;
    }

    const created: ILeadFunnelEntry = {
      id: makeId("entry", entries.length),
      leadId,
      funnelId: plan.funnelId,
      stageId: plan.stageId,
      storeId: lead.storeId,
      sellerId: lead.sellerId,
      estimatedValue: plan.estimatedValue,
      enteredStageAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    entries = [...entries, created];
    return created;
  },

  async moveEntry(entryId, stageId) {
    seedOnce();
    const index = entries.findIndex((e) => e.id === entryId);
    if (index < 0) throw new Error(`[mock] entry ${entryId} not found`);
    const updated: ILeadFunnelEntry = {
      ...entries[index],
      stageId,
      enteredStageAt: nowIso(),
      updatedAt: nowIso(),
    };
    entries = entries.map((e) => (e.id === entryId ? updated : e));
    return updated;
  },

  async updateEntry(entryId, patch) {
    seedOnce();
    const index = entries.findIndex((e) => e.id === entryId);
    if (index < 0) throw new Error(`[mock] entry ${entryId} not found`);
    const updated: ILeadFunnelEntry = { ...entries[index], ...patch, updatedAt: nowIso() };
    entries = entries.map((e) => (e.id === entryId ? updated : e));
    return updated;
  },

  async removeEntry(entryId) {
    seedOnce();
    const target = entries.find((e) => e.id === entryId);
    if (!target) return { movedToDefault: false };

    const defaultFunnel = funnels.find((f) => f.isDefault);
    if (!defaultFunnel) throw new Error("[mock] store has no default funnel");

    const plan = planRemoveFromFunnel({
      existing: entries.filter((e) => e.leadId === target.leadId),
      entryId,
      defaultFunnel,
      defaultFunnelStages: stages.filter((s) => s.funnelId === defaultFunnel.id),
    });

    if (plan.action !== "remove") {
      throw new Error(`[mock] cannot remove membership: ${plan.reason}`);
    }

    entries = entries.filter((e) => e.id !== entryId);

    if (plan.movedToDefault && plan.recreateInFunnelId && plan.recreateInStageId) {
      entries = [
        ...entries,
        {
          ...target,
          id: makeId("entry", entries.length + 1),
          funnelId: plan.recreateInFunnelId,
          stageId: plan.recreateInStageId,
          enteredStageAt: nowIso(),
          updatedAt: nowIso(),
        },
      ];
    }

    return { movedToDefault: plan.movedToDefault };
  },
};
```

**Nota:** confirme o caminho e o nome do acessor do store mock antes de escrever o import — Run: `grep -rn "export function getMockStore\|export const mockStore" src/mocks/store/*.ts | head -3`. Use o nome real.

- [ ] **Step 4: Criar o barrel da feature**

Criar `src/features/funnels/index.ts`:

```ts
export { getAccentClasses, FUNNEL_ACCENT_SLOTS } from "./engine/accentClasses";
export type { IFunnelAccentClasses } from "./engine/accentClasses";
export { isClosingKind, resolveStageKind } from "./engine/stageKind";
export { hexToAccentSlot } from "./engine/legacyStageColor";
export { planAddToFunnel, planRemoveFromFunnel } from "./engine/membershipRules";
export { resolveAccessibleFunnels } from "./engine/accessibleFunnels";
export { planStageTransition } from "./engine/stageTransition";
export { countDistinctLeads, daysInStage, summariseStage } from "./engine/funnelMetrics";
```

- [ ] **Step 5: Type-check e testes**

Run: `bunx tsc --noEmit 2>&1 | grep -E "providers/data|features/funnels"`
Expected: nenhum erro nesses caminhos.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/contracts/leadFunnels.ts src/providers/data/contracts/index.ts src/providers/data/impl/mock/leadFunnels.ts src/features/funnels/index.ts
git commit -m "feat: add leadFunnels contract and mock provider

The mock seeds three funnels beyond the default: with a single funnel
the three navigation patterns all degrade to a static label, so demo
mode could never exercise them.

replaceStages is documented as upsert-plus-orphan-delete rather than
delete-all: stage_id carries a FK with no cascade, so dropping a stage
that still holds memberships raises 23503."
```

---

### Task 15: Provider Supabase

**Files:**
- Create: `src/providers/data/impl/supabase/leadFunnels.ts`

**Interfaces:**
- Consumes: `ILeadFunnelsProvider` (Task 14), tabelas das Tasks 6–8, e as quatro RPCs criadas na **Task 16** — `accessible_lead_funnel_ids`, `count_leads_by_funnel`, `lead_funnel_board_summary`, `lead_funnel_entries_via_conversation`. Esta task compila sem elas (a chamada só falha em runtime, contra um banco onde a migration não rodou), mas **não considere a Task 15 verificada até a Task 16 estar commitada**.
- Produces: `supabaseLeadFunnelsProvider`

- [ ] **Step 1: Conferir o padrão de um provider supabase existente**

Run: `head -60 src/providers/data/impl/supabase/rotationQueues.ts`
Expected: mostra o padrão de `rowTo*` / `*ToRow` e o uso de `getSupabaseClient()`. Siga-o.

- [ ] **Step 2: Implementar**

Criar `src/providers/data/impl/supabase/leadFunnels.ts`:

```ts
import type {
  ID,
  IFunnelBoardSummary,
  ILeadFunnel,
  ILeadFunnelEntry,
  ILeadFunnelStage,
  FunnelAccent,
  LeadFunnelStageKind,
} from "@/shared/types";
import type { ILeadFunnelsProvider } from "../../contracts/leadFunnels";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { planRemoveFromFunnel } from "@/features/funnels/engine/membershipRules";

/**
 * Supabase implementation of {@link ILeadFunnelsProvider}.
 *
 * snake_case rows <-> camelCase domain types. `store_id` and `seller_id` on
 * lead_funnel_entries are DERIVED by a before-insert trigger, so they are never
 * sent on write — anything the client provides is overwritten server-side.
 */

interface FunnelRow {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  accent: number;
  icon: string;
  position: number;
  is_default: boolean;
  open_to_store: boolean;
  entry_alert_threshold: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StageRow {
  id: string;
  funnel_id: string;
  name: string;
  accent: number;
  position: number;
  kind: LeadFunnelStageKind;
  created_at: string;
  updated_at: string;
}

interface EntryRow {
  id: string;
  lead_id: string;
  funnel_id: string;
  stage_id: string;
  store_id: string;
  seller_id: string | null;
  estimated_value: number | null;
  converted_to_customer_id: string | null;
  loss_reason: string | null;
  loss_notes: string | null;
  entered_stage_at: string;
  created_at: string;
  updated_at: string;
}

const FUNNEL_COLUMNS =
  "id, store_id, name, description, accent, icon, position, is_default, open_to_store, " +
  "entry_alert_threshold, archived_at, created_at, updated_at";
const STAGE_COLUMNS = "id, funnel_id, name, accent, position, kind, created_at, updated_at";
const ENTRY_COLUMNS =
  "id, lead_id, funnel_id, stage_id, store_id, seller_id, estimated_value, " +
  "converted_to_customer_id, loss_reason, loss_notes, entered_stage_at, created_at, updated_at";

function rowToFunnel(row: FunnelRow): ILeadFunnel {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    description: row.description ?? undefined,
    accent: row.accent as FunnelAccent,
    icon: row.icon,
    position: row.position,
    isDefault: row.is_default,
    openToStore: row.open_to_store,
    entryAlertThreshold: row.entry_alert_threshold,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStage(row: StageRow): ILeadFunnelStage {
  return {
    id: row.id,
    funnelId: row.funnel_id,
    name: row.name,
    accent: row.accent as FunnelAccent,
    position: row.position,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEntry(row: EntryRow): ILeadFunnelEntry {
  return {
    id: row.id,
    leadId: row.lead_id,
    funnelId: row.funnel_id,
    stageId: row.stage_id,
    storeId: row.store_id,
    sellerId: row.seller_id,
    estimatedValue: row.estimated_value ?? undefined,
    convertedToCustomerId: row.converted_to_customer_id ?? undefined,
    lossReason: row.loss_reason ?? undefined,
    lossNotes: row.loss_notes ?? undefined,
    enteredStageAt: row.entered_stage_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseLeadFunnelsProvider: ILeadFunnelsProvider = {
  async listFunnels(storeId, opts) {
    let query = getSupabaseClient()
      .from("lead_funnels")
      .select(FUNNEL_COLUMNS)
      .eq("store_id", storeId)
      .order("position", { ascending: true });

    if (!opts?.includeArchived) query = query.is("archived_at", null);

    const { data, error } = await query;
    if (error) throw new Error(`[supabase] listFunnels(${storeId}) failed: ${error.message}`);
    return (data as FunnelRow[]).map(rowToFunnel);
  },

  async createFunnel(input) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnels")
      .insert({
        store_id: input.storeId,
        name: input.name,
        description: input.description ?? null,
        accent: input.accent,
        icon: input.icon,
        position: input.position,
        is_default: input.isDefault,
        open_to_store: input.openToStore,
        entry_alert_threshold: input.entryAlertThreshold,
      })
      .select(FUNNEL_COLUMNS)
      .single();

    if (error) throw new Error(`[supabase] createFunnel failed: ${error.message}`);
    return rowToFunnel(data as FunnelRow);
  },

  async updateFunnel(id, patch) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description ?? null;
    if (patch.accent !== undefined) row.accent = patch.accent;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.position !== undefined) row.position = patch.position;
    if (patch.openToStore !== undefined) row.open_to_store = patch.openToStore;
    if (patch.entryAlertThreshold !== undefined) row.entry_alert_threshold = patch.entryAlertThreshold;
    // is_default and store_id are immutable in v1 (spec §2).

    const { data, error } = await getSupabaseClient()
      .from("lead_funnels")
      .update(row)
      .eq("id", id)
      .select(FUNNEL_COLUMNS)
      .single();

    if (error) throw new Error(`[supabase] updateFunnel(${id}) failed: ${error.message}`);
    return rowToFunnel(data as FunnelRow);
  },

  async archiveFunnel(id) {
    const { error } = await getSupabaseClient()
      .from("lead_funnels")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("is_default", false);
    if (error) throw new Error(`[supabase] archiveFunnel(${id}) failed: ${error.message}`);
  },

  async listStages(funnelId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_stages")
      .select(STAGE_COLUMNS)
      .eq("funnel_id", funnelId)
      .order("position", { ascending: true });
    if (error) throw new Error(`[supabase] listStages(${funnelId}) failed: ${error.message}`);
    return (data as StageRow[]).map(rowToStage);
  },

  async replaceStages(funnelId, next) {
    const client = getSupabaseClient();

    // Upsert by id; delete only the orphans. A delete-all would hit the FK from
    // lead_funnel_entries.stage_id (no cascade) with 23503.
    const { error: upsertError } = await client.from("lead_funnel_stages").upsert(
      next.map((s) => ({
        id: s.id,
        funnel_id: funnelId,
        name: s.name,
        accent: s.accent,
        position: s.position,
        kind: s.kind,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );
    if (upsertError) {
      throw new Error(`[supabase] replaceStages(${funnelId}) upsert failed: ${upsertError.message}`);
    }

    const keptIds = next.map((s) => s.id);
    const { error: deleteError } = await client
      .from("lead_funnel_stages")
      .delete()
      .eq("funnel_id", funnelId)
      .not("id", "in", `(${keptIds.join(",")})`);
    if (deleteError) {
      throw new Error(`[supabase] replaceStages(${funnelId}) delete failed: ${deleteError.message}`);
    }

    return this.listStages(funnelId);
  },

  async listAccess(funnelId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_access")
      .select("seller_id")
      .eq("funnel_id", funnelId);
    if (error) throw new Error(`[supabase] listAccess(${funnelId}) failed: ${error.message}`);
    return (data as Array<{ seller_id: string }>).map((r) => r.seller_id);
  },

  async replaceAccess(funnelId, sellerIds) {
    const client = getSupabaseClient();
    const { error: deleteError } = await client
      .from("lead_funnel_access")
      .delete()
      .eq("funnel_id", funnelId);
    if (deleteError) {
      throw new Error(`[supabase] replaceAccess(${funnelId}) delete failed: ${deleteError.message}`);
    }
    if (sellerIds.length === 0) return;

    const { error: insertError } = await client
      .from("lead_funnel_access")
      .insert(sellerIds.map((sellerId) => ({ funnel_id: funnelId, seller_id: sellerId })));
    if (insertError) {
      throw new Error(`[supabase] replaceAccess(${funnelId}) insert failed: ${insertError.message}`);
    }
  },

  async listAccessibleFunnelIds(storeId) {
    const { data, error } = await getSupabaseClient().rpc("accessible_lead_funnel_ids", {
      p_store_id: storeId,
    });
    if (error) {
      throw new Error(`[supabase] listAccessibleFunnelIds(${storeId}) failed: ${error.message}`);
    }
    return (data as Array<{ funnel_id: string }>).map((r) => r.funnel_id);
  },

  async countLeadsByFunnel(storeId) {
    const { data, error } = await getSupabaseClient().rpc("count_leads_by_funnel", {
      p_store_id: storeId,
    });
    if (error) throw new Error(`[supabase] countLeadsByFunnel(${storeId}) failed: ${error.message}`);
    const result: Record<ID, number> = {};
    for (const row of data as Array<{ funnel_id: string; lead_count: number }>) {
      result[row.funnel_id] = row.lead_count;
    }
    return result;
  },

  async getBoardSummary(funnelId) {
    const { data, error } = await getSupabaseClient().rpc("lead_funnel_board_summary", {
      p_funnel_id: funnelId,
    });
    if (error) throw new Error(`[supabase] getBoardSummary(${funnelId}) failed: ${error.message}`);
    return (data as Array<{
      stage_id: string;
      lead_count: number;
      sum_value: number | null;
      overdue_count: number;
    }>).map((row) => ({
      stageId: row.stage_id,
      count: row.lead_count,
      sumValue: row.sum_value ?? 0,
      overdueCount: row.overdue_count,
    })) satisfies IFunnelBoardSummary[];
  },

  async listEntriesByLead(leadId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .select(ENTRY_COLUMNS)
      .eq("lead_id", leadId);
    if (error) throw new Error(`[supabase] listEntriesByLead(${leadId}) failed: ${error.message}`);
    return (data as EntryRow[]).map(rowToEntry);
  },

  async listEntriesViaConversation(conversationId) {
    const { data, error } = await getSupabaseClient().rpc("lead_funnel_entries_via_conversation", {
      p_conversation_id: conversationId,
    });
    if (error) {
      throw new Error(
        `[supabase] listEntriesViaConversation(${conversationId}) failed: ${error.message}`,
      );
    }
    return (data as EntryRow[]).map(rowToEntry);
  },

  async addEntry(leadId, funnelId, stageId) {
    const client = getSupabaseClient();

    let targetStageId = stageId;
    if (!targetStageId) {
      const { data, error } = await client
        .from("lead_funnel_stages")
        .select("id")
        .eq("funnel_id", funnelId)
        .eq("kind", "entrada")
        .single();
      if (error) throw new Error(`[supabase] addEntry: no entry stage: ${error.message}`);
      targetStageId = (data as { id: string }).id;
    }

    // store_id and seller_id are omitted on purpose: the before-insert trigger
    // derives them from the lead. store_id is NOT NULL, so a placeholder is
    // required to satisfy the parser; the trigger overwrites it.
    const { data, error } = await client
      .from("lead_funnel_entries")
      .insert({
        lead_id: leadId,
        funnel_id: funnelId,
        stage_id: targetStageId,
        store_id: "00000000-0000-0000-0000-000000000000",
      })
      .select(ENTRY_COLUMNS)
      .single();

    if (error) throw new Error(`[supabase] addEntry(${leadId}, ${funnelId}) failed: ${error.message}`);
    return rowToEntry(data as EntryRow);
  },

  async moveEntry(entryId, stageId) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .update({
        stage_id: stageId,
        entered_stage_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .select(ENTRY_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] moveEntry(${entryId}) failed: ${error.message}`);
    return rowToEntry(data as EntryRow);
  },

  async updateEntry(entryId, patch) {
    const { data, error } = await getSupabaseClient()
      .from("lead_funnel_entries")
      .update({
        estimated_value: patch.estimatedValue ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .select(ENTRY_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] updateEntry(${entryId}) failed: ${error.message}`);
    return rowToEntry(data as EntryRow);
  },

  async removeEntry(entryId) {
    const client = getSupabaseClient();

    const { data: targetRow, error: readError } = await client
      .from("lead_funnel_entries")
      .select(ENTRY_COLUMNS)
      .eq("id", entryId)
      .single();
    if (readError) throw new Error(`[supabase] removeEntry(${entryId}) read failed: ${readError.message}`);
    const target = rowToEntry(targetRow as EntryRow);

    const existing = await this.listEntriesByLead(target.leadId);

    const { data: funnelRows, error: funnelError } = await client
      .from("lead_funnels")
      .select(FUNNEL_COLUMNS)
      .eq("store_id", target.storeId)
      .eq("is_default", true)
      .single();
    if (funnelError) throw new Error(`[supabase] removeEntry: no default funnel: ${funnelError.message}`);
    const defaultFunnel = rowToFunnel(funnelRows as FunnelRow);
    const defaultStages = await this.listStages(defaultFunnel.id);

    const plan = planRemoveFromFunnel({
      existing,
      entryId,
      defaultFunnel,
      defaultFunnelStages: defaultStages,
    });

    if (plan.action !== "remove") {
      throw new Error(`[supabase] cannot remove membership: ${plan.reason}`);
    }

    const { error: deleteError } = await client
      .from("lead_funnel_entries")
      .delete()
      .eq("id", entryId);
    if (deleteError) throw new Error(`[supabase] removeEntry(${entryId}) failed: ${deleteError.message}`);

    if (plan.movedToDefault && plan.recreateInFunnelId && plan.recreateInStageId) {
      await this.addEntry(target.leadId, plan.recreateInFunnelId, plan.recreateInStageId);
    }

    return { movedToDefault: plan.movedToDefault };
  },
};
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "supabase/leadFunnels"`
Expected: nenhum erro.

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/impl/supabase/leadFunnels.ts
git commit -m "feat: add supabase leadFunnels provider

Writes never send store_id/seller_id meaningfully: the before-insert
trigger derives them from the lead, so anything the client sends is
overwritten. Aggregates go through RPCs rather than counting rows in the
browser — the board must not repeat the 1000-row client-side filtering
that the leads list does today."
```

---

### Task 16: RPCs de agregação e leitura gated

**Files:**
- Create: `supabase/migrations/20260723123000_lead_funnels_rpcs.sql`

**Interfaces:**
- Consumes: Tasks 6–8
- Produces: `accessible_lead_funnel_ids(uuid)`, `count_leads_by_funnel(uuid)`, `lead_funnel_board_summary(uuid)`, `lead_funnel_entries_via_conversation(uuid)` — assinaturas consumidas pela Task 15.

- [ ] **Step 1: Confirmar o helper de acesso a conversa**

Run: `grep -rn "function public.can_access_conversation" supabase/migrations/*.sql | head -2`
Expected: a função existe (modelo "2 portões", v0.110.0 `Turnstile`). Use o nome real na última RPC.

- [ ] **Step 2: Escrever as RPCs**

Criar `supabase/migrations/20260723123000_lead_funnels_rpcs.sql`:

```sql
-- Aggregates and gated reads for the multi-funnel board.
-- Counting in the browser is what makes the current leads list fetch 1000 rows
-- and filter client-side; these keep it on the server.

-- Funnels the caller can open. Mirrors resolveAccessibleFunnels exactly:
-- staff sees all; the default funnel and open-to-store funnels are always in.
create or replace function public.accessible_lead_funnel_ids(p_store_id uuid)
returns table (funnel_id uuid)
language sql stable security invoker set search_path = public as $$
  select f.id
    from public.lead_funnels f
   where f.store_id = p_store_id
     and f.archived_at is null
     and (
       (select public.is_staff())
       or f.is_default
       or f.open_to_store
       or exists (
         select 1 from public.lead_funnel_access a
          where a.funnel_id = f.id
            and a.seller_id = (select public.current_seller_id())
       )
     )
   order by f.position;
$$;

-- Distinct leads per funnel. Never sum these across funnels: a lead in three
-- funnels appears in three rows by design.
create or replace function public.count_leads_by_funnel(p_store_id uuid)
returns table (funnel_id uuid, lead_count bigint)
language sql stable security invoker set search_path = public as $$
  select e.funnel_id, count(distinct e.lead_id)
    from public.lead_funnel_entries e
   where e.store_id = p_store_id
   group by e.funnel_id;
$$;

-- Column header aggregate. sum_value adds the MEMBERSHIP value, so the same
-- opportunity is not counted in full inside every funnel it touches.
create or replace function public.lead_funnel_board_summary(p_funnel_id uuid)
returns table (stage_id uuid, lead_count bigint, sum_value numeric, overdue_count bigint)
language sql stable security invoker set search_path = public as $$
  select
    s.id,
    count(e.id),
    coalesce(sum(e.estimated_value), 0),
    count(e.id) filter (where l.next_action_at is not null and l.next_action_at < now())
  from public.lead_funnel_stages s
  left join public.lead_funnel_entries e on e.stage_id = s.id
  left join public.leads l on l.id = e.lead_id
  where s.funnel_id = p_funnel_id
  group by s.id, s.position
  order by s.position;
$$;

-- Memberships of the lead anchored to a conversation, gated ONCE by the
-- conversation instead of the per-owner entries RLS — so a pool attendant can
-- open the fiche without owning the lead. Mirrors the getViaConversation
-- pattern from the conversation access model.
create or replace function public.lead_funnel_entries_via_conversation(p_conversation_id uuid)
returns setof public.lead_funnel_entries
language sql stable security definer set search_path = public as $$
  select e.*
    from public.lead_funnel_entries e
   where public.can_access_conversation(p_conversation_id)
     and e.lead_id = (
       select l.id from public.leads l
        where p_conversation_id = any(l.conversations)
        limit 1
     );
$$;

revoke all on function public.lead_funnel_entries_via_conversation(uuid) from public;
grant execute on function public.lead_funnel_entries_via_conversation(uuid) to authenticated;
```

- [ ] **Step 3: Conferir que a RPC gated não é `security invoker`**

Run: `grep -n "security definer" supabase/migrations/20260723123000_lead_funnels_rpcs.sql`
Expected: exatamente uma ocorrência — `lead_funnel_entries_via_conversation`. As outras três são `security invoker` de propósito: devem respeitar a RLS do chamador.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723123000_lead_funnels_rpcs.sql
git commit -m "feat(db): add funnel aggregate and gated-read RPCs

Three invoker-rights aggregates plus one definer-rights read gated once
by can_access_conversation, mirroring the pattern the conversation access
model established: the pool attendant needs the fiche without owning the
lead, and per-row RLS on that path does not scale."
```

---

### Task 17: Registrar o provider no factory e no hook

**Files:**
- Modify: `src/providers/data/factory.ts`
- Create: `src/providers/data/hooks/useLeadFunnelsProvider.ts`
- Modify: `src/providers/data/index.ts`

**Interfaces:**
- Consumes: Tasks 14 e 15
- Produces: `useLeadFunnelsProvider(): ILeadFunnelsProvider`

- [ ] **Step 1: Registrar no factory**

Em `src/providers/data/factory.ts`, três edições:

Junto dos demais imports de mock (perto da linha 44):

```ts
import { mockLeadFunnelsProvider } from "./impl/mock/leadFunnels";
```

Junto dos demais imports de supabase (perto da linha 97):

```ts
import { supabaseLeadFunnelsProvider } from "./impl/supabase/leadFunnels";
```

No objeto `mockProviders`, logo após a linha `leads: mockLeadsProvider,`:

```ts
  leadFunnels: mockLeadFunnelsProvider,
```

No objeto `supabaseProviders`, logo após `leads: supabaseLeadsProvider,`:

```ts
  leadFunnels: supabaseLeadFunnelsProvider,
```

- [ ] **Step 2: Criar o hook**

Run: `cat src/providers/data/hooks/useLeadsProvider.ts`
Expected: mostra o padrão exato (uma linha usando `_useDataProviderSlice`). Replique-o.

Criar `src/providers/data/hooks/useLeadFunnelsProvider.ts`:

```ts
import type { ILeadFunnelsProvider } from "../contracts/leadFunnels";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useLeadFunnelsProvider(): ILeadFunnelsProvider {
  return useDataProviderSlice("leadFunnels");
}
```

Ajuste o nome do helper importado ao que `useLeadsProvider.ts` realmente usa.

- [ ] **Step 3: Exportar pelo barrel público**

Em `src/providers/data/index.ts`, junto da exportação de `useLeadsProvider`:

```ts
export { useLeadFunnelsProvider } from "./hooks/useLeadFunnelsProvider";
```

- [ ] **Step 4: Verificar que o ESLint de fronteira está satisfeito**

Run: `bun run lint`
Expected: nenhum erro novo. Se acusar import proibido, é porque algo fora de `providers/data` importou `impl/*` — o acesso é sempre pelo hook.

- [ ] **Step 5: Type-check e testes**

Run: `bunx tsc --noEmit 2>&1 | grep "providers/data"`
Expected: nenhum erro.

Run: `bun run test && bun run build`
Expected: PASS e build concluído.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/factory.ts src/providers/data/hooks/useLeadFunnelsProvider.ts src/providers/data/index.ts
git commit -m "feat: register leadFunnels as the 38th data provider"
```

---

### Task 18: Filtro por funil no provider de leads (server-side)

**Files:**
- Modify: `src/providers/data/contracts/leads.ts`
- Modify: `src/providers/data/impl/supabase/leads.ts`
- Modify: `src/providers/data/impl/mock/leads.ts`

**Interfaces:**
- Consumes: Task 6 (tabela de participações)
- Produces: `IListLeadsParams` com `funnelId?` e `stageId?`

- [ ] **Step 1: Estender o contrato**

Em `src/providers/data/contracts/leads.ts`, acrescentar a `IListLeadsParams`:

```ts
  /**
   * Restricts to leads participating in this funnel. Resolved SERVER-SIDE by
   * joining lead_funnel_entries — filtering in the browser would require
   * fetching the whole base, which the 1000-row ceiling already strains.
   */
  funnelId?: ID;
  /** Restricts to a stage within `funnelId`. Ignored when funnelId is absent. */
  stageId?: ID;
```

- [ ] **Step 2: Implementar no provider supabase**

Em `src/providers/data/impl/supabase/leads.ts`, dentro de `list`, após a aplicação dos demais filtros e antes do `order`/`range`, acrescentar:

```ts
    if (params?.funnelId) {
      // Inner join through the membership table; PostgREST expresses it with
      // the `!inner` hint on the embedded resource.
      query = query
        .select(`${COLUMNS}, lead_funnel_entries!inner(funnel_id, stage_id)`)
        .eq("lead_funnel_entries.funnel_id", params.funnelId);

      if (params.stageId) {
        query = query.eq("lead_funnel_entries.stage_id", params.stageId);
      }
    }
```

**Atenção:** o `select` original já foi aplicado ao construir `query`; esta reaplicação com o `!inner` é intencional e substitui a projeção. Confirme lendo o início da função — se o `select` estiver encadeado direto no `from`, mova-o para uma variável, como acima.

- [ ] **Step 3: Implementar no provider mock**

Em `src/providers/data/impl/mock/leads.ts`, adicionar o import no topo:

```ts
import { mockLeadFunnelsProvider } from "./leadFunnels";
```

E, na função de listagem (perto da linha 36, onde `params.stageId` já é tratado), acrescentar **antes** do filtro `stageId` existente:

```ts
        if (params.funnelId) {
          const funnelId = params.funnelId;
          const stageId = params.stageId;
          // One pass over the memberships, not one query per lead: the mock
          // holds everything in memory and the board asks for this on every
          // funnel switch.
          const allowed = new Set<string>();
          for (const lead of all) {
            const memberships = await mockLeadFunnelsProvider.listEntriesByLead(lead.id);
            const matches = memberships.some(
              (e) => e.funnelId === funnelId && (!stageId || e.stageId === stageId),
            );
            if (matches) allowed.add(lead.id);
          }
          all = all.filter((l) => allowed.has(l.id));
        }
```

Se a função de listagem do mock não for `async`, torne-a `async` (o contrato já devolve `Promise`).

- [ ] **Step 4: Type-check e testes**

Run: `bunx tsc --noEmit 2>&1 | grep -E "providers/data"`
Expected: nenhum erro.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/contracts/leads.ts src/providers/data/impl/supabase/leads.ts src/providers/data/impl/mock/leads.ts
git commit -m "feat: filter leads by funnel and stage server-side

The list already fetches 1000 rows and filters everything in the browser,
with 957 leads in the base. Adding funnel as another client-side filter
would make column pagination dishonest, so the membership join happens in
Postgres."
```

---

### Task 19: Regressão de RLS

**Files:**
- Modify: `supabase/tests/rls-regression.sql`

**Interfaces:**
- Consumes: Tasks 6–8, 16

- [ ] **Step 1: Ler o padrão do arquivo existente**

Run: `head -50 supabase/tests/rls-regression.sql`
Expected: mostra como o arquivo assume papéis e afirma resultados. Siga a mesma forma nos casos novos.

- [ ] **Step 2: Acrescentar os casos**

Adicionar ao fim de `supabase/tests/rls-regression.sql`, adaptando os nomes de papel/sessão ao padrão que você acabou de ler:

```sql
-- ============================================================
-- Multi-funnel (spec 2026-07-23)
-- ============================================================

-- A seller must not read another seller's membership.
-- Expected: 0 rows.
select 'lead_funnel_entries: no cross-seller read' as case_name,
       count(*) as rows_visible
  from public.lead_funnel_entries
 where seller_id <> public.current_seller_id()
   and not public.is_staff();

-- A seller MUST still read their own membership even in a funnel they cannot
-- open — otherwise their own lead vanishes with no explanation.
-- Expected: >= 1 when the fixture places an owned lead in a restricted funnel.
select 'lead_funnel_entries: own membership in inaccessible funnel' as case_name,
       count(*) as rows_visible
  from public.lead_funnel_entries e
 where e.seller_id = public.current_seller_id()
   and e.funnel_id not in (select funnel_id from public.accessible_lead_funnel_ids(e.store_id));

-- The default funnel is reachable by everyone, with no explicit grant.
-- Expected: 1 row.
select 'accessible_lead_funnel_ids: default always in' as case_name,
       count(*) as rows_visible
  from public.accessible_lead_funnel_ids(public.current_store_id()) a
  join public.lead_funnels f on f.id = a.funnel_id
 where f.is_default;

-- A forged seller_id on insert is overwritten by the trigger: the row lands on
-- the real owner and therefore becomes invisible to the forger.
-- Expected: the inserted row's seller_id equals the lead's, not the caller's.
do $$
declare
  victim_lead uuid;
  victim_owner uuid;
  new_entry uuid;
  landed_owner uuid;
  target_funnel uuid;
  target_stage uuid;
begin
  select l.id, l.seller_id into victim_lead, victim_owner
    from public.leads l
   where l.seller_id is not null
     and l.seller_id <> coalesce(public.current_seller_id(), '00000000-0000-0000-0000-000000000000'::uuid)
   limit 1;

  if victim_lead is null then
    raise notice 'skipped: fixture has no lead owned by another seller';
    return;
  end if;

  select f.id into target_funnel from public.lead_funnels f where f.is_default limit 1;
  select s.id into target_stage from public.lead_funnel_stages s
   where s.funnel_id = target_funnel and s.kind = 'entrada' limit 1;

  insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id, store_id, seller_id)
  values (victim_lead, target_funnel, target_stage,
          '00000000-0000-0000-0000-000000000000', public.current_seller_id())
  returning id into new_entry;

  select seller_id into landed_owner from public.lead_funnel_entries where id = new_entry;

  if landed_owner is distinct from victim_owner then
    raise exception 'derive trigger failed: entry landed on % instead of %', landed_owner, victim_owner;
  end if;

  delete from public.lead_funnel_entries where id = new_entry;
end $$;

-- A membership cannot reference a stage from another funnel.
-- Expected: the composite FK raises 23503.
do $$
declare
  other_stage uuid;
  any_lead uuid;
  default_funnel uuid;
begin
  select f.id into default_funnel from public.lead_funnels f where f.is_default limit 1;
  select s.id into other_stage from public.lead_funnel_stages s
   where s.funnel_id <> default_funnel limit 1;
  select l.id into any_lead from public.leads l limit 1;

  if other_stage is null or any_lead is null then
    raise notice 'skipped: fixture has a single funnel';
    return;
  end if;

  begin
    insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id, store_id)
    values (any_lead, default_funnel, other_stage, '00000000-0000-0000-0000-000000000000');
    raise exception 'composite FK did not reject a stage from another funnel';
  exception
    when foreign_key_violation then
      raise notice 'ok: composite FK rejected the cross-funnel stage';
  end;
end $$;

-- Changing a lead's owner propagates to every membership.
do $$
declare
  moved_lead uuid;
  original_owner uuid;
  other_seller uuid;
  mismatched int;
begin
  select l.id, l.seller_id into moved_lead, original_owner
    from public.leads l where l.seller_id is not null limit 1;
  select s.id into other_seller
    from public.sellers s where s.id <> original_owner limit 1;

  if moved_lead is null or other_seller is null then
    raise notice 'skipped: fixture lacks two sellers';
    return;
  end if;

  update public.leads set seller_id = other_seller where id = moved_lead;

  select count(*) into mismatched
    from public.lead_funnel_entries
   where lead_id = moved_lead and seller_id is distinct from other_seller;

  if mismatched > 0 then
    raise exception 'sync trigger left % membership(s) on the old owner', mismatched;
  end if;

  update public.leads set seller_id = original_owner where id = moved_lead;
end $$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls-regression.sql
git commit -m "test(db): cover multi-funnel RLS and ownership invariants

Five cases, two of which guard properties that are easy to break
silently: a seller must still see their own membership inside a funnel
they cannot open, and a forged seller_id on insert must land on the
lead's real owner."
```

---

## Fechamento das Fases 1–2

- [ ] **Verificação final**

```bash
bun run test
bun run build
bunx tsc --noEmit 2>&1 | grep -E "features/funnels|providers/data/(contracts|impl)/leadFunnels" || echo "sem erros de tipo nos arquivos novos"
bun run lint
```

Expected: suíte verde, build concluído, sem erros de tipo nos arquivos criados, lint limpo.

- [ ] **Conferência manual em modo demonstração**

```bash
bun run dev
```

Abra `/app/leads`. Expected: a tela funciona exatamente como antes — o multi-funil ainda não tem interface. O que deve ter mudado: nenhum texto de estágio em cor de baixo contraste, e a borda esquerda colorida dos cards sumiu.

Abra `/design-system` e confira a grade "Identidade de funil" nos dois modos.

- [ ] **Nota para o dono**

As quatro migrations (`20260723120000`, `20260723121000`, `20260723122000`, `20260723123000`) estão **versionadas mas não aplicadas**. Aplicá-las em produção é passo separado, na ordem numérica. A de backfill é idempotente e levanta exceção se qualquer loja terminar com funil incompleto ou qualquer lead sem participação.

**Próximo plano:** Fases 3–4 (navegação com os três padrões, `?funil=` na URL, header em conformidade, remoção da barra de métricas, card enxuto, paginação por coluna, `@dnd-kit`).
