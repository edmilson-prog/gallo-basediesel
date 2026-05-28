# Metas em lote (planejamento anual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/app/gestao/metas/lote` para Owner/Gestor criarem metas individuais por vendedor, mês a mês ao longo de um ano, editando um mês por vez.

**Architecture:** Util puro (`batchGoals.ts`) para ranges de mês, detecção de conflito e construção de `IGoal`; hook (`useBatchGoals`) que carrega vendedores + metas existentes + sugestões e gerencia a matriz `valor[vendedor][mês]`; componentes de UI (`BatchGoalsTable`) e página (`BatchGoalsPage`) que faz o submit em laço via `goalsProvider.upsert`.

**Tech Stack:** React + TypeScript (strict), TanStack Router (file-based), TanStack Query, Tailwind v4 + shadcn/ui, Iconify, sonner (toasts). Sem runner de testes — verificação por `bunx tsc --noEmit` + teste manual de UI.

---

## Notas de contexto (ler antes de começar)

- **Branch:** `feat/metas-lote-anual` (já criada a partir de `fix/metas-nested-routes`, que contém o fix do `<Outlet/>` necessário para a rota filha funcionar). Não trocar de branch.
- **Sem runner de testes.** `bun run build` é só `vite build` (sem type-check). Type-check real: `bunx tsc --noEmit`. Há erros pré-existentes em arquivos não relacionados — ignore-os; garanta apenas que os arquivos desta feature não introduzam erros novos.
- **Provider de metas:** `useGoalsProvider().upsert(goal: IGoal): Promise<IGoal>` (cria/atualiza). `useGoalsWithProgress({ storeId, statuses })` → `{ items: { goal: IGoal }[], isLoading, hasError }`.
- **Vendedores:** `useSellersProvider().list({ storeId, active: true }): Promise<ISeller[]>`. `ISeller` tem `id` e **`fullName`** (NÃO `name`).
- **Sugestão:** `suggestTarget({ metric, level, storeId, sellerId, allGoals }): { suggestedTarget: number, ... }` em `src/features/goals/engine/suggestion.ts`.
- **Conflito (referência):** `findDuplicateGoal` (privado em `src/features/goals/utils/validation.ts`) checa: status `ativa`, mesma `metric`, mesmo `level`, mesma loja, `targetId === sellerId` (individual), `period.type` igual, e **sobreposição** `draftStart <= g.period.end && draftEnd >= g.period.start`. Vamos replicar isso por mês no util.
- **Shape do `IGoal` ao criar** (espelhar `NewGoalPage.handleSubmit`): `{ id, storeId, level, targetId, sellerId?, period:{type,start,end}, metric, targetValue, currentValue:0, progressPercent:0, division:"parts", name, status, rewardDescription?, createdBy, createdAt, updatedAt }`.
- **Auth/escopo:** `useAuth()` → `{ userRole, currentUser }`; `useCurrentStore()` → `{ currentStore }`; `useAccessibleStores()` → lojas (Owner). Gestor travado na própria loja.
- **Labels de métrica:** `GOAL_METRIC_LABEL`, `PRIMARY_GOAL_METRICS`, `SECONDARY_GOAL_METRICS` em `src/features/goals/utils/labels.ts`.
- **Audit:** `recordAuditLogSync({ actorId, action, resource, resourceId, storeId })` de `@/providers/data`.
- Spec: `docs/superpowers/specs/2026-05-28-metas-lote-anual-design.md`.

## File Structure

- **Create** `src/features/goals/utils/batchGoals.ts` — funções puras: `monthRangeISO`, `monthlyGoalName`, `detectMonthConflict`, `buildMonthlyGoal`, `MONTH_LABELS`.
- **Create** `src/features/goals/hooks/useBatchGoals.ts` — estado da matriz, seleção, escopo, conflitos, sugestões, contadores derivados, `buildGoalsToCreate`.
- **Create** `src/features/goals/components/BatchGoalsTable.tsx` — tabela do mês selecionado (linhas de vendedor).
- **Create** `src/features/goals/pages/BatchGoalsPage.tsx` — composição: params, abas de mês, barra de ações, tabela, rodapé, submit.
- **Create** `src/routes/app.gestao.metas.lote.tsx` — rota (guard Owner/Gestor).
- **Modify** `src/features/goals/components/AggregatedGoalsDashboard.tsx` — botão "Meta em lote".
- **Modify** `src/features/goals/i18n/pt-BR.ts` — strings.

---

### Task 1: i18n strings

**Files:**
- Modify: `src/features/goals/i18n/pt-BR.ts`

- [ ] **Step 1: Adicionar chaves**

