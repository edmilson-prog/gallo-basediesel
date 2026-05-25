import type { ID, IQuote } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListQuotesParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  status?: IQuote["status"];
  customerId?: ID;
  leadId?: ID;
}

/**
 * Contract for sales quote access.
 *
 * @see ../../../mocks/api/quotes.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IQuotesProvider {
  list(params?: IListQuotesParams): Promise<IPaginatedResult<IQuote>>;
  get(id: ID): Promise<IQuote>;
  create(input: Omit<IQuote, "id" | "createdAt" | "updatedAt">): Promise<IQuote>;
  update(id: ID, patch: Partial<IQuote>): Promise<IQuote>;
  delete(id: ID): Promise<void>;
}
