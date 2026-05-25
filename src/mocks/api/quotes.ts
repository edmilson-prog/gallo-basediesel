import type { ID, IQuote } from "@/shared/types";
import { selectAllQuotes, selectQuoteById } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListQuotesParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  status?: IQuote["status"];
  customerId?: ID;
  leadId?: ID;
}

export const quotesApi = {
  list(params: IListQuotesParams = {}): Promise<IPaginatedResult<IQuote>> {
    return runApi(
      "quotesApi",
      "list",
      () => {
        let all = selectAllQuotes();
        if (params.storeId) all = all.filter((q) => q.storeId === params.storeId);
        if (params.sellerId) all = all.filter((q) => q.sellerId === params.sellerId);
        if (params.status) all = all.filter((q) => q.status === params.status);
        if (params.customerId) all = all.filter((q) => q.customerId === params.customerId);
        if (params.leadId) all = all.filter((q) => q.leadId === params.leadId);
        const sorted = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<IQuote> {
    return runApi("quotesApi", "get", () => {
      const found = selectQuoteById(id);
      if (!found) throw new MockNotFoundError("quote", id);
      return found;
    });
  },

  async create(input: Omit<IQuote, "id" | "createdAt" | "updatedAt">): Promise<IQuote> {
    return runApi("quotesApi", "create", () => {
      const now = new Date().toISOString();
      const quote: IQuote = {
        ...input,
        id: `quote-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      };
      upsert("quotes", quote);
      return quote;
    });
  },

  async update(id: ID, patch: Partial<IQuote>): Promise<IQuote> {
    return runApi("quotesApi", "update", () => {
      const updated = patchById("quotes", id, { ...patch, updatedAt: new Date().toISOString() });
      if (!updated) throw new MockNotFoundError("quote", id);
      return updated;
    });
  },

  async delete(id: ID): Promise<void> {
    return runApi("quotesApi", "delete", () => {
      const removed = removeById("quotes", id);
      if (!removed) throw new MockNotFoundError("quote", id);
    });
  },
};
