import type { ExpensePaymentMethod, IExpense, ID } from "@/shared/types";
import type {
  ICancelExpenseInput,
  ICancelExpenseSeriesInput,
  ICreateExpenseInput,
  IListExpensesParams,
  IMarkExpensePaidInput,
  IUpdateExpenseSeriesInput,
} from "@/mocks/api/expenses";
import type { IPaginatedResult } from "./_shared";

export type {
  ICancelExpenseInput,
  ICancelExpenseSeriesInput,
  ICreateExpenseInput,
  IListExpensesParams,
  IMarkExpensePaidInput,
  IUpdateExpenseSeriesInput,
  ExpenseSeriesScope,
} from "@/mocks/api/expenses";
export type { ExpensePaymentMethod };

/**
 * Contract for operational expenses access (PRD-054).
 *
 * @see ../../../mocks/api/expenses.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IExpensesProvider {
  list(params?: IListExpensesParams): Promise<IPaginatedResult<IExpense>>;
  create(input: ICreateExpenseInput): Promise<IExpense>;
  update(id: ID, patch: Partial<IExpense>): Promise<IExpense>;
  /** Apply a patch across a recurring series (scope: one/future/all). */
  updateSeries(input: IUpdateExpenseSeriesInput): Promise<IExpense[]>;
  markPaid(input: IMarkExpensePaidInput): Promise<IExpense>;
  cancel(input: ICancelExpenseInput): Promise<IExpense>;
  /** Cancel a recurring series (scope: one/future/all). */
  cancelSeries(input: ICancelExpenseSeriesInput): Promise<IExpense[]>;
  /** Flag overdue (`pendente` past `dueDate`) entries as `atrasado`. */
  markOverdue(nowIso?: string): Promise<IExpense[]>;
}
