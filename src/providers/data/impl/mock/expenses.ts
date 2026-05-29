import { expensesApi } from "@/mocks";
import type { IExpensesProvider } from "../../contracts/expenses";
import { logMockMutation } from "./_audit";
import { scopedListParams, withCreateStoreId } from "./_storeScope";

export const mockExpensesProvider: IExpensesProvider = {
  list: (params) => expensesApi.list(scopedListParams(params, "expense")),
  create: async (input) => {
    const created = await expensesApi.create(withCreateStoreId(input));
    logMockMutation({
      action: "expense_create",
      resource: "expense",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },
  update: async (id, patch) => {
    const updated = await expensesApi.update(id, patch);
    logMockMutation({
      action: "expense_update",
      resource: "expense",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  updateSeries: async (input) => {
    const updated = await expensesApi.updateSeries(input);
    const root = updated[0];
    logMockMutation({
      action: "expense_update_series",
      resource: "expense",
      resourceId: input.id,
      after: { scope: input.scope, count: updated.length },
      storeId: root?.storeId,
    });
    return updated;
  },
  markPaid: async (input) => {
    const updated = await expensesApi.markPaid(input);
    logMockMutation({
      action: "expense_mark_paid",
      resource: "expense",
      resourceId: updated.id,
      after: { paymentDate: updated.paymentDate, paymentMethod: updated.paymentMethod },
      storeId: updated.storeId,
    });
    return updated;
  },
  cancel: async (input) => {
    const updated = await expensesApi.cancel(input);
    logMockMutation({
      action: "expense_cancel",
      resource: "expense",
      resourceId: updated.id,
      after: { reason: input.reason },
      storeId: updated.storeId,
    });
    return updated;
  },
  cancelSeries: async (input) => {
    const updated = await expensesApi.cancelSeries(input);
    const root = updated[0];
    logMockMutation({
      action: "expense_cancel_series",
      resource: "expense",
      resourceId: input.id,
      after: { scope: input.scope, count: updated.length, reason: input.reason },
      storeId: root?.storeId,
    });
    return updated;
  },
  markOverdue: (nowIso) => expensesApi.markOverdue(nowIso),
};
