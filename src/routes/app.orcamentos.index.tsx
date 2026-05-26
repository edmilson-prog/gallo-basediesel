import { createFileRoute } from "@tanstack/react-router";
import { QuotesListPage } from "@/features/quotes/pages/QuotesListPage";
import { validateQuotesSearch } from "@/features/quotes/hooks/useQuotesUrlState";

export const Route = createFileRoute("/app/orcamentos/")({
  validateSearch: validateQuotesSearch,
  component: QuotesListPage,
});
