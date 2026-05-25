import { NotImplementedError } from "../../errors";
import type { IQuotesProvider } from "../../contracts/quotes";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseQuotesProvider.${method} — implementar no PRD-110+ (orçamentos via Supabase).`,
  );
};

export const supabaseQuotesProvider: IQuotesProvider = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
