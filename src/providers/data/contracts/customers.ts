import type { ICustomer, ICustomerNote, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListCustomersParams extends IPaginationParams {
  storeId?: ID;
  status?: ICustomer["status"];
  type?: ICustomer["type"];
  sellerId?: ID;
  search?: string;
  tag?: string;
  orderBy?: "name" | "lastPurchaseAt" | "createdAt";
  orderDir?: "asc" | "desc";
}

/**
 * Contract for customer-related data access.
 *
 * Implementations: `mockCustomersProvider` (Fase 1, delegates to
 * `src/mocks/api/customers.ts`), `supabaseCustomersProvider` (Fase 2, PRD-110+).
 *
 * @see ../../../mocks/api/customers.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ICustomersProvider {
  list(params?: IListCustomersParams): Promise<IPaginatedResult<ICustomer>>;
  get(id: ID): Promise<ICustomer>;
  create(input: Omit<ICustomer, "id" | "createdAt" | "notes">): Promise<ICustomer>;
  update(id: ID, patch: Partial<ICustomer>): Promise<ICustomer>;
  delete(id: ID): Promise<void>;
  addNote(customerId: ID, content: string, authorId: ID): Promise<ICustomerNote>;
  listNotes(customerId: ID): Promise<ICustomerNote[]>;
}
