import type { ID, IVehicle } from "@/shared/types";
import { selectAllVehicles, selectVehicleById, selectVehiclesByCustomer } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListVehiclesParams extends IPaginationParams {
  customerId?: ID;
  brand?: string;
  cadastroStatus?: IVehicle["cadastroStatus"];
}

export const vehiclesApi = {
  list(params: IListVehiclesParams = {}): Promise<IPaginatedResult<IVehicle>> {
    return runApi(
      "vehiclesApi",
      "list",
      () => {
        let all = selectAllVehicles();
        if (params.customerId) all = all.filter((v) => v.customerId === params.customerId);
        if (params.brand) all = all.filter((v) => v.brand === params.brand);
        if (params.cadastroStatus)
          all = all.filter((v) => v.cadastroStatus === params.cadastroStatus);
        const sorted = [...all].sort(
          (a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model),
        );
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<IVehicle> {
    return runApi("vehiclesApi", "get", () => {
      const found = selectVehicleById(id);
      if (!found) throw new MockNotFoundError("vehicle", id);
      return found;
    });
  },

  async listByCustomer(customerId: ID): Promise<IVehicle[]> {
    return runApi("vehiclesApi", "listByCustomer", () => selectVehiclesByCustomer(customerId));
  },

  async create(input: Omit<IVehicle, "id" | "createdAt" | "serviceHistory">): Promise<IVehicle> {
    return runApi("vehiclesApi", "create", () => {
      const vehicle: IVehicle = {
        ...input,
        id: `vehicle-${crypto.randomUUID()}`,
        serviceHistory: [],
        createdAt: new Date().toISOString(),
      } as IVehicle;
      upsert("vehicles", vehicle);
      return vehicle;
    });
  },

  async update(id: ID, patch: Partial<IVehicle>): Promise<IVehicle> {
    return runApi("vehiclesApi", "update", () => {
      const updated = patchById("vehicles", id, patch);
      if (!updated) throw new MockNotFoundError("vehicle", id);
      return updated;
    });
  },

  async delete(id: ID): Promise<void> {
    return runApi("vehiclesApi", "delete", () => {
      const removed = removeById("vehicles", id);
      if (!removed) throw new MockNotFoundError("vehicle", id);
    });
  },
};
