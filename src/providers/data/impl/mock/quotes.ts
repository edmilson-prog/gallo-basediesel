import { quotesApi } from "@/mocks";
import type { IQuotesProvider } from "../../contracts/quotes";

export const mockQuotesProvider: IQuotesProvider = {
  list: (params) => quotesApi.list(params),
  get: (id) => quotesApi.get(id),
  create: (input) => quotesApi.create(input),
  update: (id, patch) => quotesApi.update(id, patch),
  delete: (id) => quotesApi.delete(id),
};
