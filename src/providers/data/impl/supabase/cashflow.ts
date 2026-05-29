import { NotImplementedError } from "../../errors";
import type { ICashFlowProvider } from "../../contracts/cashflow";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseCashFlowProvider.${method} — implementar no PRD-104+ (fluxo de caixa via Supabase).`,
  );
};

export const supabaseCashFlowProvider: ICashFlowProvider = {
  list: stub("list"),
  create: stub("create"),
};
