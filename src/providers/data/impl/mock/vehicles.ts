import { vehiclesApi } from "@/mocks";
import type { IVehiclesProvider } from "../../contracts/vehicles";

export const mockVehiclesProvider: IVehiclesProvider = {
  list: (params) => vehiclesApi.list(params),
  get: (id) => vehiclesApi.get(id),
  listByCustomer: (customerId) => vehiclesApi.listByCustomer(customerId),
  create: (input) => vehiclesApi.create(input),
  update: (id, patch) => vehiclesApi.update(id, patch),
  delete: (id) => vehiclesApi.delete(id),
  addServiceEntry: (vehicleId, entry) => vehiclesApi.addServiceEntry(vehicleId, entry),
};
