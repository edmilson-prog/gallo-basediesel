import type { ABCClass, ICustomer, ICustomerNote, ID } from "@/shared/types";
import { selectAllVehicles, selectCustomerById, selectAllCustomers } from "../store/selectors";
import { appendCustomerNote, patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  MockValidationError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export type RecencyBucket = "0-30" | "31-90" | "91-180" | "180+";

export interface INumericRange {
  min?: number;
  max?: number;
}

export interface IListCustomersParams extends IPaginationParams {
  storeId?: ID;
  storeIds?: ID[];
  status?: ICustomer["status"];
  statuses?: ICustomer["status"][];
  type?: ICustomer["type"];
  sellerId?: ID;
  sellerIds?: ID[];
  search?: string;
  tag?: string;
  tags?: string[];
  abcClasses?: (ABCClass | "none")[];
  recencyBuckets?: RecencyBucket[];
  recencyCustom?: { minDays?: number; maxDays?: number };
  ticketRange?: INumericRange;
  ltvRange?: INumericRange;
  vehicleBrands?: string[];
  hasAnyVehicle?: boolean;
  orderBy?:
    | "name"
    | "lastPurchaseAt"
    | "createdAt"
    | "ticketMedio"
    | "ltv"
    | "recency"
    | "abcClass"
    | "status";
  orderDir?: "asc" | "desc";
}

function displayName(customer: ICustomer): string {
  return customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
}

function normalize(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function daysSince(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / (1000 * 60 * 60 * 24));
}

function recencyMatches(buckets: RecencyBucket[] | undefined, days: number | null): boolean {
  if (!buckets || buckets.length === 0) return true;
  if (days === null) return buckets.includes("180+");
  return buckets.some((b) => {
    switch (b) {
      case "0-30":
        return days <= 30;
      case "31-90":
        return days >= 31 && days <= 90;
      case "91-180":
        return days >= 91 && days <= 180;
      case "180+":
        return days > 180;
    }
  });
}

function rangeMatches(range: INumericRange | undefined, value: number | undefined): boolean {
  if (!range || (range.min === undefined && range.max === undefined)) return true;
  if (value === undefined || value === null) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value >= range.max) return false;
  return true;
}

function customerAbcKey(customer: ICustomer): ABCClass | "none" {
  return customer.abcClass ?? "none";
}

function matches(
  customer: ICustomer,
  params: IListCustomersParams,
  vehiclesByCustomer: Map<ID, Set<string>>,
  nowMs: number,
): boolean {
  if (params.storeIds && params.storeIds.length > 0 && !params.storeIds.includes(customer.storeId))
    return false;
  if (
    params.storeIds === undefined &&
    params.storeId !== undefined &&
    customer.storeId !== params.storeId
  )
    return false;

  if (params.status && customer.status !== params.status) return false;
  if (params.statuses && params.statuses.length > 0 && !params.statuses.includes(customer.status))
    return false;

  if (params.type && customer.type !== params.type) return false;

  if (params.sellerId && customer.sellerId !== params.sellerId) return false;
  if (
    params.sellerIds &&
    params.sellerIds.length > 0 &&
    !params.sellerIds.includes(customer.sellerId)
  )
    return false;

  if (params.tag && !customer.tags.includes(params.tag)) return false;
  if (params.tags && params.tags.length > 0) {
    const has = params.tags.every((t) => customer.tags.includes(t));
    if (!has) return false;
  }

  if (params.abcClasses && params.abcClasses.length > 0) {
    if (!params.abcClasses.includes(customerAbcKey(customer))) return false;
  }

  const days = daysSince(customer.lastPurchaseAt, nowMs);
  if (!recencyMatches(params.recencyBuckets, days)) return false;
  if (params.recencyCustom) {
    const { minDays, maxDays } = params.recencyCustom;
    if (minDays !== undefined && (days === null || days < minDays)) return false;
    if (maxDays !== undefined && days !== null && days > maxDays) return false;
  }

  if (!rangeMatches(params.ticketRange, customer.purchaseStats?.ticketMedio)) return false;
  if (!rangeMatches(params.ltvRange, customer.purchaseStats?.ltv)) return false;

  if (params.vehicleBrands && params.vehicleBrands.length > 0) {
    const owned = vehiclesByCustomer.get(customer.id) ?? new Set<string>();
    if (params.vehicleBrands.includes("any")) {
      if (owned.size === 0) return false;
    } else {
      const intersects = params.vehicleBrands.some((b) => owned.has(b));
      if (!intersects) return false;
    }
  }

  if (params.search) {
    const q = params.search.toLowerCase().trim();
    if (q.length > 0) {
      const digits = q.replace(/\D/g, "");
      const haystack = [
        displayName(customer),
        customer.email ?? "",
        customer.phone,
        customer.type === "B2B" ? `${customer.razaoSocial} ${customer.cnpj}` : customer.cpf,
        customer.notes.map((n) => n.content).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const numericMatch =
        digits.length > 0 &&
        (normalize(customer.phone).includes(digits) ||
          (customer.type === "B2B"
            ? normalize(customer.cnpj).includes(digits)
            : normalize(customer.cpf).includes(digits)));
      if (!haystack.includes(q) && !numericMatch) return false;
    }
  }

  return true;
}

function compareCustomers(a: ICustomer, b: ICustomer, params: IListCustomersParams): number {
  const dir = params.orderDir === "desc" ? -1 : 1;
  const key = params.orderBy ?? "name";
  switch (key) {
    case "name":
      return displayName(a).localeCompare(displayName(b), "pt-BR") * dir;
    case "lastPurchaseAt":
      return (a.lastPurchaseAt ?? "").localeCompare(b.lastPurchaseAt ?? "") * dir;
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt) * dir;
    case "ticketMedio":
      return ((a.purchaseStats?.ticketMedio ?? 0) - (b.purchaseStats?.ticketMedio ?? 0)) * dir;
    case "ltv":
      return ((a.purchaseStats?.ltv ?? 0) - (b.purchaseStats?.ltv ?? 0)) * dir;
    case "recency": {
      // Mais recente = menor "dias desde compra". ASC = mais recentes primeiro.
      const aT = a.lastPurchaseAt ? Date.parse(a.lastPurchaseAt) : 0;
      const bT = b.lastPurchaseAt ? Date.parse(b.lastPurchaseAt) : 0;
      return (bT - aT) * dir;
    }
    case "abcClass": {
      const order = { A: 1, B: 2, C: 3, none: 4 } as Record<string, number>;
      return ((order[a.abcClass ?? "none"] ?? 4) - (order[b.abcClass ?? "none"] ?? 4)) * dir;
    }
    case "status":
      return a.status.localeCompare(b.status) * dir;
  }
}

