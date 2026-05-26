import { NotImplementedError } from "../../errors";
import type { IDistributionTracesProvider } from "../../contracts/distributionTraces";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseDistributionTracesProvider.${method} — implementar na Fase 2 (engine como Edge Function).`,
  );
};

export const supabaseDistributionTracesProvider: IDistributionTracesProvider = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
};