Abrir o arquivo, localizar o objeto `GOALS_STRINGS` e inserir, antes do fechamento `} as const;` (ou em seção coerente), as chaves abaixo. Manter acentuação UTF-8 correta:

```ts
  // Batch annual goals (metas em lote)
  batchCta: "Meta em lote",
  batchTitle: "Metas em lote — planejamento anual",
  batchSubtitle:
    "Defina a meta de cada vendedor mês a mês. Edite um mês por vez; o total anual é atualizado conforme você preenche.",
  batchSharedParams: "Parâmetros compartilhados",
  batchStore: "Loja",
  batchMetric: "Métrica",
  batchYear: "Ano",
  batchReward: "Recompensa (opcional)",
  batchRewardPlaceholder: "Ex.: bônus trimestral...",
  batchMonth: "Mês",
  batchMonthHint: (filled: number) =>
    `${filled} de 12 meses preenchidos. "Aplicar em" define se as ações agem só neste mês ou no ano todo.`,
  batchScopeLabel: "Aplicar em",
  batchScopeMonth: "Este mês",
  batchScopeYear: "Ano todo",
  batchBaseValue: "Valor-base",
  batchApplyBase: "Aplicar valor-base",
  batchSuggest: "Sugerir",
  batchColSeller: "Vendedor",
  batchColMonthTarget: (month: string) => `Meta de ${month}`,
  batchColSuggestion: "Sugestão",
  batchColAnnualTotal: "Total anual",
  batchColStatus: "Status (mês)",
  batchAnnualMonths: (n: number) => `${n}/12 meses`,
  batchRowWillCreate: "será criada",
  batchRowEmpty: "vazio — ignorado",
  batchRowConflict: (month: string) => `já tem meta em ${month}`,
  batchSellersCount: (n: number) => `Vendedores (${n} ativos)`,
  batchSummary: (created: number, skipped: number, total: string) =>
    `${created} metas mensais serão criadas${skipped ? ` · ${skipped} puladas por conflito` : ""} · total anual ${total}`,
  batchCreate: (n: number) => `Criar ${n} metas do ano`,
  batchSaveDraft: "Salvar rascunho",
  batchCreateSuccess: (created: number, skipped: number) =>
    `${created} metas criadas${skipped ? `, ${skipped} puladas` : ""}.`,
  batchCreatePartial: (created: number, failed: number) =>
    `${created} metas criadas, ${failed} falharam.`,
  batchEmptyState: "Selecione vendedores e preencha ao menos um mês para criar metas.",
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "goals/i18n/pt-BR"`
Expected: nenhuma saída (sem erros novos nesse arquivo).

- [ ] **Step 3: Commit**

```bash
git add src/features/goals/i18n/pt-BR.ts
git commit -m "feat(goals): add i18n strings for batch annual goals"
```

---

### Task 2: Util puro `batchGoals.ts`

**Files:**
- Create: `src/features/goals/utils/batchGoals.ts`

- [ ] **Step 1: Criar o arquivo**

```ts
import type { GoalMetric, GoalStatus, ID, IGoal } from "@/shared/types";
import { GOAL_METRIC_LABEL } from "./labels";

/** pt-BR month abbreviations, index 0 = January. */
export const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

/** Full pt-BR month names for goal naming, index 0 = January. */
const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** ISO start (day 1, 00:00) and end (last day, 23:59:59.999) of a month. */
export function monthRangeISO(year: number, monthIdx: number): { startIso: string; endIso: string } {
  const start = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Auto goal name, e.g. "Faturamento mensal — Junho 2026". */
export function monthlyGoalName(metric: GoalMetric, year: number, monthIdx: number): string {
  return `${GOAL_METRIC_LABEL[metric]} mensal — ${MONTH_FULL[monthIdx]} ${year}`;
}

export interface IConflictArgs {
  existingGoals: IGoal[];
  storeId: ID;
  sellerId: ID;
  metric: GoalMetric;
  year: number;
  monthIdx: number;
}

/**
 * True when an active individual monthly goal already overlaps this month for the
 * same seller + metric. Mirrors findDuplicateGoal's overlap rule in validation.ts.
 */
export function detectMonthConflict(args: IConflictArgs): boolean {
  const { startIso, endIso } = monthRangeISO(args.year, args.monthIdx);
  const start = new Date(startIso);
  const end = new Date(endIso);
  return args.existingGoals.some((g) => {
    if ((g.status ?? "ativa") !== "ativa") return false;
    if (g.metric !== args.metric) return false;
    if (g.level !== "individual") return false;
    if (g.storeId !== args.storeId) return false;
    if (g.targetId !== args.sellerId) return false;
    const overlapStart = start <= new Date(g.period.end);
    const overlapEnd = end >= new Date(g.period.start);
    return overlapStart && overlapEnd;
  });
}

export interface IBuildMonthlyGoalArgs {
  storeId: ID;
  sellerId: ID;
  metric: GoalMetric;
  year: number;
  monthIdx: number;
  targetValue: number;
  rewardDescription?: string;
  status: GoalStatus;
  createdBy: ID;
}

/** Build a full IGoal for one (seller, month) cell. */
export function buildMonthlyGoal(args: IBuildMonthlyGoalArgs): IGoal {
  const { startIso, endIso } = monthRangeISO(args.year, args.monthIdx);
  const nowIso = new Date().toISOString();
  return {
    id: `goal-${args.year}-${String(args.monthIdx + 1).padStart(2, "0")}-${args.sellerId}-${args.metric}-${Date.now()}`,
    storeId: args.storeId,
    level: "individual",
    targetId: args.sellerId,
    sellerId: args.sellerId,
    period: { type: "monthly", start: startIso, end: endIso },
    metric: args.metric,
    targetValue: args.targetValue,
    currentValue: 0,
    progressPercent: 0,
    division: "parts",
    name: monthlyGoalName(args.metric, args.year, args.monthIdx),
    status: args.status,
    rewardDescription: args.rewardDescription,
    createdBy: args.createdBy,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
```

