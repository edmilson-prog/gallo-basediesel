import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  IExpense,
  IExpenseRecurrence,
  ID,
} from "@/shared/types";
import { selectAllExpenses, selectExpenseById } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  MockValidationError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListExpensesParams extends IPaginationParams {
  storeId?: ID;
  categories?: ExpenseCategory[];
  statuses?: ExpenseStatus[];
  /** Substring match on supplier (case-insensitive). */
  supplier?: string;
  paymentMethod?: ExpensePaymentMethod;
  /** Inclusive competence window (ISO). Filters by `competenceDate`. */
  competenceStart?: string;
  competenceEnd?: string;
  /** Inclusive payment window (ISO). Filters by `paymentDate`. */
  paymentStart?: string;
  paymentEnd?: string;
}

export type ICreateExpenseInput = Omit<
  IExpense,
  "id" | "createdAt" | "updatedAt" | "status" | "recurrenceParentId"
> & {
  /** Optional explicit status; defaults to `pendente` (or `pago` if paymentDate set). */
  status?: ExpenseStatus;
};

export interface IMarkExpensePaidInput {
  id: ID;
  paymentDate: string;
  paymentMethod?: ExpensePaymentMethod;
}

export interface ICancelExpenseInput {
  id: ID;
  reason?: string;
}

/**
 * Scope of a series operation on a recurring expense (RF-015/016):
 *  - `one`: only the target occurrence.
 *  - `future`: the target and every later occurrence in the series.
 *  - `all`: every occurrence in the series.
 */
export type ExpenseSeriesScope = "one" | "future" | "all";

export interface IUpdateExpenseSeriesInput {
  id: ID;
  patch: Partial<IExpense>;
  scope: ExpenseSeriesScope;
}

export interface ICancelExpenseSeriesInput {
  id: ID;
  scope: ExpenseSeriesScope;
  reason?: string;
}

/** Fields safe to propagate across a series (per-occurrence dates excluded). */
const SERIES_SAFE_FIELDS: (keyof IExpense)[] = [
  "description",
  "category",
  "amount",
  "supplier",
  "paymentMethod",
  "notes",
];

let createdSeq = 0;
function nextId(): ID {
  createdSeq += 1;
  return `exp-rt-${String(Date.now()).slice(-6)}-${createdSeq}`;
}

function inRange(iso: string | undefined, start?: string, end?: string): boolean {
  if (!iso) return false;
  if (start && iso < start) return false;
  if (end && iso > end) return false;
  return true;
}

/** Add `months` to an ISO date, keeping the requested day-of-month (UTC). */
function competenceFor(base: Date, monthsAhead: number): string {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthsAhead, 1),
  ).toISOString();
}

function dueFor(base: Date, monthsAhead: number, dayOfMonth: number): string {
  const day = Math.min(Math.max(1, dayOfMonth), 28);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthsAhead, day),
  ).toISOString();
}

/** Resolve the members of a recurring series for the given target + scope. */
function seriesMembers(target: IExpense, scope: ExpenseSeriesScope): IExpense[] {
  if (scope === "one") return [target];
  const rootId = target.recurrenceParentId ?? target.id;
  const all = selectAllExpenses().filter((e) => e.id === rootId || e.recurrenceParentId === rootId);
  if (scope === "future") {
    return all.filter((e) => e.competenceDate >= target.competenceDate);
  }
  return all;
}

/** Number + step of occurrences (including the mother) for a recurrence. */
function recurrencePlan(config: IExpenseRecurrence): { count: number; step: number } {
  switch (config.frequency) {
    case "mensal":
      return { count: 12, step: 1 };
    case "trimestral":
      return { count: 4, step: 3 };
    case "anual":
      return { count: 2, step: 12 };
    default:
      return { count: 1, step: 1 };
  }
}

