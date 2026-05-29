import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ExpenseCategory, ExpensePaymentMethod, ExpenseStatus } from "@/shared/types";
import { currentMonthKey, type ExpensePeriodKind } from "../utils/period";

const MONTH_REGEX = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const KINDS: ExpensePeriodKind[] = ["mensal", "trimestral", "anual"];
const CATEGORIES: ExpenseCategory[] = [
  "folha",
  "aluguel",
  "infraestrutura",
  "marketing",
  "impostos",
  "fornecedores",
  "logistica",
  "manutencao",
  "outros",
];
const STATUSES: ExpenseStatus[] = ["pendente", "pago", "atrasado", "cancelado"];

export interface IExpensesFiltersSearch {
  mes?: string;
  tipo?: ExpensePeriodKind;
  cat?: string;
  status?: string;
  fornecedor?: string;
  pgto?: ExpensePaymentMethod;
}

export interface IExpensesFiltersState {
  monthKey: string;
  kind: ExpensePeriodKind;
  categories: ExpenseCategory[];
  statuses: ExpenseStatus[];
  supplier: string;
  paymentMethod?: ExpensePaymentMethod;
}

/** Validate raw search params for the expenses route. */
export function validateExpensesSearch(raw: Record<string, unknown>): IExpensesFiltersSearch {
  const out: IExpensesFiltersSearch = {};
  if (typeof raw.mes === "string" && MONTH_REGEX.test(raw.mes)) out.mes = raw.mes;
  // Back-compat alias used by the DRE drill-down (?competencia=YYYY-MM).
  if (!out.mes && typeof raw.competencia === "string" && MONTH_REGEX.test(raw.competencia)) {
    out.mes = raw.competencia;
  }
  if (typeof raw.tipo === "string" && (KINDS as string[]).includes(raw.tipo)) {
    out.tipo = raw.tipo as ExpensePeriodKind;
  }
  if (typeof raw.cat === "string" && raw.cat.length > 0) out.cat = raw.cat;
  if (typeof raw.status === "string" && raw.status.length > 0) out.status = raw.status;
  if (typeof raw.fornecedor === "string" && raw.fornecedor.length > 0)
    out.fornecedor = raw.fornecedor;
  if (typeof raw.pgto === "string" && raw.pgto.length > 0)
    out.pgto = raw.pgto as ExpensePaymentMethod;
  return out;
}

function parseList<T extends string>(raw: string | undefined, allowed: T[]): T[] {
  if (!raw) return [];
  const set = new Set(allowed);
  return raw.split(",").filter((v): v is T => set.has(v as T));
}

export interface IUseExpensesFiltersResult {
  filters: IExpensesFiltersState;
  setMonth: (monthKey: string) => void;
  setKind: (kind: ExpensePeriodKind) => void;
  toggleCategory: (category: ExpenseCategory) => void;
  toggleStatus: (status: ExpenseStatus) => void;
  setSupplier: (supplier: string) => void;
  setPaymentMethod: (method: ExpensePaymentMethod | undefined) => void;
  reset: () => void;
  activeCount: number;
}

/** URL-synced filters for the expenses page (PRD-054 RF-008). */
export function useExpensesFilters(): IUseExpensesFiltersResult {
  const search = useSearch({ strict: false }) as IExpensesFiltersSearch;
  const navigate = useNavigate();

  const filters: IExpensesFiltersState = useMemo(
    () => ({
      monthKey: search.mes ?? currentMonthKey(),
      kind: search.tipo ?? "mensal",
      categories: parseList(search.cat, CATEGORIES),
      statuses: parseList(search.status, STATUSES),
      supplier: search.fornecedor ?? "",
      paymentMethod: search.pgto,
    }),
    [search],
  );

  const apply = useCallback(
    (patch: Partial<IExpensesFiltersSearch>) => {
      void navigate({
        search: (prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...prev, ...patch };
          // Drop the drill-down alias once we own `mes`.
          delete next.competencia;
          for (const key of Object.keys(next)) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const toggleIn = <T extends string>(list: T[], value: T): string | undefined => {
    const set = new Set(list);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const arr = [...set];
    return arr.length > 0 ? arr.join(",") : undefined;
  };

  const activeCount =
    (search.mes && search.mes !== currentMonthKey() ? 1 : 0) +
    (filters.kind !== "mensal" ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.supplier ? 1 : 0) +
    (filters.paymentMethod ? 1 : 0);

  return {
    filters,
    setMonth: (monthKey) => apply({ mes: monthKey === currentMonthKey() ? undefined : monthKey }),
    setKind: (kind) => apply({ tipo: kind === "mensal" ? undefined : kind }),
    toggleCategory: (category) => apply({ cat: toggleIn(filters.categories, category) }),
    toggleStatus: (status) => apply({ status: toggleIn(filters.statuses, status) }),
    setSupplier: (supplier) => apply({ fornecedor: supplier || undefined }),
    setPaymentMethod: (method) => apply({ pgto: method }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