- [ ] **Step 2: Verificar tipos do `IGoal` e `GoalStatus`**

Confirmar via `src/shared/types/bi.ts` que `IGoal` tem exatamente os campos usados acima (`targetId`, `sellerId?`, `period`, `division`, `status?`, `createdBy?`, etc.) e que `GoalStatus` inclui `"ativa"` e `"arquivada"`. Se algum nome divergir, ajustar. (Referência: `NewGoalPage.handleSubmit` usa exatamente esse shape.)

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "utils/batchGoals"`
Expected: nenhuma saída.

- [ ] **Step 4: Commit**

```bash
git add src/features/goals/utils/batchGoals.ts
git commit -m "feat(goals): add pure helpers for batch monthly goals"
```

---

### Task 3: Hook `useBatchGoals.ts`

**Files:**
- Create: `src/features/goals/hooks/useBatchGoals.ts`

- [ ] **Step 1: Criar o hook**

```ts
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GoalMetric, GoalStatus, ID, IGoal, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { suggestTarget } from "../engine/suggestion";
import { useGoalsWithProgress } from "./useGoalsWithProgress";
import { buildMonthlyGoal, detectMonthConflict } from "../utils/batchGoals";

const STALE_MS = 30_000;

export interface IBatchSeller {
  id: ID;
  name: string;
}

export interface IUseBatchGoalsParams {
  storeId: ID;
  metric: GoalMetric;
  year: number;
}

export interface IBuildGoalsOpts {
  status: GoalStatus;
  rewardDescription?: string;
  createdBy: ID;
}

export interface IUseBatchGoalsResult {
  isLoading: boolean;
  sellers: IBatchSeller[];
  getValue: (sellerId: ID, monthIdx: number) => number | null;
  setValue: (sellerId: ID, monthIdx: number, value: number | null) => void;
  isChecked: (sellerId: ID) => boolean;
  setChecked: (sellerId: ID, value: boolean) => void;
  setAllChecked: (value: boolean) => void;
  hasConflict: (sellerId: ID, monthIdx: number) => boolean;
  suggestionFor: (sellerId: ID) => number;
  annualTotal: (sellerId: ID) => number;
  filledMonths: (sellerId: ID) => number;
  monthHasValue: (monthIdx: number) => boolean;
  /** Fill `months` with `value` for all non-conflicting cells of checked sellers. */
  applyValue: (value: number, months: number[]) => void;
  /** Fill `months` with each seller's suggestion for non-conflicting cells of checked sellers. */
  applySuggestion: (months: number[]) => void;
  createCount: number;
  skippedCount: number;
  annualGrandTotal: number;
  buildGoalsToCreate: (opts: IBuildGoalsOpts) => IGoal[];
}

