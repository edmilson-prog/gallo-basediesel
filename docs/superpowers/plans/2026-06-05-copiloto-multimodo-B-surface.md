# Copiloto Multi-Modo — Plano B: Superfície / UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar a página dedicada `/app/gestao/copiloto` com seletor de 3 modos (Foco/Histórico/Split), empty-state hero, answer card turbinado, lista de sessões, painel de detalhe, e reorganizar a entrada (sidebar + TopBar/Ctrl+K navegam; Sheet aposentado).

**Architecture:** Núcleo de conversa único (`CopilotConversation`) compartilhado pelos 3 modos; "asas" acopláveis (`CopilotSessionList`, `CopilotDetailPanel`) plugadas por modo; no mobile viram `Sheet`. Consome os hooks do Plano A (`useCopilotChat`, `useCopilotViewMode`). RNF-001 preservado (a UI só renderiza o que está em `IAnalyticsAnswer`).

**Tech Stack:** React 19 · TanStack Router · Tailwind v4 (tokens semânticos) · shadcn/ui · Iconify (`mdi:*`).

**Spec:** `docs/superpowers/specs/2026-06-05-copiloto-pagina-multimodo-design.md`

**Pré-requisito:** Plano A concluído e mergeado/na branch (`feat/copiloto-pagina-multimodo`), `bun run test` + `bun run build` verdes.

**Gate:** UI verificada por `bun run build` (vite) + teste manual do usuário (sem browser automatizado/RTL). `tsc` por **delta** (repo tem ~315 erros pré-existentes). Tokens **sempre** semânticos.

---

## Task B1: Utilitários de formatação de resposta (puros)

Helpers reusados pelo card e pelo painel de detalhe.

**Files:**
- Create: `src/features/analytics-copilot/utils/answerFormatting.ts`
- Test: `src/features/analytics-copilot/utils/__tests__/answerFormatting.test.ts`

- [ ] **Step 1: Teste (falha)**

```ts
import { describe, expect, it } from "vitest";
import type { IGoalPeriod } from "@/shared/types/bi";
import {
  formatPeriodLabel,
  scopeLabel,
  comparisonModeLabel,
  filterEntries,
} from "../answerFormatting";

const may: IGoalPeriod = {
  type: "monthly",
  start: "2026-05-01T00:00:00.000Z",
  end: "2026-05-31T23:59:59.999Z",
};

describe("answerFormatting", () => {
  it("formatPeriodLabel → mês/ano pt-BR", () => {
    expect(formatPeriodLabel(may)).toMatch(/mai.*2026/i);
  });
  it("scopeLabel reflete papel e loja", () => {
    expect(scopeLabel({ role: "Owner" })).toMatch(/Owner/);
    expect(scopeLabel({ role: "Vendedor", sellerId: "s1" })).toMatch(/Vendedor/);
  });
  it("comparisonModeLabel em pt-BR", () => {
    expect(comparisonModeLabel("previous_period")).toMatch(/anterior/i);
    expect(comparisonModeLabel("previous_year")).toMatch(/ano/i);
    expect(comparisonModeLabel(undefined)).toBe("");
  });
  it("filterEntries lista só filtros presentes", () => {
    expect(filterEntries({ marca: "Volvo" })).toEqual([{ label: "Marca", value: "Volvo" }]);
    expect(filterEntries({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `bunx vitest run src/features/analytics-copilot/utils/__tests__/answerFormatting.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/features/analytics-copilot/utils/answerFormatting.ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  ComparisonMode,
  IMetricQueryScope,
  MetricDimension,
} from "@/shared/types/analytics-copilot";

/** "mai/2026" from a period's start date. */
export function formatPeriodLabel(period: IGoalPeriod | undefined): string {
  if (!period?.start) return "—";
  const d = new Date(period.start);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
}

/** "Matriz · Owner" style scope label (text only — no numbers). */
export function scopeLabel(scope: IMetricQueryScope | undefined): string {
  if (!scope) return "—";
  const parts: string[] = [];
  if (scope.role === "Owner") parts.push("Todas as lojas");
  else if (scope.storeId) parts.push("Loja atual");
  parts.push(scope.role);
  return parts.join(" · ");
}

export function comparisonModeLabel(mode: ComparisonMode | undefined): string {
  if (mode === "previous_period") return "vs. período anterior";
  if (mode === "previous_year") return "vs. ano anterior";
  return "";
}

const DIMENSION_LABELS: Record<MetricDimension, string> = {
  vendedor: "Vendedor",
  canal: "Canal",
  categoria: "Categoria",
  marca: "Marca",
  cliente: "Cliente",
  loja: "Loja",
  tempo: "Tempo",
};

export interface IFilterEntry {
  label: string;
  value: string;
}

export function filterEntries(
  filters: Partial<Record<MetricDimension, string>> | undefined,
): IFilterEntry[] {
  if (!filters) return [];
  return (Object.entries(filters) as [MetricDimension, string][])
    .filter(([, v]) => v != null && v !== "")
    .map(([dim, value]) => ({ label: DIMENSION_LABELS[dim], value }));
}
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/utils/__tests__/answerFormatting.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/utils/answerFormatting.ts src/features/analytics-copilot/utils/__tests__/answerFormatting.test.ts
git commit -m "feat(copilot): pure answer formatting helpers (period/scope/filters)"
```

---

## Task B2: `Sparkline` (path puro + componente)

**Files:**
- Create: `src/features/analytics-copilot/components/Sparkline.tsx`
- Test: `src/features/analytics-copilot/components/__tests__/sparklinePath.test.ts`

- [ ] **Step 1: Teste do path puro (falha)**

```ts
import { describe, expect, it } from "vitest";
import { buildSparklinePath } from "../Sparkline";

