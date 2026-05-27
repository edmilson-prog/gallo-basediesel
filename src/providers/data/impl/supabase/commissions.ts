import { NotImplementedError } from "../../errors";
import type { ICommissionsProvider } from "../../contracts/commissions";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseCommissionsProvider.${method} — implementar no PRD-120+ (comissões via Supabase).`,
  );
};

export const supabaseCommissionsProvider: ICommissionsProvider = {
  list: stub("list"),
  create: stub("create"),
  update: stub("update"),
  closeMonthlyPeriod: stub("closeMonthlyPeriod"),
  openDispute: stub("openDispute"),
  resolveDispute: stub("resolveDispute"),
  registerPayment: stub("registerPayment"),
};