export function useBatchGoals(params: IUseBatchGoalsParams): IUseBatchGoalsResult {
  const { storeId, metric, year } = params;
  const sellersProvider = useSellersProvider();

  const sellersQuery = useQuery({
    queryKey: ["batch-goals", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: STALE_MS,
  });

  const goals = useGoalsWithProgress({ storeId, statuses: ["ativa"] });

  const sellers = useMemo<IBatchSeller[]>(
    () => (sellersQuery.data ?? []).map((s: ISeller) => ({ id: s.id, name: s.fullName })),
    [sellersQuery.data],
  );

  const existingGoals = useMemo<IGoal[]>(
    () => goals.items.map((i) => i.goal),
    [goals.items],
  );

  // value[sellerId] = (number|null)[12]
  const [values, setValues] = useState<Record<ID, (number | null)[]>>({});
  const [unchecked, setUnchecked] = useState<Set<ID>>(new Set());

  const getValue = useCallback(
    (sellerId: ID, m: number): number | null => values[sellerId]?.[m] ?? null,
    [values],
  );

  const setValue = useCallback((sellerId: ID, m: number, value: number | null) => {
    setValues((prev) => {
      const row = prev[sellerId] ? [...prev[sellerId]] : Array<number | null>(12).fill(null);
      row[m] = value;
      return { ...prev, [sellerId]: row };
    });
  }, []);

  const isChecked = useCallback((sellerId: ID) => !unchecked.has(sellerId), [unchecked]);
  const setChecked = useCallback((sellerId: ID, value: boolean) => {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (value) next.delete(sellerId);
      else next.add(sellerId);
      return next;
    });
  }, []);
  const setAllChecked = useCallback(
    (value: boolean) => setUnchecked(value ? new Set() : new Set(sellers.map((s) => s.id))),
    [sellers],
  );

  const hasConflict = useCallback(
    (sellerId: ID, monthIdx: number) =>
      detectMonthConflict({ existingGoals, storeId, sellerId, metric, year, monthIdx }),
    [existingGoals, storeId, metric, year],
  );

  const suggestions = useMemo<Record<ID, number>>(() => {
    const out: Record<ID, number> = {};
    for (const s of sellers) {
      out[s.id] = suggestTarget({
        metric,
        level: "individual",
        storeId,
        sellerId: s.id,
        allGoals: existingGoals,
      }).suggestedTarget;
    }
    return out;
  }, [sellers, metric, storeId, existingGoals]);

  const suggestionFor = useCallback((sellerId: ID) => suggestions[sellerId] ?? 0, [suggestions]);

  const annualTotal = useCallback(
    (sellerId: ID) => (values[sellerId] ?? []).reduce((a, v) => a + (v ?? 0), 0),
    [values],
  );
  const filledMonths = useCallback(
    (sellerId: ID) => (values[sellerId] ?? []).filter((v) => v != null).length,
    [values],
  );
  const monthHasValue = useCallback(
    (monthIdx: number) => sellers.some((s) => getValue(s.id, monthIdx) != null),
    [sellers, getValue],
  );

  const applyValue = useCallback(
    (value: number, months: number[]) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const s of sellers) {
          if (unchecked.has(s.id)) continue;
          const row = next[s.id] ? [...next[s.id]] : Array<number | null>(12).fill(null);
          for (const m of months) {
            if (!hasConflict(s.id, m)) row[m] = value;
          }
          next[s.id] = row;
        }
        return next;
      });
    },
    [sellers, unchecked, hasConflict],
  );

  const applySuggestion = useCallback(
    (months: number[]) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const s of sellers) {
          if (unchecked.has(s.id)) continue;
          const sugg = suggestions[s.id] ?? 0;
          const row = next[s.id] ? [...next[s.id]] : Array<number | null>(12).fill(null);
          for (const m of months) {
            if (!hasConflict(s.id, m)) row[m] = sugg;
          }
          next[s.id] = row;
        }
        return next;
      });
    },
    [sellers, unchecked, suggestions, hasConflict],
  );

  const { createCount, skippedCount, annualGrandTotal } = useMemo(() => {
    let created = 0;
    let skipped = 0;
    let total = 0;
    for (const s of sellers) {
      if (unchecked.has(s.id)) continue;
      for (let m = 0; m < 12; m += 1) {
        if (hasConflict(s.id, m)) {
          skipped += 1;
          continue;
        }
        const v = getValue(s.id, m);
        if (v != null) {
          created += 1;
          total += v;
        }
      }
    }
    return { createCount: created, skippedCount: skipped, annualGrandTotal: total };
  }, [sellers, unchecked, hasConflict, getValue]);

  const buildGoalsToCreate = useCallback(
    (opts: IBuildGoalsOpts): IGoal[] => {
      const out: IGoal[] = [];
      for (const s of sellers) {
        if (unchecked.has(s.id)) continue;
        for (let m = 0; m < 12; m += 1) {
          if (hasConflict(s.id, m)) continue;
          const v = getValue(s.id, m);
          if (v == null || v <= 0) continue;
          out.push(
            buildMonthlyGoal({
              storeId,
              sellerId: s.id,
              metric,
              year,
              monthIdx: m,
              targetValue: v,
              rewardDescription: opts.rewardDescription,
              status: opts.status,
              createdBy: opts.createdBy,
            }),
          );
        }
      }
      return out;
    },
    [sellers, unchecked, hasConflict, getValue, storeId, metric, year],
  );

  return {
    isLoading: sellersQuery.isLoading || goals.isLoading,
    sellers,
    getValue,
    setValue,
    isChecked,
    setChecked,
    setAllChecked,
    hasConflict,
    suggestionFor,
    annualTotal,
    filledMonths,
    monthHasValue,
    applyValue,
    applySuggestion,
    createCount,
    skippedCount,
    annualGrandTotal,
    buildGoalsToCreate,
  };
}
```

- [ ] **Step 2: Corrigir import de hooks do React**

`useCallback`/`useMemo`/`useState` vêm de `"react"`. Ajustar a primeira linha para `import { useCallback, useMemo, useState } from "react";` (sem o `useCallback` capitalizado errado se o editor reclamar — o nome correto é `useCallback`).

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "hooks/useBatchGoals"`
Expected: nenhuma saída. Se `useGoalsWithProgress` retornar shape diferente de `{ items: { goal }[] , isLoading }`, ajustar (confirmado em `useGoalsWithProgress.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/features/goals/hooks/useBatchGoals.ts
git commit -m "feat(goals): add useBatchGoals state hook"
```

---

### Task 4: Componente `BatchGoalsTable.tsx`

**Files:**
- Create: `src/features/goals/components/BatchGoalsTable.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import type { ID } from "@/shared/types";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { MONTH_LABELS } from "../utils/batchGoals";
import type { IUseBatchGoalsResult } from "../hooks/useBatchGoals";

function parseBRL(input: string): number | null {
  const digits = String(input).replace(/[^\d]/g, "");
  if (digits === "") return null;
  return Number(digits) / 100;
}

export interface IBatchGoalsTableProps {
  ctl: IUseBatchGoalsResult;
  monthIdx: number;
}

export function BatchGoalsTable({ ctl, monthIdx }: IBatchGoalsTableProps) {
  const monthLabel = MONTH_LABELS[monthIdx];
  const allChecked = ctl.sellers.every((s) => ctl.isChecked(s.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-9 p-2.5 text-left">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => ctl.setAllChecked(e.target.checked)}
                className="size-4 accent-primary"
              />
            </th>
            <th className="p-2.5 text-left font-semibold">{S.batchColSeller}</th>
            <th className="p-2.5 text-right font-semibold">{S.batchColMonthTarget(monthLabel)}</th>
            <th className="w-28 p-2.5 text-right font-semibold">{S.batchColSuggestion}</th>
            <th className="w-36 p-2.5 text-right font-semibold">{S.batchColAnnualTotal}</th>
            <th className="w-44 p-2.5 text-left font-semibold">{S.batchColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {ctl.sellers.map((s) => {
            const conflict = ctl.hasConflict(s.id, monthIdx);
            const value = ctl.getValue(s.id, monthIdx);
            const initials = s.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <tr key={s.id} className={cn("border-b border-border", conflict && "opacity-55")}>
                <td className="p-2.5">
                  <input
                    type="checkbox"
                    checked={ctl.isChecked(s.id)}
                    disabled={conflict}
                    onChange={(e) => ctl.setChecked(s.id, e.target.checked)}
                    className="size-4 accent-primary"
                  />
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                      {initials}
                    </span>
                    {s.name}
                  </div>
                </td>
                <td className="p-2.5 text-right">
                  <input
                    className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-right tabular-nums disabled:opacity-50"
                    placeholder="—"
                    disabled={conflict}
                    defaultValue={value != null ? formatBRL(value) : ""}
                    onBlur={(e) => ctl.setValue(s.id, monthIdx, parseBRL(e.target.value))}
                  />
                </td>
                <td className="p-2.5 text-right">
                  <button
                    type="button"
                    disabled={conflict}
                    onClick={() => ctl.setValue(s.id, monthIdx, ctl.suggestionFor(s.id))}
                    className="text-xs text-sky-500 tabular-nums hover:underline disabled:opacity-50"
                  >
                    {formatBRL(ctl.suggestionFor(s.id))}
                  </button>
                </td>
                <td className="p-2.5 text-right">
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatBRL(ctl.annualTotal(s.id))}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {S.batchAnnualMonths(ctl.filledMonths(s.id))}
                  </span>
                </td>
                <td className="p-2.5">
                  {conflict ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-500">
                      <Icon icon="mdi:alert-outline" size={12} />
                      {S.batchRowConflict(monthLabel)}
                    </span>
                  ) : value != null ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary">
                      <Icon icon="mdi:check" size={12} />
                      {S.batchRowWillCreate}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{S.batchRowEmpty}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

> Nota: o input usa `defaultValue` + `onBlur` (não controlado) com `key`-remount por mês via o `monthIdx` no componente pai (ver Task 5, a tabela é remontada ao trocar de mês passando `key={monthIdx}`), para o valor exibido refletir o mês atual sem cursor jumps.

- [ ] **Step 2: Verificar imports (`cn`, `formatBRL`, `Icon`)**

Run: `bunx tsc --noEmit 2>&1 | grep "BatchGoalsTable"`
Expected: nenhuma saída. Confirmar caminhos `@/lib/utils` (cn), `@/shared/utils/format` (formatBRL), `@/components/Icon`.

- [ ] **Step 3: Commit**

```bash
git add src/features/goals/components/BatchGoalsTable.tsx
git commit -m "feat(goals): add BatchGoalsTable component"
```

---

### Task 5: Página `BatchGoalsPage.tsx`

**Files:**
- Create: `src/features/goals/pages/BatchGoalsPage.tsx`

- [ ] **Step 1: Criar a página**

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/features/shell/layouts";
import { useAuth } from "@/features/auth/useAuth";
import { useAccessibleStores, useCurrentStore } from "@/features/multistore";
import { recordAuditLogSync, useGoalsProvider } from "@/providers/data";
import type { GoalMetric, ID } from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { GOAL_METRIC_LABEL, PRIMARY_GOAL_METRICS, SECONDARY_GOAL_METRICS } from "../utils/labels";
import { MONTH_LABELS } from "../utils/batchGoals";
import { useBatchGoals } from "../hooks/useBatchGoals";
import { BatchGoalsTable } from "../components/BatchGoalsTable";

const ALL_METRICS: GoalMetric[] = [...PRIMARY_GOAL_METRICS, ...SECONDARY_GOAL_METRICS];

function parseBRL(input: string): number {
  const digits = String(input).replace(/[^\d]/g, "");
  return digits === "" ? 0 : Number(digits) / 100;
}

export function BatchGoalsPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const accessibleStores = useAccessibleStores();
  const goalsProvider = useGoalsProvider();

  const isOwner = userRole === "Owner";
  const defaultStoreId = currentStore?.id ?? "store-matriz";

  const [storeId, setStoreId] = useState<ID>(defaultStoreId);
  const [metric, setMetric] = useState<GoalMetric>("revenue");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [reward, setReward] = useState("");
  const [scope, setScope] = useState<"month" | "year">("month");
  const [baseValue, setBaseValue] = useState("R$ 150.000,00");
  const [monthIdx, setMonthIdx] = useState<number>(new Date().getMonth());
  const [submitting, setSubmitting] = useState(false);

  const ctl = useBatchGoals({ storeId, metric, year });

  const filledMonthsCount = useMemo(
    () => MONTH_LABELS.filter((_, i) => ctl.monthHasValue(i)).length,
    [ctl],
  );

  const targetMonths = () => (scope === "year" ? Array.from({ length: 12 }, (_, i) => i) : [monthIdx]);

  const handleSubmit = async (status: "ativa" | "arquivada") => {
    const goals = ctl.buildGoalsToCreate({
      status,
      rewardDescription: reward.trim() || undefined,
      createdBy: currentUser?.sellerId ?? currentUser?.id ?? "system",
    });
    if (goals.length === 0) {
      toast.error(S.batchEmptyState);
      return;
    }
    setSubmitting(true);
    let created = 0;
    let failed = 0;
    for (const goal of goals) {
      try {
        await goalsProvider.upsert(goal);
        recordAuditLogSync({
          actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
          action: "goal_create",
          resource: "goal",
          resourceId: goal.id,
          storeId,
        });
        created += 1;
      } catch {
        failed += 1;
      }
    }
    setSubmitting(false);
    if (failed > 0) toast.warning(S.batchCreatePartial(created, failed));
    else toast.success(S.batchCreateSuccess(created, ctl.skippedCount));
    void navigate({ to: "/app/gestao/metas" });
  };

  const yearOptions = [new Date().getFullYear(), new Date().getFullYear() + 1];

  return (
    <DashboardLayout>
      <div className="mb-2 text-xs text-muted-foreground">Gestão / Metas / Meta em lote</div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
        <Icon icon="mdi:target" size={26} className="text-primary" />
        {S.batchTitle}
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">{S.batchSubtitle}</p>

      {/* Shared params */}
      <Card className="mb-4 p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.batchSharedParams}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchStore}</Label>
            <Select value={storeId} onValueChange={(v) => setStoreId(v)} disabled={!isOwner}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(isOwner ? accessibleStores : accessibleStores.filter((s) => s.id === storeId)).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchMetric}</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as GoalMetric)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_METRICS.map((m) => (
                  <SelectItem key={m} value={m}>{GOAL_METRIC_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchYear}</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchReward}</Label>
            <Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder={S.batchRewardPlaceholder} />
          </div>
        </div>
      </Card>

      {/* Month nav + table */}
      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.batchMonth} <span className="text-primary">{MONTH_LABELS[monthIdx]}/{year}</span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {MONTH_LABELS.map((m, i) => {
            const filled = ctl.monthHasValue(i);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMonthIdx(i)}
                className={cn(
                  "relative w-[72px] rounded-md border px-0 py-2 text-xs font-semibold transition-colors",
                  i === monthIdx ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground",
                )}
              >
                {m}
                <span className={cn("absolute right-1.5 top-1.5 size-1.5 rounded-full", filled ? "bg-primary" : "bg-muted")} />
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{S.batchMonthHint(filledMonthsCount)}</p>

        {/* Action bar */}
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-dashed border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchScopeLabel}</Label>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button type="button" onClick={() => setScope("month")} className={cn("px-3.5 py-2 text-xs font-semibold", scope === "month" ? "bg-primary/10 text-foreground" : "bg-background text-muted-foreground")}>{S.batchScopeMonth}</button>
              <button type="button" onClick={() => setScope("year")} className={cn("px-3.5 py-2 text-xs font-semibold", scope === "year" ? "bg-primary/10 text-foreground" : "bg-background text-muted-foreground")}>{S.batchScopeYear}</button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchBaseValue}</Label>
            <Input className="w-40 text-right tabular-nums" value={baseValue} onChange={(e) => setBaseValue(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => ctl.applyValue(parseBRL(baseValue), targetMonths())}>
            {S.batchApplyBase}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-sky-500" onClick={() => ctl.applySuggestion(targetMonths())}>
            <Icon icon="mdi:auto-fix" size={15} />
            {S.batchSuggest}
          </Button>
        </div>

        <div className="mt-4">
          <BatchGoalsTable key={monthIdx} ctl={ctl} monthIdx={monthIdx} />
        </div>
      </Card>

      {/* Footer */}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-t from-background to-transparent pt-3">
        <p className="text-sm text-muted-foreground">
          {S.batchSummary(ctl.createCount, ctl.skippedCount, formatBRL(ctl.annualGrandTotal))}
        </p>
        <div className="flex gap-2.5">
          <Button variant="outline" size="sm" disabled={submitting} onClick={() => handleSubmit("arquivada")}>
            {S.batchSaveDraft}
          </Button>
          <Button size="sm" disabled={submitting || ctl.createCount === 0} onClick={() => handleSubmit("ativa")}>
            {S.batchCreate(ctl.createCount)}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Verificar componentes shadcn e hooks de multistore**

Confirmar imports/exports: `@/components/ui/input` (Input), `@/components/ui/label` (Label), `@/components/ui/select` (Select…), `useAccessibleStores`/`useCurrentStore` de `@/features/multistore` (ver uso em `NewGoalPage.tsx`). Ajustar caminhos se divergirem. `accessibleStores` é `IStore[]` com `.id` e `.name`.

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "BatchGoalsPage"`
Expected: nenhuma saída.

- [ ] **Step 4: Commit**

```bash
git add src/features/goals/pages/BatchGoalsPage.tsx
git commit -m "feat(goals): add BatchGoalsPage with shared params, month tabs and submit"
```

---

### Task 6: Rota `/app/gestao/metas/lote` + botão no dashboard

**Files:**
- Create: `src/routes/app.gestao.metas.lote.tsx`
- Modify: `src/features/goals/components/AggregatedGoalsDashboard.tsx`
- Modify (gerado): `src/routeTree.gen.ts`

- [ ] **Step 1: Criar a rota**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { BatchGoalsPage } from "@/features/goals/pages/BatchGoalsPage";

export const Route = createFileRoute("/app/gestao/metas/lote")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: BatchGoalsPage,
});
```

- [ ] **Step 2: Exportar `BatchGoalsPage` no barrel (se aplicável)**

Verificar `src/features/goals/index.ts`: se `GoalsPage`/`NewGoalPage` são exportados de lá, adicionar `export { BatchGoalsPage } from "./pages/BatchGoalsPage";`. Se a rota importa direto de `pages/`, este passo é dispensável (a rota acima importa direto — ok manter direto).

- [ ] **Step 3: Adicionar o botão "Meta em lote" no header do dashboard**

Em `src/features/goals/components/AggregatedGoalsDashboard.tsx`, localizar o bloco do botão "Nova meta":

```tsx
        {canCreate && (
          <Button asChild size="sm" className="gap-1">
            <Link to="/app/gestao/metas/nova">
              <Icon icon="mdi:plus" size={16} />
              {S.createCta}
            </Link>
          </Button>
        )}