function buildVehiclesByCustomer(): Map<ID, Set<string>> {
  const out = new Map<ID, Set<string>>();
  for (const v of selectAllVehicles()) {
    const set = out.get(v.customerId) ?? new Set<string>();
    set.add(v.brand);
    out.set(v.customerId, set);
  }
  return out;
}

export const customersApi = {
  list(params: IListCustomersParams = {}): Promise<IPaginatedResult<ICustomer>> {
    return runApi(
      "customersApi",
      "list",
      () => {
        const vehiclesByCustomer = buildVehiclesByCustomer();
        const nowMs = Date.now();
        const all = selectAllCustomers().filter((c) =>
          matches(c, params, vehiclesByCustomer, nowMs),
        );
        const sorted = [...all].sort((a, b) => compareCustomers(a, b, params));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<ICustomer> {
    return runApi(
      "customersApi",
      "get",
      () => {
        const found = selectCustomerById(id);
        if (!found) throw new MockNotFoundError("customer", id);
        return found;
      },
      { payload: { id } },
    );
  },

  async create(input: Omit<ICustomer, "id" | "createdAt" | "notes">): Promise<ICustomer> {
    return runApi(
      "customersApi",
      "create",
      () => {
        if (!input.phone) throw new MockValidationError("phone is required", "phone");
        const id: ID = `cust-${input.type.toLowerCase()}-${crypto.randomUUID()}`;
        const created = {
          ...(input as ICustomer),
          id,
          notes: [],
          createdAt: new Date().toISOString(),
        } as ICustomer;
        upsert("customers", created);
        return created;
      },
      { payload: input },
    );
  },

  async update(id: ID, patch: Partial<ICustomer>): Promise<ICustomer> {
    return runApi(
      "customersApi",
      "update",
      () => {
        const updated = patchById("customers", id, patch as Partial<ICustomer>);
        if (!updated) throw new MockNotFoundError("customer", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  async delete(id: ID): Promise<void> {
    return runApi(
      "customersApi",
      "delete",
      () => {
        const removed = removeById("customers", id);
        if (!removed) throw new MockNotFoundError("customer", id);
      },
      { payload: { id } },
    );
  },

  async addNote(customerId: ID, content: string, authorId: ID): Promise<ICustomerNote> {
    return runApi(
      "customersApi",
      "addNote",
      () => {
        const note: ICustomerNote = {
          id: `note-${crypto.randomUUID()}`,
          authorId,
          content,
          createdAt: new Date().toISOString(),
        };
        const appended = appendCustomerNote(customerId, note);
        if (!appended) throw new MockNotFoundError("customer", customerId);
        return appended;
      },
      { payload: { customerId } },
    );
  },

  async listNotes(customerId: ID): Promise<ICustomerNote[]> {
    return runApi(
      "customersApi",
      "listNotes",
      () => {
        const customer = selectCustomerById(customerId);
        if (!customer) throw new MockNotFoundError("customer", customerId);
        return [...customer.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      { payload: { customerId } },
    );
  },
};
