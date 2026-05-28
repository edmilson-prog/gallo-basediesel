import type { ID, IVehicle, IVehicleServiceEntry } from "@/shared/types";
import {
  selectAllCustomers,
  selectAllSellers,
  selectAllVehicles,
  selectVehicleById,
  selectVehiclesByCustomer,
} from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

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

export interface IListVehiclesParams extends IPaginationParams {
  customerId?: ID;
  customerIds?: ID[];
  brand?: string;
  brands?: string[];
  model?: string;
  engine?: string;
  yearMin?: number;
  yearMax?: number;
  cadastroStatus?: IVehicle["cadastroStatus"];
  cadastroStatuses?: IVehicle["cadastroStatus"][];
  storeId?: ID;
  storeIds?: ID[];
  sellerIds?: ID[];
  search?: string;
  orderBy?: VehiclesOrderBy;
  orderDir?: "asc" | "desc";
}

function getCustomerName(customerId: ID): string {
  const customer = selectAllCustomers().find((c) => c.id === customerId);
  if (!customer) return "";
  return customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
}

function getCustomerSellerId(customerId: ID): ID | null {
  const customer = selectAllCustomers().find((c) => c.id === customerId);
  return customer?.sellerId ?? null;
}

function getCustomerSellerName(customerId: ID): string {
  const sellerId = getCustomerSellerId(customerId);
  if (!sellerId) return "";
  return selectAllSellers().find((s) => s.id === sellerId)?.fullName ?? "";
}

function getCustomerStoreId(customerId: ID): ID | null {
  const customer = selectAllCustomers().find((c) => c.id === customerId);
  return customer?.storeId ?? null;
}

function lastServiceAt(v: IVehicle): string {
  if (v.serviceHistory.length === 0) return "";
  return v.serviceHistory.reduce(
    (acc, entry) => (entry.date.localeCompare(acc) > 0 ? entry.date : acc),
    v.serviceHistory[0].date,
  );
}

function compareVehicles(
  a: IVehicle,
  b: IVehicle,
  orderBy: VehiclesOrderBy,
  dir: "asc" | "desc",
): number {
  const mult = dir === "desc" ? -1 : 1;
  switch (orderBy) {
    case "brand": {
      const cmp = a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model);
      return cmp * mult;
    }
    case "engine":
      return a.engine.localeCompare(b.engine) * mult;
    case "plate":
      return (a.plate ?? "").localeCompare(b.plate ?? "") * mult;
    case "seller":
      return getCustomerSellerName(a.customerId).localeCompare(getCustomerSellerName(b.customerId)) *
        mult;
    case "cadastroStatus":
      return a.cadastroStatus.localeCompare(b.cadastroStatus) * mult;
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt) * mult;
    case "lastServiceAt":
      return lastServiceAt(a).localeCompare(lastServiceAt(b)) * mult;
    case "currentKm":
      return ((a.currentKm ?? 0) - (b.currentKm ?? 0)) * mult;
    case "year":
      return (a.year - b.year) * mult;
    case "customerName":
      return getCustomerName(a.customerId).localeCompare(getCustomerName(b.customerId)) * mult;
  }
}

export const vehiclesApi = {
  list(params: IListVehiclesParams = {}): Promise<IPaginatedResult<IVehicle>> {
    return runApi(
      "vehiclesApi",
      "list",
      () => {
        let all = selectAllVehicles();
        if (params.customerId) all = all.filter((v) => v.customerId === params.customerId);
        if (params.customerIds && params.customerIds.length > 0) {
          const set = new Set(params.customerIds);
          all = all.filter((v) => set.has(v.customerId));
        }
        if (params.brand) all = all.filter((v) => v.brand === params.brand);
        if (params.brands && params.brands.length > 0) {
          const set = new Set(params.brands);
          all = all.filter((v) => set.has(v.brand));
        }
        if (params.model) {
          const q = params.model.toLowerCase();
          all = all.filter((v) => v.model.toLowerCase().includes(q));
        }
        if (params.engine) {
          const q = params.engine.toLowerCase();
          all = all.filter((v) => v.engine.toLowerCase().includes(q));
        }
        if (params.yearMin !== undefined) all = all.filter((v) => v.year >= params.yearMin!);
        if (params.yearMax !== undefined) all = all.filter((v) => v.year <= params.yearMax!);
        if (params.cadastroStatus)
          all = all.filter((v) => v.cadastroStatus === params.cadastroStatus);
        if (params.cadastroStatuses && params.cadastroStatuses.length > 0) {
          const set = new Set(params.cadastroStatuses);
          all = all.filter((v) => set.has(v.cadastroStatus));
        }
        if (params.storeId) {
          all = all.filter((v) => getCustomerStoreId(v.customerId) === params.storeId);
        }
        if (params.storeIds && params.storeIds.length > 0) {
          const set = new Set(params.storeIds);
          all = all.filter((v) => {
            const sId = getCustomerStoreId(v.customerId);
            return sId !== null && set.has(sId);
          });
        }
        if (params.sellerIds && params.sellerIds.length > 0) {
          const set = new Set(params.sellerIds);
          all = all.filter((v) => {
            const sId = getCustomerSellerId(v.customerId);
            return sId !== null && set.has(sId);
          });
        }
        if (params.search) {
          const q = params.search.toLowerCase().trim();
          if (q.length > 0) {
            all = all.filter((v) => {
              const plate = (v.plate ?? "").toLowerCase();
              const vin = (v.vin ?? "").toLowerCase();
              const model = v.model.toLowerCase();
              const customerName = getCustomerName(v.customerId).toLowerCase();
              return (
                plate.includes(q) ||
                vin.includes(q) ||
                model.includes(q) ||
                customerName.includes(q)
              );
            });
          }
        }
        const orderBy: VehiclesOrderBy = params.orderBy ?? "brand";
        const orderDir = params.orderDir ?? "asc";
        const sorted = [...all].sort((a, b) => compareVehicles(a, b, orderBy, orderDir));
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

  async addServiceEntry(vehicleId: ID, entry: Omit<IVehicleServiceEntry, "id">): Promise<IVehicle> {
    return runApi("vehiclesApi", "addServiceEntry", () => {
      const existing = selectVehicleById(vehicleId);
      if (!existing) throw new MockNotFoundError("vehicle", vehicleId);
      const serviceEntry: IVehicleServiceEntry = {
        ...entry,
        id: `vse-${crypto.randomUUID()}`,
      };
      const nextHistory = [...existing.serviceHistory, serviceEntry];
      const updated = patchById("vehicles", vehicleId, {
        serviceHistory: nextHistory,
        ...(entry.km !== undefined && entry.km > (existing.currentKm ?? 0)
          ? { currentKm: entry.km }
          : {}),
      });
      if (!updated) throw new MockNotFoundError("vehicle", vehicleId);
      return updated;
    });
  },
};
