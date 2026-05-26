import type { ID, IQuote, QuoteOrigin, QuoteStatus } from "@/shared/types";
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
  status?: QuoteStatus | QuoteStatus[];
  origin?: QuoteOrigin | QuoteOrigin[];
  customerId?: ID;
  leadId?: ID;
  conversationId?: ID;
  /** Created at >= this ISO timestamp. */
  createdAfter?: string;
  /** Created at <= this ISO timestamp. */
  createdBefore?: string;
  /** Total >= this value. */
  totalMin?: number;
  /** Total <= this value. */
  totalMax?: number;
  /** Substring search across `number`, customer id (loose) and item SKUs. */
  search?: string;
  /** Sort field. */
  orderBy?: "createdAt" | "updatedAt" | "total" | "validUntil";
  orderDir?: "asc" | "desc";
}

function arrayContains<T extends string>(value: T | T[] | undefined, item: T): boolean {
  if (!value) return true;
  if (Array.isArray(value)) return value.length === 0 || value.includes(item);
  return value === item;
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
        if (params.status) all = all.filter((q) => arrayContains(params.status, q.status));
        if (params.origin) all = all.filter((q) => arrayContains(params.origin, q.origin));
        if (params.customerId) all = all.filter((q) => q.customerId === params.customerId);
        if (params.leadId) all = all.filter((q) => q.leadId === params.leadId);
        if (params.conversationId)
          all = all.filter((q) => q.conversationId === params.conversationId);
        if (params.createdAfter)
          all = all.filter((q) => q.createdAt >= (params.createdAfter as string));
        if (params.createdBefore)
          all = all.filter((q) => q.createdAt <= (params.createdBefore as string));
        if (typeof params.totalMin === "number")
          all = all.filter((q) => q.total >= (params.totalMin as number));
        if (typeof params.totalMax === "number")
          all = all.filter((q) => q.total <= (params.totalMax as number));
        if (params.search) {
          const needle = params.search.toLowerCase().trim();
          all = all.filter((q) => {
            if (q.number.toLowerCase().includes(needle)) return true;
            if (q.customerId?.toLowerCase().includes(needle)) return true;
            if (q.items.some((it) => it.partSku.toLowerCase().includes(needle))) return true;
            if (q.items.some((it) => it.partName.toLowerCase().includes(needle))) return true;
            return false;
          });
        }
        const orderBy = params.orderBy ?? "updatedAt";
        const dir = params.orderDir ?? "desc";
        const sorted = [...all].sort((a, b) => {
          const av = (a[orderBy] as string | number) ?? "";
          const bv = (b[orderBy] as string | number) ?? "";
          if (av < bv) return dir === "asc" ? -1 : 1;
          if (av > bv) return dir === "asc" ? 1 : -1;
          return 0;
        });
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
