import { createFileRoute } from "@tanstack/react-router";
import { NewQuotePage } from "@/features/quotes/pages/NewQuotePage";

export interface INewQuoteSearch {
  applyKitId?: string;
}

function validateNewQuoteSearch(raw: Record<string, unknown>): INewQuoteSearch {
  const out: INewQuoteSearch = {};
  if (typeof raw.applyKitId === "string" && raw.applyKitId.length > 0)
    out.applyKitId = raw.applyKitId;
  return out;
}

export const Route = createFileRoute("/app/orcamentos/novo")({
  validateSearch: validateNewQuoteSearch,
  component: NewQuotePage,
});
