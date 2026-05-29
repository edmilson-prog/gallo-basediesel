import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IExpense } from "@/shared/types";
import {
  useExpensesProvider,
  type ICancelExpenseInput,
  type ICancelExpenseSeriesInput,
  type ICreateExpenseInput,
  type IMarkExpensePaidInput,
  type IUpdateExpenseSeriesInput,
} from "@/providers/data";

export interface IUseExpenseMutationsResult {
  saving: boolean;
  create: (input: ICreateExpenseInput) => Promise<IExpense>;
  update: (id: ID, patch: Partial<IExpense>) => Promise<IExpense>;
  updateSeries: (input: IUpdateExpenseSeriesInput) => Promise<IExpense[]>;
  markPaid: (input: IMarkExpensePaidInput) => Promise<IExpense>;
  cancel: (input: ICancelExpenseInput) => Promise<IExpense>;
  cancelSeries: (input: ICancelExpenseSeriesInput) => Promise<IExpense[]>;
  duplicate: (expense: IExpense, createdBy: ID) => Promise<IExpense>;
}

/**
 * Expense write operations with cache invalidation. Mutating an expense affects
 * the DRE (competence) and the Cash Flow (payment), so both caches are
 * invalidated alongside the expense list.
 */
export function useExpenseMutations(): IUseExpenseMutationsResult {
  const provider = useExpensesProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    void queryClient.invalidateQueries({ queryKey: ["dre"] });
    void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
  }, [queryClient]);

  const wrap = useCallback(
    async <T>(op: () => Promise<T>): Promise<T> => {
      setSaving(true);
      try {
        const result = await op();
        invalidate();
        return result;
      } finally {
        setSaving(false);
      }
    },
    [invalidate],
  );

  return {
    saving,
    create: (input) => wrap(() => provider.create(input)),
    update: (id, patch) => wrap(() => provider.update(id, patch)),
    updateSeries: (input) => wrap(() => provider.updateSeries(input)),
    markPaid: (input) => wrap(() => provider.markPaid(input)),
    cancel: (input) => wrap(() => provider.cancel(input)),
    cancelSeries: (input) => wrap(() => provider.cancelSeries(input)),
    duplicate: (expense, createdBy) =>
      wrap(() =>
        provider.create({
          description: `${expense.description} (cópia)`,
          category: expense.category,
          amount: expense.amount,
          competenceDate: expense.competenceDate,
          paymentDate: undefined,
          dueDate: expense.dueDate,
          isRecurring: false,
          recurrenceConfig: undefined,
          supplier: expense.supplier,
          paymentMethod: expense.paymentMethod,
          attachmentUrl: undefined,
          notes: expense.notes,
          storeId: expense.storeId,
          createdBy,
        }),
      ),
  };
}
