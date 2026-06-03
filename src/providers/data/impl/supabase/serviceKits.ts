import { NotImplementedError } from "../../errors";
import type { IServiceKitsProvider } from "../../contracts/serviceKits";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseServiceKitsProvider.${method} — implementar quando kits forem persistidos no Supabase (CRUD deferido).`,
  );
};

export const supabaseServiceKitsProvider: IServiceKitsProvider = {
  list: stub("list"),
  create: stub("create"),
  update: stub("update"),
  remove: stub("remove"),
  duplicate: stub("duplicate"),
};
