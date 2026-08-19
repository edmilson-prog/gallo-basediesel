import type { ID, IVehicle, IVehicleServiceEntry } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export type VehiclesOrderBy =
  | "brand"
  | "engine"
  | "plate"
  | "seller"
  | "cadastroStatus"
  | "createdAt"
  | "lastServiceAt"
  | "currentKm"
  | "year"
  | "customerName";

export type VehiclesOrderDir = "asc" | "desc";

export interface IListVehiclesParams extends IPaginationParams {
  customerId?: ID;
  customerIds?: ID[];
  /** Single brand legacy filter. */
  brand?: string;
  brands?: string[];
  /** Substring match on model. */
  model?: string;
  /** Substring match on engine. */
  engine?: string;
  yearMin?: number;
  yearMax?: number;
  cadastroStatus?: IVehicle["cadastroStatus"];
  cadastroStatuses?: IVehicle["cadastroStatus"][];
  /** Only vehicles with no odometer reading — the km enrichment queue. */
  withoutKm?: boolean;
  /** Only vehicles with no canonical model linked (no compatible parts, no kit). */
  withoutModel?: boolean;
  storeId?: ID;
  storeIds?: ID[];
  sellerIds?: ID[];
  /** Free-text query on plate, VIN, model, customer name. */
  search?: string;
  orderBy?: VehiclesOrderBy;
  orderDir?: VehiclesOrderDir;
}

/**
 * Input payload to register a service entry (PRD-016).
 * `id` and the timeline reverse-chronological ordering are derived by the provider.
 */
export type IAddServiceEntryInput = Omit<IVehicleServiceEntry, "id">;

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
  /** Append a service entry to the vehicle's `serviceHistory` (PRD-016 fase 4). */
  addServiceEntry(vehicleId: ID, entry: IAddServiceEntryInput): Promise<IVehicle>;
}