```

Substituir por (envolvendo os dois botões num flex):

```tsx
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/app/gestao/metas/lote">
                <Icon icon="mdi:account-multiple-plus-outline" size={16} />
                {S.batchCta}
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-1">
              <Link to="/app/gestao/metas/nova">
                <Icon icon="mdi:plus" size={16} />
                {S.createCta}
              </Link>
            </Button>
          </div>
        )}
```

- [ ] **Step 4: Regenerar routeTree e validar build**

Run: `bun run build`
Expected: build conclui (`✓ built`). Isso regenera `src/routeTree.gen.ts` com a rota `/app/gestao/metas/lote` como filha de `AppGestaoMetasRoute`.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -E "metas.lote|AggregatedGoalsDashboard"`
Expected: nenhuma saída.

- [ ] **Step 6: Commit**

```bash
git add src/routes/app.gestao.metas.lote.tsx src/features/goals/components/AggregatedGoalsDashboard.tsx src/routeTree.gen.ts src/features/goals/index.ts
git commit -m "feat(goals): add batch goals route and dashboard entry button"
```

(Se `src/features/goals/index.ts` não foi alterado, removê-lo do `git add`.)

---

### Task 7: Verificação manual

- [ ] **Step 1: Subir o dev server**

Run: `bun run dev`
O usuário valida em `/app/gestao/metas`:
- Botão **"Meta em lote"** aparece (Owner/Gestor) ao lado de "Nova meta" e abre `/app/gestao/metas/lote`.
- Página: params compartilhados; abas Jan–Dez (um mês por vez; dots ao preencher); tabela com valor/mês, sugestão clicável, total anual; conflito por mês esmaecido + badge.
- Barra: escopo "Este mês/Ano todo"; "Aplicar valor-base" e "✨ Sugerir" respeitam o escopo e pulam conflitos.
- Rodapé: resumo dinâmico; "Criar N metas do ano" cria as metas (toast) e volta para a lista; "Salvar rascunho" cria como `arquivada`.
- Após criar, conferir na lista de Metas que as metas mensais individuais apareceram.
- Papéis: Gestor travado na própria loja; Vendedor não acessa `/lote` (redireciona).

