import { createFileRoute } from "@tanstack/react-router";
import { NewQuotePage } from "@/features/quotes/pages/NewQuotePage";

export interface INewQuoteSearch {
  applyKitId?: string;
  /**
   * Quote a LEAD directly, without converting it into a customer first — the
   * "Só orçamento" shortcut on the Atendimento panel. `quotes.lead_id` and
   * `IQuote.leadId` already model this ("mutually exclusive with customerId");
   * what was missing was a way in.
   */
  leadId?: string;
}

function validateNewQuoteSearch(raw: Record<string, unknown>): INewQuoteSearch {
  const out: INewQuoteSearch = {};
  if (typeof raw.applyKitId === "string" && raw.applyKitId.length > 0)
    out.applyKitId = raw.applyKitId;
  if (typeof raw.leadId === "string" && raw.leadId.length > 0) out.leadId = raw.leadId;
  return out;
}

export const Route = createFileRoute("/app/orcamentos/novo")({
  validateSearch: validateNewQuoteSearch,
  component: NewQuotePage,
});
