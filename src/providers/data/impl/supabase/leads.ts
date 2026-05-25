import { NotImplementedError } from "../../errors";
import type { ILeadsProvider } from "../../contracts/leads";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseLeadsProvider.${method} — implementar no PRD-115+ (SDR / pipeline via Supabase).`,
  );
};

export const supabaseLeadsProvider: ILeadsProvider = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