export const expensesApi = {
  list(params: IListExpensesParams = {}): Promise<IPaginatedResult<IExpense>> {
    return runApi(
      "expensesApi",
      "list",
      () => {
        let all = selectAllExpenses();
        if (params.storeId) all = all.filter((e) => e.storeId === params.storeId);
        if (params.categories && params.categories.length > 0) {
          const set = new Set(params.categories);
          all = all.filter((e) => set.has(e.category));
        }
        if (params.statuses && params.statuses.length > 0) {
          const set = new Set(params.statuses);
          all = all.filter((e) => set.has(e.status));
        }
        if (params.supplier) {
          const needle = params.supplier.toLowerCase();
          all = all.filter((e) => (e.supplier ?? "").toLowerCase().includes(needle));
        }
        if (params.paymentMethod) {
          all = all.filter((e) => e.paymentMethod === params.paymentMethod);
        }
        if (params.competenceStart || params.competenceEnd) {
          all = all.filter((e) =>
            inRange(e.competenceDate, params.competenceStart, params.competenceEnd),
          );
        }
        if (params.paymentStart || params.paymentEnd) {
          all = all.filter((e) => inRange(e.paymentDate, params.paymentStart, params.paymentEnd));
        }
        const sorted = [...all].sort((a, b) => b.competenceDate.localeCompare(a.competenceDate));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  create(input: ICreateExpenseInput): Promise<IExpense> {
    return runApi("expensesApi", "create", () => {
      if (input.amount <= 0) {
        throw new MockValidationError("O valor da despesa deve ser maior que zero.", "amount");
      }
      if (!input.competenceDate) {
        throw new MockValidationError("A competência é obrigatória.", "competenceDate");
      }
      if (input.dueDate && input.dueDate < input.competenceDate) {
        throw new MockValidationError(
          "O vencimento não pode ser anterior à competência.",
          "dueDate",
        );
      }
      const now = new Date().toISOString();
      const status: ExpenseStatus = input.status ?? (input.paymentDate ? "pago" : "pendente");
      const mother: IExpense = {
        ...input,
        id: nextId(),
        status,
        createdAt: now,
        updatedAt: now,
      };
      upsert("expenses", mother);

      // Recurring series — generate the future occurrences (RF-014).
      if (mother.isRecurring && mother.recurrenceConfig) {
        const base = new Date(mother.competenceDate);
        const { count, step } = recurrencePlan(mother.recurrenceConfig);
        const endDate = mother.recurrenceConfig.endDate;
        for (let i = 1; i < count; i += 1) {
          const competenceDate = competenceFor(base, i * step);
          if (endDate && competenceDate > endDate) break;
          const child: IExpense = {
            ...mother,
            id: nextId(),
            competenceDate,
            dueDate: dueFor(base, i * step, mother.recurrenceConfig.dayOfMonth),
            paymentDate: undefined,
            status: "pendente",
            recurrenceParentId: mother.id,
            recurrenceConfig: undefined,
            createdAt: now,
            updatedAt: now,
          };
          upsert("expenses", child);
        }
      }
      return mother;
    });
  },

  update(id: ID, patch: Partial<IExpense>): Promise<IExpense> {
    return runApi("expensesApi", "update", () => {
      if (patch.amount !== undefined && patch.amount <= 0) {
        throw new MockValidationError("O valor da despesa deve ser maior que zero.", "amount");
      }
      const updated = patchById("expenses", id, { ...patch, updatedAt: new Date().toISOString() });
      if (!updated) throw new MockNotFoundError("expense", id);
      return updated;
    });
  },

  markPaid(input: IMarkExpensePaidInput): Promise<IExpense> {
    return runApi("expensesApi", "markPaid", () => {
      const current = selectExpenseById(input.id);
      if (!current) throw new MockNotFoundError("expense", input.id);
      if (current.status === "cancelado") {
        throw new MockValidationError("Despesa cancelada não pode ser paga.", "status");
      }
      const updated = patchById("expenses", input.id, {
        status: "pago",
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod ?? current.paymentMethod,
        updatedAt: new Date().toISOString(),
      });
      if (!updated) throw new MockNotFoundError("expense", input.id);
      return updated;
    });
  },

  cancel(input: ICancelExpenseInput): Promise<IExpense> {
    return runApi("expensesApi", "cancel", () => {
      const current = selectExpenseById(input.id);
      if (!current) throw new MockNotFoundError("expense", input.id);
      const notes = input.reason
        ? [current.notes, `Cancelada: ${input.reason}`].filter(Boolean).join(" — ")
        : current.notes;
      const updated = patchById("expenses", input.id, {
        status: "cancelado",
        notes,
        updatedAt: new Date().toISOString(),
      });
      if (!updated) throw new MockNotFoundError("expense", input.id);
      return updated;
    });
  },

  /**
   * Daily timer (RF-017): flag every `pendente` expense whose `dueDate` is in
   * the past as `atrasado`. Returns the records that transitioned.
   */
  markOverdue(nowIso: string = new Date().toISOString()): Promise<IExpense[]> {
    return runApi("expensesApi", "markOverdue", () => {
      const due = selectAllExpenses().filter(
        (e) => e.status === "pendente" && e.dueDate !== undefined && e.dueDate < nowIso,
      );
      const updated: IExpense[] = [];
      for (const e of due) {
        const next = patchById("expenses", e.id, { status: "atrasado", updatedAt: nowIso });
        if (next) updated.push(next);
      }
      return updated;
    });
  },

  /**
   * Apply a patch across a recurring series (RF-015). Only the series-safe
   * fields (description, category, amount, supplier, paymentMethod, notes) are
   * propagated — per-occurrence dates stay individual. Returns the records that
   * changed (the target always receives the full patch).
   */
  updateSeries(input: IUpdateExpenseSeriesInput): Promise<IExpense[]> {
    return runApi("expensesApi", "updateSeries", () => {
      const target = selectExpenseById(input.id);
      if (!target) throw new MockNotFoundError("expense", input.id);
      if (input.patch.amount !== undefined && input.patch.amount <= 0) {
        throw new MockValidationError("O valor da despesa deve ser maior que zero.", "amount");
      }
      const now = new Date().toISOString();
      const members = seriesMembers(target, input.scope);
      const safePatch: Partial<IExpense> = {};
      for (const field of SERIES_SAFE_FIELDS) {
        if (input.patch[field] !== undefined) {
          (safePatch as Record<string, unknown>)[field] = input.patch[field];
        }
      }
      const updated: IExpense[] = [];
      for (const member of members) {
        // The target also gets the per-occurrence fields (competence/due).
        const patch = member.id === input.id ? { ...input.patch } : { ...safePatch };
        const next = patchById("expenses", member.id, { ...patch, updatedAt: now });
        if (next) updated.push(next);
      }
      return updated;
    });
  },

  /**
   * Cancel a recurring series (RF-016) — cancels the target and, per scope, the
   * later / all occurrences. Already-cancelled members are skipped.
   */
  cancelSeries(input: ICancelExpenseSeriesInput): Promise<IExpense[]> {
    return runApi("expensesApi", "cancelSeries", () => {
      const target = selectExpenseById(input.id);
      if (!target) throw new MockNotFoundError("expense", input.id);
      const now = new Date().toISOString();
      const members = seriesMembers(target, input.scope).filter((e) => e.status !== "cancelado");
      const updated: IExpense[] = [];
      for (const member of members) {
        const notes = input.reason
          ? [member.notes, `Cancelada: ${input.reason}`].filter(Boolean).join(" — ")
          : member.notes;
        const next = patchById("expenses", member.id, {
          status: "cancelado",
          notes,
          updatedAt: now,
        });
        if (next) updated.push(next);
      }
      return updated;
    });
  },
};
