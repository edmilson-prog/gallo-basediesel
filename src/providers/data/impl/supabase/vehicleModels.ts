import { NotImplementedError } from "../../errors";
import type { IVehicleModelsProvider } from "../../contracts/vehicleModels";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseVehicleModelsProvider.${method} — implementar quando o catálogo de modelos for persistido no Supabase (Fase 2).`,
  );
};

export const supabaseVehicleModelsProvider: IVehicleModelsProvider = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
