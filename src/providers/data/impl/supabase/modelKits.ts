import { NotImplementedError } from "../../errors";
import type { IModelKitsProvider } from "../../contracts/modelKits";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseModelKitsProvider.${method} — implementar quando kits de modelo forem persistidos no Supabase (CRUD deferido).`,
  );
};

export const supabaseModelKitsProvider: IModelKitsProvider = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
