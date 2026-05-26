import type { ID, IQuote, QuoteOrigin, QuoteStatus } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListQuotesParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  status?: QuoteStatus | QuoteStatus[];
  origin?: QuoteOrigin | QuoteOrigin[];
  customerId?: ID;
  leadId?: ID;
  conversationId?: ID;
  createdAfter?: string;
  createdBefore?: string;
  totalMin?: number;
  totalMax?: number;
  search?: string;
  orderBy?: "createdAt" | "updatedAt" | "total" | "validUntil";
  orderDir?: "asc" | "desc";
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
