import { vehicleModelsApi } from "@/mocks";
import type { IVehicleModelsProvider } from "../../contracts/vehicleModels";

export const mockVehicleModelsProvider: IVehicleModelsProvider = {
  list: (params) => vehicleModelsApi.list(params),
  get: (id) => vehicleModelsApi.get(id),
  create: (input) => vehicleModelsApi.create(input),
  update: (id, patch) => vehicleModelsApi.update(id, patch),
  delete: (id) => vehicleModelsApi.delete(id),
};
