import { NotImplementedError } from "../../errors";
import type { IOrdersProvider } from "../../contracts/orders";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseOrdersProvider.${method} — implementar no PRD-110+ (pedidos via Supabase/DINTEC).`,
  );
};

export const supabaseOrdersProvider: IOrdersProvider = {
  list: stub("list"),
  get: stub("get"),
  listByCustomer: stub("listByCustomer"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