describe("buildSparklinePath", () => {
  it("retorna null com menos de 2 pontos", () => {
    expect(buildSparklinePath([], 100, 24)).toBeNull();
    expect(buildSparklinePath([5], 100, 24)).toBeNull();
  });
  it("mapeia série crescente para coordenadas válidas", () => {
    const d = buildSparklinePath([0, 5, 10], 100, 24);
    expect(d).toMatch(/^M /);
    // primeiro ponto em x=0; último ponto em x=width
    expect(d!.includes("M 0")).toBe(true);
    expect(d!.includes("100")).toBe(true);
  });
  it("série constante não quebra (sem divisão por zero)", () => {
    const d = buildSparklinePath([7, 7, 7], 100, 24);
    expect(d).toMatch(/^M /);
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `bunx vitest run src/features/analytics-copilot/components/__tests__/sparklinePath.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
// src/features/analytics-copilot/components/Sparkline.tsx
import { cn } from "@/lib/utils";

/** Build an SVG path for a sparkline. Returns null when there's nothing to draw. */
export function buildSparklinePath(series: number[], width: number, height: number): string | null {
  if (!series || series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1; // avoid divide-by-zero on flat series
  const stepX = width / (series.length - 1);
  const points = series.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M ${points.join(" L ")}`;
}

interface ISparklineProps {
  series: number[];
  className?: string;
  width?: number;
  height?: number;
  /** Accessible label; when omitted the svg is aria-hidden (value already read elsewhere). */
  ariaLabel?: string;
}

/** Minimal, honest sparkline — no axes, no tooltip. Renders nothing for <2 points. */
export function Sparkline({
  series,
  className,
  width = 160,
  height = 36,
  ariaLabel,
}: ISparklineProps) {
  const d = buildSparklinePath(series, width, height);
  if (!d) return null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-9 w-full text-primary", className)}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill="currentColor" opacity={0.1} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/components/__tests__/sparklinePath.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/components/Sparkline.tsx src/features/analytics-copilot/components/__tests__/sparklinePath.test.ts
git commit -m "feat(copilot): honest sparkline component (renders only with series)"
```

---

## Task B3: Turbinar `AnalyticsAnswerCard`

**Files:**
- Modify: `src/features/analytics-copilot/components/AnalyticsAnswerCard.tsx`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Mantém os estados "recusado por escopo" e "não resolvido" intactos; turbina o estado resolvido (número herói font-mono, badge tonal, sparkline, linha de contexto, ações). Adiciona prop opcional `onAskAgain`.

```tsx
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { IAnalyticsAnswer } from "@/shared/types/analytics-copilot";
import { findMetricById } from "../catalog/metricCatalog";
import { metricIcon } from "../catalog/metricUi";
import { formatPeriodLabel, scopeLabel } from "../utils/answerFormatting";
import { Sparkline } from "./Sparkline";

interface IAnalyticsAnswerCardProps {
  answer: IAnalyticsAnswer;
  onSuggestion?: (question: string) => void;
  /** Re-run the same question (e.g. after switching store/period). */
  onAskAgain?: () => void;
}

const COUNT_METRIC_KEYS = new Set(["tickets", "abc", "positivacao", "carteira"]);

function formatPreviousValue(answer: IAnalyticsAnswer, value: number): string {
  const metricKey = answer.query ? findMetricById(answer.query.metricId)?.metricKey : undefined;
  if (metricKey && COUNT_METRIC_KEYS.has(metricKey)) return value.toLocaleString("pt-BR");
  return formatBRL(value);
}

function SuggestionChips({
  questions,
  onSuggestion,
}: {
  questions: string[];
  onSuggestion?: (question: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onSuggestion?.(question)}
          className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {question}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders a single copilot answer (RF-014/RF-016). NEVER renders a number when the
 * answer is unresolved or refused by scope (RNF-001). Resolved answers show a hero
 * number, tonal delta, optional sparkline, context line and source/drill-down.
 */
export function AnalyticsAnswerCard({ answer, onSuggestion, onAskAgain }: IAnalyticsAnswerCardProps) {
  // Refused by scope — transparent denial, never a number (RF-013).
  if (answer.refusedByScope) {
    return (
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <Icon icon="mdi:shield-lock-outline" size={18} className="mt-0.5 shrink-0" />
        <span>Você não tem acesso a esse dado.</span>
      </div>
    );
  }

  // Unresolved (honest "I don't know") — chips, never a number (RF-016).
  if (!answer.resolved) {
    const isAmbiguous = answer.ambiguous === true;
    return (
      <div className="text-sm">
        <div className="flex items-start gap-2 text-muted-foreground">
          <Icon icon="mdi:help-circle-outline" size={18} className="mt-0.5 shrink-0" />
          <span>{isAmbiguous ? "Você quer:" : "Ainda não sei responder isso."}</span>
        </div>
        <SuggestionChips questions={answer.suggestions ?? []} onSuggestion={onSuggestion} />
      </div>
    );
  }

  // Resolved with a value.
  const metric = answer.query ? findMetricById(answer.query.metricId) : undefined;
  const comparison = answer.comparison;
  let deltaDirection: "up" | "down" | "flat" = "flat";
  if (comparison) {
    if (comparison.delta > 0) deltaDirection = "up";
    else if (comparison.delta < 0) deltaDirection = "down";
  }
  const deltaIcon =
    deltaDirection === "up"
      ? "mdi:arrow-top-right"
      : deltaDirection === "down"
        ? "mdi:arrow-bottom-right"
        : "mdi:minus";
  const deltaClasses =
    deltaDirection === "up"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : deltaDirection === "down"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : "bg-muted text-muted-foreground";
  const deltaPercentLabel = comparison
    ? `${comparison.deltaPercent > 0 ? "+" : ""}${formatPercent(comparison.deltaPercent)}`
    : "";
  const directionWord =
    deltaDirection === "up" ? "em alta" : deltaDirection === "down" ? "em queda" : "estável";
  const valueSrLabel = `${metric?.label ?? "Valor"} ${answer.formattedValue ?? "—"}${
    comparison ? `, ${directionWord} ${deltaPercentLabel} versus período anterior` : ""
  }`;

  const showSparkline = answer.visual === "sparkline" && (answer.series?.length ?? 0) >= 2;

  return (
    <div className="text-sm">
      {/* Context line */}
      {metric && (
        <p className="mb-1 text-xs text-muted-foreground">
          {metric.label}
          {answer.query?.period && ` · ${formatPeriodLabel(answer.query.period)}`}
          {answer.query?.scope && ` · ${scopeLabel(answer.query.scope)}`}
        </p>
      )}

      {/* Hero value + delta */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight text-foreground">
          {answer.formattedValue ?? "—"}
        </span>
        {comparison && (
          <span
            role="status"
            aria-label={valueSrLabel}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              deltaClasses,
            )}
          >
            <Icon icon={deltaIcon} size={14} />
            {deltaPercentLabel}
          </span>
        )}
      </div>

      {comparison && (
        <p className="mt-1 text-xs text-muted-foreground">
          vs. {formatPreviousValue(answer, comparison.previousValue)} no período anterior
        </p>
      )}

      {showSparkline && (
        <div className="mt-3">
          <Sparkline series={answer.series!} />
        </div>
      )}

      {/* Footer: source + actions */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-primary/30 pt-2 text-xs">
        {answer.citation ? (
          <Link
            to={answer.citation.drillDownUrl}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon="mdi:check-decagram-outline" size={14} />
            Ver no painel {answer.citation.source.label}
            <Icon icon="mdi:arrow-right" size={14} />
          </Link>
        ) : (
          <span />
        )}
        {onAskAgain && (
          <button
            type="button"
            onClick={onAskAgain}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Perguntar de novo"
            title="Perguntar de novo"
          >
            <Icon icon="mdi:refresh" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
```

> Nota: o `metricIcon` está importado para uso futuro pelo painel; se o lint reclamar de import não usado neste arquivo, remova a linha `import { metricIcon }`. (Mantido no painel B10.)

- [ ] **Step 2: Build de delta**

Run: `bunx tsc --noEmit 2>&1 | grep "AnalyticsAnswerCard"`
Expected: nenhuma saída. (Se houver "metricIcon declarado mas não usado" via lint, remova o import.)

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/AnalyticsAnswerCard.tsx
git commit -m "feat(copilot): turbocharge answer card (hero number, sparkline, drill-down)"
```

---

## Task B4: `CopilotComposer`

**Files:**
- Create: `src/features/analytics-copilot/components/CopilotComposer.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ICopilotComposerHandle {
  focus: () => void;
}

interface ICopilotComposerProps {
  onSubmit: (question: string) => void;
  disabled?: boolean;
  /** Quick-suggestion chips shown above the field (only when there are messages). */
  chips?: string[];
  onChip?: (question: string) => void;
}

/** Sticky chat composer with an auto-resizing textarea (1→4 lines). Enter submits,
 *  Shift+Enter inserts a newline. Glass background mirrors the TopBar. */
export const CopilotComposer = forwardRef<ICopilotComposerHandle, ICopilotComposerProps>(
  function CopilotComposer({ onSubmit, disabled = false, chips = [], onChip }, ref) {
    const [draft, setDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    // Auto-resize up to ~4 lines.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [draft]);

    const submit = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || disabled) return;
      onSubmit(trimmed);
      setDraft("");
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit(draft);
      }
    };

    return (
      <div className="sticky bottom-0 border-t border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {chips.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onChip?.(chip)}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Pergunte sobre faturamento, margem, clientes…"
              aria-label="Pergunte ao copiloto"
              autoComplete="off"
              className={cn(
                "flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0"
              aria-label="Enviar pergunta"
              disabled={disabled || draft.trim().length === 0}
            >
              <Icon icon="mdi:send" size={18} />
            </Button>
          </form>
          <p className="mt-1.5 hidden text-xs text-muted-foreground sm:block">
            Respostas vêm sempre com a fonte oficial · Enter envia · ⌘K
          </p>
        </div>
      </div>
    );
  },
);
```

- [ ] **Step 2: Build de delta** → `bunx tsc --noEmit 2>&1 | grep "CopilotComposer"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/CopilotComposer.tsx
git commit -m "feat(copilot): auto-resizing sticky composer"
```

---

## Task B5: `CopilotEmptyState` (hero)

**Files:**
- Create: `src/features/analytics-copilot/components/CopilotEmptyState.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac";
import { categorizedSuggestionsForRole } from "../i18n/suggestions";

interface ICopilotEmptyStateProps {
  onPick: (question: string) => void;
}

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Premium empty state: contextual greeting + category-grouped suggestion cards.
 *  Never shows demo numbers (RNF-001). */
export function CopilotEmptyState({ onPick }: ICopilotEmptyStateProps) {
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const groups = categorizedSuggestionsForRole(role);
  const firstName = currentUser?.displayName?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,theme(colors.primary/15),transparent_70%)] motion-reduce:hidden"
          />
          <Icon icon="mdi:robot-happy-outline" size={32} />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
          {greeting(new Date().getHours())}
          {firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Sou seu copiloto analítico. Pergunte sobre seus números — respondo com o valor, a
          comparação e a fonte oficial.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.label} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <button
                  key={item.question}
                  type="button"
                  onClick={() => onPick(item.question)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon icon={item.icon} size={18} />
                  </span>
                  <span className="text-sm text-foreground">{item.question}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
```

> Se `theme(colors.primary/15)` não for suportado no setup do Tailwind v4 do projeto, trocar por uma classe utilitária equivalente (`bg-primary/10`) sem o radial — o gradiente é decorativo.

- [ ] **Step 2: Build de delta** → `bunx tsc --noEmit 2>&1 | grep "CopilotEmptyState"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/CopilotEmptyState.tsx
git commit -m "feat(copilot): premium empty-state hero with grouped suggestions"
```

---

## Task B6: `CopilotConversation` (núcleo)

**Files:**
- Create: `src/features/analytics-copilot/components/CopilotConversation.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypingIndicator } from "@/features/conversations/components/TypingIndicator";
import { useCurrentRole } from "@/features/rbac";
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";
import { suggestionsForRole } from "../i18n/suggestions";
import { AnalyticsAnswerCard } from "./AnalyticsAnswerCard";
import { CopilotComposer, type ICopilotComposerHandle } from "./CopilotComposer";
import { CopilotEmptyState } from "./CopilotEmptyState";

interface ICopilotConversationProps {
  messages: IAnalyticsMessage[];
  isThinking: boolean;
  onAsk: (question: string) => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shared conversation core used by all three view modes: scrollable log
 *  (aria-live) + empty-state hero + sticky composer. */
export function CopilotConversation({ messages, isThinking, onAsk }: ICopilotConversationProps) {
  const role = useCurrentRole();
  const composerRef = useRef<ICopilotComposerHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;
  const chips = suggestionsForRole(role).slice(0, 3);
  const lastUserQuestion = [...messages].reverse().find((m) => m.role === "user")?.text;

  // Auto-scroll to the latest message (instant under reduced-motion).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, isThinking]);

  // Focus the composer on mount.
  useEffect(() => {
    const id = window.setTimeout(() => composerRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, []);

  const submit = (question: string) => {
    onAsk(question);
    // Keep focus on the composer after sending.
    composerRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div role="log" aria-live="polite" className="mx-auto w-full max-w-3xl px-4 py-6">
          {!hasMessages ? (
            <CopilotEmptyState onPick={submit} />
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((message) =>
                message.role === "user" ? (
                  <li key={message.id} className="flex justify-end">
                    <span className="sr-only">Você:</span>
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                      {message.text}
                    </div>
                  </li>
                ) : (
                  <li key={message.id} className="flex justify-start">
                    <span className="sr-only">Copiloto:</span>
                    <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5">
                      {message.text && (
                        <p className="mb-1 text-sm text-muted-foreground">{message.text}</p>
                      )}
                      {message.answer && (
                        <AnalyticsAnswerCard
                          answer={message.answer}
                          onSuggestion={submit}
                          onAskAgain={
                            lastUserQuestion ? () => submit(lastUserQuestion) : undefined
                          }
                        />
                      )}
                    </div>
                  </li>
                ),
              )}
              {isThinking && (
                <li className="flex justify-start">
                  <span className="sr-only">Copiloto está digitando</span>
                  <TypingIndicator />
                </li>
              )}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <CopilotComposer
        ref={composerRef}
        onSubmit={submit}
        disabled={isThinking}
        chips={hasMessages ? chips : []}
        onChip={submit}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build de delta** → `bunx tsc --noEmit 2>&1 | grep "CopilotConversation"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/CopilotConversation.tsx
git commit -m "feat(copilot): shared conversation core (log + hero + composer)"
```

---

## Task B7: `CopilotViewSwitcher`

**Files:**
- Create: `src/features/analytics-copilot/components/CopilotViewSwitcher.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CopilotViewMode } from "../hooks/useCopilotViewMode";

interface ICopilotViewSwitcherProps {
  mode: CopilotViewMode;
  onChange: (mode: CopilotViewMode) => void;
  className?: string;
}

const MODES: { value: CopilotViewMode; icon: string; label: string }[] = [
  { value: "foco", icon: "mdi:card-text-outline", label: "Modo Foco — coluna única" },
  { value: "historico", icon: "mdi:history", label: "Modo Histórico — conversas salvas" },
  { value: "split", icon: "mdi:view-split-vertical", label: "Modo Split — conversa e detalhe" },
];

/** Segmented control to switch view modes. Icons + tooltips; active item elevated. */
export function CopilotViewSwitcher({ mode, onChange, className }: ICopilotViewSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as CopilotViewMode)}
      className={cn("rounded-lg bg-muted/40 p-1", className)}
      aria-label="Modo de visualização"
    >
      {MODES.map((m) => (
        <Tooltip key={m.value}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={m.value}
              aria-label={m.label}
              className={cn(
                "h-8 w-8 rounded-md text-muted-foreground",
                "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Icon icon={m.icon} size={18} />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{m.label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 2: Build de delta** → `grep "CopilotViewSwitcher"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/CopilotViewSwitcher.tsx
git commit -m "feat(copilot): view-mode switcher (ToggleGroup + tooltips)"
```

---

## Task B8: `CopilotHeader`

**Files:**
- Create: `src/features/analytics-copilot/components/CopilotHeader.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { CopilotViewMode } from "../hooks/useCopilotViewMode";
import { CopilotViewSwitcher } from "./CopilotViewSwitcher";

interface ICopilotHeaderProps {
  mode: CopilotViewMode;
  onModeChange: (mode: CopilotViewMode) => void;
  onNewSession: () => void;
  /** Mobile drawer openers (rendered only when relevant). */
  onOpenSessions?: () => void;
  onOpenDetail?: () => void;
}

/** Sticky glass header: title + Beta badge + view switcher + "Nova conversa".
 *  On mobile, exposes drawer openers for sessions/detail. */
export function CopilotHeader({
  mode,
  onModeChange,
  onNewSession,
  onOpenSessions,
  onOpenDetail,
}: ICopilotHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="mdi:robot-happy-outline" size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                Copiloto analítico
              </h1>
              <span className="hidden rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                Beta · baseado em regras
              </span>
            </div>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              Pergunte sobre faturamento, margem, clientes…
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile drawer openers */}
          {onOpenSessions && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onOpenSessions}
              aria-label="Conversas"
            >
              <Icon icon="mdi:history" size={18} />
            </Button>
          )}
          {onOpenDetail && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onOpenDetail}
              aria-label="Detalhe da resposta"
            >
              <Icon icon="mdi:dock-right" size={18} />
            </Button>
          )}

          <CopilotViewSwitcher mode={mode} onChange={onModeChange} />

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onNewSession}
            aria-label="Nova conversa"
          >
            <Icon icon="mdi:plus" size={18} />
            <span className="hidden sm:inline">Nova</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Build de delta** → `grep "CopilotHeader"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/CopilotHeader.tsx
git commit -m "feat(copilot): glass page header with switcher and new-conversation"
```

---

## Task B9: `CopilotSessionList`

**Files:**
- Create: `src/features/analytics-copilot/components/CopilotSessionList.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import type { ICopilotSessionRecord } from "../engine/sessionStore";
import { groupSessionsByDate } from "../utils/sessionGrouping";

interface ICopilotSessionListProps {
  sessions: ICopilotSessionRecord[];
  activeSessionId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

/** Preview of the last resolved answer in a session (already a motor-computed value). */
function lastResolvedPreview(session: ICopilotSessionRecord): string | null {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i]!;
    if (m.role === "assistant" && m.answer?.resolved && m.answer.formattedValue) {
      return m.answer.formattedValue;
    }
  }
  return null;
}

export function CopilotSessionList({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: ICopilotSessionListProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const groups = groupSessionsByDate(sessions);
  // A "fresh" session (empty) shouldn't count as history clutter in the empty view.
  const hasHistory = sessions.some((s) => s.messages.length > 0);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="p-3">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={onNew}>
          <Icon icon="mdi:plus" size={18} />
          Nova conversa
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!hasHistory ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon icon="mdi:history" size={24} />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">Nenhuma conversa ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">Suas perguntas ficam salvas aqui.</p>
          </div>
        ) : (
          <div className="px-2 pb-3">
            {groups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.sessions.map((session) => {
                    const active = session.id === activeSessionId;
                    const preview = lastResolvedPreview(session);
                    return (
                      <li key={session.id} className="group/item relative">
                        <button
                          type="button"
                          onClick={() => onSelect(session.id)}
                          className={cn(
                            "flex w-full flex-col gap-0.5 rounded-md border-l-2 px-3 py-2 pr-8 text-left transition-colors",
                            active
                              ? "border-primary bg-accent text-accent-foreground"
                              : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          )}
                        >
                          <span className="truncate text-sm font-medium">{session.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {formatRelativeTimeBR(session.updatedAt)}
                            {preview ? ` · ${preview}` : ""}
                          </span>
                        </button>
                        <div className="absolute right-1 top-1.5 opacity-0 focus-within:opacity-100 group-hover/item:opacity-100">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="Opções da conversa"
                              >
                                <Icon icon="mdi:dots-vertical" size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => setPendingDelete(session.id)}
                              >
                                <Icon icon="mdi:delete-outline" size={16} className="mr-2" />
                                Excluir conversa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conversa?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Build de delta** → `grep "CopilotSessionList"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/CopilotSessionList.tsx
git commit -m "feat(copilot): session list with date grouping and delete"
```

---

## Task B10: `CopilotDetailPanel`

**Files:**
- Create: `src/features/analytics-copilot/components/CopilotDetailPanel.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import type { IAnalyticsAnswer } from "@/shared/types/analytics-copilot";
import { findMetricById } from "../catalog/metricCatalog";
import { metricIcon } from "../catalog/metricUi";
import {
  comparisonModeLabel,
  filterEntries,
  formatPeriodLabel,
  scopeLabel,
} from "../utils/answerFormatting";
import { Sparkline } from "./Sparkline";

interface ICopilotDetailPanelProps {
  answer: IAnalyticsAnswer | null;
}

const COUNT_METRIC_KEYS = new Set(["tickets", "abc", "positivacao", "carteira"]);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** Pinned "fiche" of the last resolved answer (Split mode). Structured fields the
 *  inline card doesn't expand. Renders only data present in IAnalyticsAnswer (RNF-001). */
export function CopilotDetailPanel({ answer }: ICopilotDetailPanelProps) {
  if (!answer || !answer.resolved) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-card px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:chart-box-outline" size={24} />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">Sem detalhe ainda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Faça uma pergunta com resposta numérica para ver a ficha aqui.
        </p>
      </div>
    );
  }

  const metric = answer.query ? findMetricById(answer.query.metricId) : undefined;
  const comparison = answer.comparison;
  const direction = comparison ? (comparison.delta > 0 ? "up" : comparison.delta < 0 ? "down" : "flat") : "flat";
  const deltaClasses =
    direction === "up"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : direction === "down"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : "bg-muted text-muted-foreground";
  const deltaIcon =
    direction === "up" ? "mdi:arrow-top-right" : direction === "down" ? "mdi:arrow-bottom-right" : "mdi:minus";
  const deltaPercentLabel = comparison
    ? `${comparison.deltaPercent > 0 ? "+" : ""}${formatPercent(comparison.deltaPercent)}`
    : "";
  const showSparkline = answer.visual === "sparkline" && (answer.series?.length ?? 0) >= 2;
  const metricKey = metric?.metricKey;
  const prevValue =
    comparison &&
    (metricKey && COUNT_METRIC_KEYS.has(metricKey)
      ? comparison.previousValue.toLocaleString("pt-BR")
      : formatBRL(comparison.previousValue));
  const filters = filterEntries(answer.query?.filters);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-card p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Última resposta
      </p>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon icon={answer.query ? metricIcon(answer.query.metricId) : "mdi:chart-line"} size={16} />
        </span>
        <span className="text-sm font-medium text-foreground">{metric?.label ?? "Métrica"}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-4xl font-semibold tracking-tight text-foreground">
          {answer.formattedValue ?? "—"}
        </span>
        {comparison && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              deltaClasses,
            )}
          >
            <Icon icon={deltaIcon} size={14} />
            {deltaPercentLabel}
          </span>
        )}
      </div>
      {comparison && prevValue && (
        <p className="mt-1 text-xs text-muted-foreground">vs. {prevValue} no período anterior</p>
      )}

      {showSparkline && (
        <div className="mt-4">
          <Sparkline series={answer.series!} height={48} className="h-12" />
        </div>
      )}

      <dl className="mt-4 divide-y divide-border border-t border-border">
        {answer.query?.period && <Field label="Período" value={formatPeriodLabel(answer.query.period)} />}
        {answer.query?.scope && <Field label="Escopo" value={scopeLabel(answer.query.scope)} />}
        {filters.map((f) => (
          <Field key={f.label} label={f.label} value={f.value} />
        ))}
        {answer.query?.comparison && (
          <Field label="Comparação" value={comparisonModeLabel(answer.query.comparison)} />
        )}
      </dl>

      {answer.citation && (
        <div className="mt-auto pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon icon="mdi:check-decagram-outline" size={14} className="text-primary" />
            Fonte: {answer.citation.source.label} ({answer.citation.source.prd})
          </p>
          <Link
            to={answer.citation.drillDownUrl}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver no painel {answer.citation.source.label}
            <Icon icon="mdi:arrow-right" size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build de delta** → `grep "CopilotDetailPanel"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/components/CopilotDetailPanel.tsx
git commit -m "feat(copilot): split-mode detail panel (labeled fiche of last answer)"
```

---

## Task B11: `AnalyticsCopilotPage` (montagem dos 3 modos)

**Files:**
- Create: `src/features/analytics-copilot/pages/AnalyticsCopilotPage.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useCopilotChat } from "../hooks/useCopilotChat";
import { useCopilotViewMode } from "../hooks/useCopilotViewMode";
import { CopilotHeader } from "../components/CopilotHeader";
import { CopilotConversation } from "../components/CopilotConversation";
import { CopilotSessionList } from "../components/CopilotSessionList";
import { CopilotDetailPanel } from "../components/CopilotDetailPanel";

/**
 * Analytics copilot dedicated page (PRD-057 surface, multi-mode). A single
 * conversation core with acoplable wings: session list (Histórico) and detail
 * panel (Split). On mobile the wings become drawers. RNF-001 preserved upstream.
 */
export function AnalyticsCopilotPage() {
  const [mode, setMode] = useCopilotViewMode();
  const chat = useCopilotChat();
  const [sessionsSheetOpen, setSessionsSheetOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const showSessions = mode === "historico";
  const showDetail = mode === "split";

  const conversation = (
    <CopilotConversation messages={chat.messages} isThinking={chat.isThinking} onAsk={chat.ask} />
  );

  const sessionList = (
    <CopilotSessionList
      sessions={chat.sessions}
      activeSessionId={chat.activeSessionId}
      onSelect={(id) => {
        chat.selectSession(id);
        setSessionsSheetOpen(false);
      }}
      onNew={() => {
        chat.newSession();
        setSessionsSheetOpen(false);
      }}
      onDelete={chat.deleteSession}
    />
  );

  const detailPanel = <CopilotDetailPanel answer={chat.lastResolvedAnswer} />;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col md:h-[calc(100vh-4rem)]">
      <CopilotHeader
        mode={mode}
        onModeChange={setMode}
        onNewSession={chat.newSession}
        onOpenSessions={showSessions ? () => setSessionsSheetOpen(true) : undefined}
        onOpenDetail={showDetail ? () => setDetailSheetOpen(true) : undefined}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left wing: session list (Histórico) — inline on md+ */}
        {showSessions && (
          <div className="hidden w-72 shrink-0 border-r border-border md:block">{sessionList}</div>
        )}

        {/* Conversation core (always present) */}
        <div className="flex min-w-0 flex-1 flex-col">{conversation}</div>

        {/* Right wing: detail panel (Split) — inline only on xl+ */}
        {showDetail && (
          <aside className="hidden w-[360px] shrink-0 border-l border-border xl:block">
            {detailPanel}
          </aside>
        )}
      </div>

      {/* Mobile / md drawers */}
      <Sheet open={sessionsSheetOpen} onOpenChange={setSessionsSheetOpen}>
        <SheetContent side="left" className="w-80 p-0">
          {sessionList}
        </SheetContent>
      </Sheet>
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent side="right" className={cn("w-[360px] max-w-full p-0")}>
          {detailPanel}
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

> **Nota responsiva (Split em `md`–`xl`):** o painel inline só aparece em `xl+`; entre `md` e `xl` o usuário abre o `Sheet` pelo botão "Detalhe" do header. Como o botão de drawer só renderiza `md:hidden`, adicionar no header um disparo de detalhe também para `< xl`: na Task B8 o botão é `md:hidden`; se quiser o drawer entre md–xl, trocar a classe do botão de detalhe para `xl:hidden` e a do botão de sessões permanece `md:hidden`. **Decisão de implementação:** botão "Detalhe" = `xl:hidden` (aparece em mobile e em md–lg); botão "Conversas" = `md:hidden`. Ajustar a Task B8 conforme esta nota ao implementar.

- [ ] **Step 2: Build de delta** → `bunx tsc --noEmit 2>&1 | grep "AnalyticsCopilotPage"` → vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/pages/AnalyticsCopilotPage.tsx
git commit -m "feat(copilot): assemble multi-mode page (foco/historico/split + drawers)"
```

---

## Task B12: Rota + constante + item de menu

**Files:**
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/config/navigation.ts`
- Create: `src/routes/app.gestao.copiloto.tsx`
- Modify: `src/features/analytics-copilot/index.ts` (export da página)

- [ ] **Step 1: Constante de rota**

Em `routes.ts`, no bloco `// Gestão`, adicionar após `GESTAO_FORECAST`:

```ts
  GESTAO_COPILOTO: "/app/gestao/copiloto",
```

- [ ] **Step 2: Export da página no barrel**

Em `analytics-copilot/index.ts` adicionar:

```ts
export { AnalyticsCopilotPage } from "./pages/AnalyticsCopilotPage";
```

- [ ] **Step 3: Arquivo de rota**

```tsx
// src/routes/app.gestao.copiloto.tsx
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { AnalyticsCopilotPage } from "@/features/analytics-copilot";

export const Route = createFileRoute("/app/gestao/copiloto")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  component: AnalyticsCopilotPage,
});
```

- [ ] **Step 4: Item de menu**

Em `navigation.ts`, no grupo "Gestão", adicionar como **primeiro item** do array `items` (topo do grupo):

```ts
      {
        label: "Copiloto",
        icon: "mdi:robot-happy-outline",
        to: ROUTES.GESTAO_COPILOTO,
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
```

- [ ] **Step 5: Build (gera routeTree)**

Run: `bun run build`
Expected: build verde; `routeTree.gen.ts` regenerado com a rota nova (não commitar manualmente — é gerado).

- [ ] **Step 6: Commit**

```bash
git add src/features/shell/config/routes.ts src/features/shell/config/navigation.ts src/routes/app.gestao.copiloto.tsx src/features/analytics-copilot/index.ts src/routeTree.gen.ts
git commit -m "feat(copilot): add /app/gestao/copiloto route and Gestao menu item"
```

---

## Task B13: Gating do item de menu por configuração

A `Sidebar` passa a esconder o item "Copiloto" quando `analyticsCopilotEnabled === false`.

**Files:**
- Modify: `src/features/shell/components/Sidebar.tsx`

- [ ] **Step 1: Implementar o gating**

No `Sidebar.tsx`:

1. Adicionar imports:

```ts
import { ROUTES } from "@/features/shell/config/routes";
import { useCurrentStore } from "@/features/multistore";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
```

2. Dentro do componente, após obter `userRole`:

```ts
  const { currentStoreId } = useCurrentStore();
  const { settings } = usePlatformSettings(currentStoreId ?? "store-matriz");
  const copilotEnabled = settings?.analyticsCopilotEnabled !== false;
```

3. Ajustar a montagem de `groups` para filtrar o item do copiloto quando desabilitado:

```ts
  const roleGroups = filterGroupsByRole(APP_NAV_GROUPS, userRole);
  const groups = copilotEnabled
    ? roleGroups
    : roleGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.to !== ROUTES.GESTAO_COPILOTO),
        }))
        .filter((group) => group.items.length > 0);
```

(Substituir a linha atual `const groups = filterGroupsByRole(APP_NAV_GROUPS, userRole);` por esse bloco.)

- [ ] **Step 2: Build** → `bun run build` verde.

- [ ] **Step 3: Commit**

```bash
git add src/features/shell/components/Sidebar.tsx
git commit -m "feat(copilot): hide sidebar item when copilot disabled per store"
```

---

## Task B14: TopBar navega para a página + remoção do Sheet

**Files:**
- Modify: `src/features/shell/components/TopBar.tsx`

- [ ] **Step 1: Reescrever a parte do copiloto**

1. Remover o import `import { AnalyticsCopilotPanel } from "@/features/analytics-copilot";`.
2. Adicionar `import { ROUTES } from "@/features/shell/config/routes";` (se ainda não houver).
3. Remover o estado `const [copilotOpen, setCopilotOpen] = useState(false);`.
4. Trocar o efeito do `Ctrl/Cmd+K` para navegar:

```ts
  useEffect(() => {
    if (!copilotEnabled) return;
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      void navigate({ to: ROUTES.GESTAO_COPILOTO });
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [copilotEnabled, navigate]);
```

5. Trocar o `onClick` do botão do robô:

```tsx
        {copilotEnabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void navigate({ to: ROUTES.GESTAO_COPILOTO })}
            aria-label="Copiloto analítico"
            title="Copiloto (Ctrl+K)"
          >
            <Icon icon="mdi:robot-happy-outline" size={20} />
          </Button>
        )}
```

6. Remover a linha de montagem do Sheet no final:

```tsx
      {copilotEnabled && <AnalyticsCopilotPanel open={copilotOpen} onOpenChange={setCopilotOpen} />}
```

7. Se `useState` ficar sem uso no arquivo, remover do import de `react`.

- [ ] **Step 2: Build** → `bun run build` verde.

- [ ] **Step 3: Commit**

```bash
git add src/features/shell/components/TopBar.tsx
git commit -m "feat(copilot): TopBar button + Ctrl/Cmd+K navigate to copilot page"
```

---

## Task B15: Limpeza — remover Sheet antigo e hook obsoleto

**Files:**
- Delete: `src/features/analytics-copilot/components/AnalyticsCopilotPanel.tsx`
- Delete (condicional): `src/features/analytics-copilot/hooks/useAnalyticsCopilot.ts`
- Modify: `src/features/analytics-copilot/index.ts`

- [ ] **Step 1: Confirmar ausência de consumidores**

Run:
```bash
grep -rn "AnalyticsCopilotPanel\|useAnalyticsCopilot" src --include=*.tsx --include=*.ts | grep -v "analytics-copilot/index.ts"
```
Expected: nenhuma referência fora do próprio feature (o `TopBar` já foi limpo na B14). Se houver outro consumidor inesperado, **parar e reportar**.

- [ ] **Step 2: Remover arquivos**

```bash
git rm src/features/analytics-copilot/components/AnalyticsCopilotPanel.tsx
git rm src/features/analytics-copilot/hooks/useAnalyticsCopilot.ts
```

- [ ] **Step 3: Atualizar o barrel `index.ts`**

Remover as linhas:
```ts
export { AnalyticsCopilotPanel } from "./components/AnalyticsCopilotPanel";
export { useAnalyticsCopilot, type IUseAnalyticsCopilotResult } from "./hooks/useAnalyticsCopilot";
```
Manter os demais exports (catálogo, engine, novos hooks/página adicionados nos Planos A e B12).

- [ ] **Step 4: Build + testes**

Run: `bun run build` → verde.
Run: `bun run test` → verde.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/index.ts
git commit -m "chore(copilot): retire legacy Sheet panel and in-memory hook"
```

---

## Task B16: Gate final + checklist de teste manual

- [ ] **Step 1: Gate automatizado**

Run: `bun run test` → todos verdes (PRD-056/057 + novos: metricUi, suggestions, runCopilotQuery, sessionStore, sessionGrouping, normalizeViewMode, answerFormatting, sparklinePath).
Run: `bun run build` → verde (vite).
Run: `bunx tsc --noEmit 2>&1 | grep "analytics-copilot/"` → sem novos erros nos arquivos da feature (delta zero).
Run: `bun run lint` → sem erros novos nos arquivos da feature.

- [ ] **Step 2: Checklist de teste manual (usuário)**

Iniciar `bun run dev` e validar:
- [ ] Item "Copiloto" aparece no topo do grupo **Gestão** do sidebar; navega para `/app/gestao/copiloto`.
- [ ] Botão do robô na TopBar e `Ctrl/Cmd+K` **navegam** para a página (não abrem mais Sheet).
- [ ] Empty-state hero: saudação por horário + cards de sugestão por categoria; clicar dispara a pergunta.
- [ ] Resposta resolvida: número herói font-mono, badge de delta colorido, "vs período anterior", sparkline (quando houver série), "Ver no painel" navega, "perguntar de novo" repete.
- [ ] Estado "não sei" (pergunta fora do catálogo) e "recusado por escopo" (Vendedor pedindo outro vendedor) **sem número**.
- [ ] Seletor de modos: Foco / Histórico / Split alternam; escolha persiste após recarregar (localStorage).
- [ ] Histórico: "Nova conversa" cria; sessões agrupadas (Hoje/Ontem/Anteriores); excluir pede confirmação; ativa destacada.
- [ ] Split: painel mostra ficha (Período/Escopo/Filtros/Fonte) da última resposta resolvida; vazio quando não há resposta numérica.
- [ ] Mobile: conversa full-width; Histórico/Detalhe abrem como drawer pelos botões do header; composer não fica atrás do BottomNav.
- [ ] Dark mode + troca de submarca (parts/service/industrial): cores corretas (tokens), deltas verde/vermelho constantes.
- [ ] Config (Owner) desliga o copiloto → item somem do sidebar e botão da TopBar.

- [ ] **Step 3: Finalizar a branch**

Usar a skill `superpowers:finishing-a-development-branch` (criar PR para `main`). O **fechamento** (bump de versão + changelog + renomear PRDs) é feito após o merge, conforme o fluxo do projeto.

---

## Self-review do Plano B

- **Cobertura da spec:** §5 (seletor B7/B8), §6 (núcleo B6), §7 (composer B4), §8 (hero B5), §9 (card B3+B1+B2), §10 (lista B9), §11 (painel B10), §12 (responsivo B11), §13 (a11y distribuída), §14 (entrada B12/B13/B14), §15 (cleanups B15), §16 (gate B16) ✓.
- **Sem placeholders:** todo passo de código tem código ✓.
- **Consistência de tipos/assinaturas:** `CopilotViewMode` (B7/B8/B11), `IUseCopilotChat` (B11 consome `messages/isThinking/ask/sessions/activeSessionId/lastResolvedAnswer/newSession/selectSession/deleteSession` — exatamente o exposto no Plano A A9), `ICopilotComposerHandle` (B4↔B6), `AnalyticsAnswerCard` props `{answer,onSuggestion?,onAskAgain?}` (B3↔B6) ✓.
- **Pontos de atenção marcados para o implementador:** import `metricIcon` no card (remover se lint reclamar); nota responsiva do Split (botão "Detalhe" `xl:hidden` vs `md:hidden`); `theme(colors.primary/15)` com fallback; confirmar caminho de `useAnalyticsDataAccess`; checar consumidores antes de remover o hook antigo.
- **DoD:** build + testes verdes; checklist manual; PR aberto.
```
