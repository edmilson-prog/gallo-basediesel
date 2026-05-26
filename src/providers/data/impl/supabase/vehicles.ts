import { NotImplementedError } from "../../errors";
import type { IVehiclesProvider } from "../../contracts/vehicles";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseVehiclesProvider.${method} — implementar no PRD-110+ (veículos via Supabase).`,
  );
};

export const supabaseVehiclesProvider: IVehiclesProvider = {
  list: stub("list"),
  get: stub("get"),
  listByCustomer: stub("listByCustomer"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
  addServiceEntry: stub("addServiceEntry"),
};
