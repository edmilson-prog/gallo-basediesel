import { NotImplementedError } from "../../errors";
import type { IExpensesProvider } from "../../contracts/expenses";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseExpensesProvider.${method} — implementar no PRD-104+ (despesas via Supabase).`,
  );
};

export const supabaseExpensesProvider: IExpensesProvider = {
  list: stub("list"),
  create: stub("create"),
  update: stub("update"),
  updateSeries: stub("updateSeries"),
  markPaid: stub("markPaid"),
  cancel: stub("cancel"),
  cancelSeries: stub("cancelSeries"),
  markOverdue: stub("markOverdue"),
};
