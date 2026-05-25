import { NotImplementedError } from "../../errors";
import type { ICustomersProvider } from "../../contracts/customers";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseCustomersProvider.${method} — implementar no PRD-110+ (clientes via Supabase).`,
  );
};

export const supabaseCustomersProvider: ICustomersProvider = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
  addNote: stub("addNote"),
  listNotes: stub("listNotes"),
};
