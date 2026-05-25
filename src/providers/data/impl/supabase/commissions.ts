import { NotImplementedError } from "../../errors";
import type { ICommissionsProvider } from "../../contracts/commissions";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseCommissionsProvider.${method} — implementar no PRD-120+ (comissões via Supabase).`,
  );
};

export const supabaseCommissionsProvider: ICommissionsProvider = {
  list: stub("list"),
  update: stub("update"),
};
