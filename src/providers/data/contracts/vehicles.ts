import type { ID, IVehicle } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListVehiclesParams extends IPaginationParams {
  customerId?: ID;
  brand?: string;
  cadastroStatus?: IVehicle["cadastroStatus"];
}

/**
 * Contract for vehicle catalog access (Volvo, Scania, Mercedes-Benz, etc.).
 *
 * @see ../../../mocks/api/vehicles.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IVehiclesProvider {
  list(params?: IListVehiclesParams): Promise<IPaginatedResult<IVehicle>>;
  get(id: ID): Promise<IVehicle>;
  listByCustomer(customerId: ID): Promise<IVehicle[]>;
  create(input: Omit<IVehicle, "id" | "createdAt" | "serviceHistory">): Promise<IVehicle>;
  update(id: ID, patch: Partial<IVehicle>): Promise<IVehicle>;
  delete(id: ID): Promise<void>;
}