- [ ] **Step 2: Ajustes**

Corrigir o que aparecer (formatação monetária, remount de inputs ao trocar de mês, contraste em dark/light), re-rodando `bunx tsc --noEmit` e revalidando.

- [ ] **Step 3: Commit final (se houve ajustes)**

```bash
git add -A src/features/goals src/routes/app.gestao.metas.lote.tsx
git commit -m "fix(goals): polish batch goals after manual review"
```

---

## Self-Review (autor do plano)

**Cobertura do spec:**
- Entrada (botão + rota Owner/Gestor) → Task 6. ✓
- Params compartilhados (Loja/Métrica/Ano/Recompensa) → Task 5. ✓
- Abas de mês (um por vez + dots) → Task 5. ✓
- Tabela (valor/mês, sugestão clicável, total anual, status) → Task 4. ✓
- Escopo (Este mês/Ano todo) + Aplicar valor-base + Sugerir → Task 5 (`targetMonths`) + Task 3 (`applyValue`/`applySuggestion`). ✓
- Conflito por mês (sinaliza + pula) → Task 2 (`detectMonthConflict`) + Tasks 3/4. ✓
- Submit (1 IGoal por célula, laço upsert, audit, sucesso parcial, rascunho) → Task 5 + Task 2 (`buildMonthlyGoal`) + Task 3 (`buildGoalsToCreate`). ✓
- Sugestão via `suggestTarget` → Task 3. ✓
- Arquitetura/arquivos → Tasks 2–6. ✓
- Fora de escopo (defaults/Settings etc.) → não implementado. ✓

**Placeholder scan:** sem TBD/TODO; código completo em cada passo.

**Consistência de tipos:** `IUseBatchGoalsResult` (Task 3) é consumido igual em `BatchGoalsTable` (Task 4) e `BatchGoalsPage` (Task 5); `buildMonthlyGoal`/`detectMonthConflict`/`monthRangeISO`/`MONTH_LABELS` (Task 2) usados consistentemente; shape do `IGoal` espelha `NewGoalPage`.

**Riscos conhecidos:** caminhos de componentes shadcn (Input/Label/Select) e `useAccessibleStores`/`useCurrentStore` — cobertos por passos de verificação que mandam conferir contra `NewGoalPage.tsx`. Remount da tabela por mês via `key={monthIdx}` evita inputs não-controlados presos ao mês anterior. Sem runner → type-check + manual.
