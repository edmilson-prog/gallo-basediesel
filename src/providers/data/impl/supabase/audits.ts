import { NotImplementedError } from "../../errors";
import type { IAuditsProvider } from "../../contracts/audits";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseAuditsProvider.${method} — implementar no PRD-110+ (audit log via Supabase).`,
  );
};

export const supabaseAuditsProvider: IAuditsProvider = {
  list: stub("list"),
  create: stub("create"),
};
