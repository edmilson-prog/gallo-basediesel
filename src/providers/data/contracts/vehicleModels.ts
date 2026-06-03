import type { ID, IVehicleModel, VehicleModelStatus } from "@/shared/types";

export interface IListVehicleModelsParams {
  brand?: string;
  status?: VehicleModelStatus;
  search?: string;
}

export interface ICreateVehicleModelInput {
  brand: string;
  model: string;
  engine: string;
  yearStart?: number;
  yearEnd?: number;
}

export type IUpdateVehicleModelPatch = Partial<ICreateVehicleModelInput> & {
  status?: VehicleModelStatus;
};

/**
 * Contract for the canonical vehicle-model catalog (PRD-034). Reference data —
 * not store-scoped. `list` is read by everyone authenticated; writes back the
 * management screen (Owner/Gestor).
 *
 * @see ../../../mocks/api/vehicleModels.ts
 */
export interface IVehicleModelsProvider {
  list(params?: IListVehicleModelsParams): Promise<IVehicleModel[]>;
  get(id: ID): Promise<IVehicleModel>;
  create(input: ICreateVehicleModelInput): Promise<IVehicleModel>;
  update(id: ID, patch: IUpdateVehicleModelPatch): Promise<IVehicleModel>;
  delete(id: ID): Promise<void>;
}
