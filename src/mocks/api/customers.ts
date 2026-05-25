import type { ICustomer, ICustomerNote, ID } from "@/shared/types";
import { selectCustomerById, selectAllCustomers } from "../store/selectors";
import { appendCustomerNote, patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  MockValidationError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListCustomersParams extends IPaginationParams {
  storeId?: ID;
  status?: ICustomer["status"];
  type?: ICustomer["type"];
  sellerId?: ID;
  /** Free-text search across name/cnpj/cpf/email. */
  search?: string;
  tag?: string;
  orderBy?: "name" | "lastPurchaseAt" | "createdAt";
  orderDir?: "asc" | "desc";
}

function displayName(customer: ICustomer): string {
  return customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
}

function matches(customer: ICustomer, params: IListCustomersParams): boolean {
  if (params.storeId && customer.storeId !== params.storeId) return false;
  if (params.status && customer.status !== params.status) return false;
  if (params.type && customer.type !== params.type) return false;
  if (params.sellerId && customer.sellerId !== params.sellerId) return false;
  if (params.tag && !customer.tags.includes(params.tag)) return false;
  if (params.search) {
    const q = params.search.toLowerCase();
    const haystack = [
      displayName(customer),
      customer.email ?? "",
      customer.phone,
      customer.type === "B2B" ? `${customer.cnpj} ${customer.razaoSocial}` : customer.cpf,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
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
  }
}

export const customersApi = {
  list(params: IListCustomersParams = {}): Promise<IPaginatedResult<ICustomer>> {
    return runApi(
      "customersApi",
      "list",
      () => {
        const all = selectAllCustomers().filter((c) => matches(c, params));
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
