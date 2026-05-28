import { createFileRoute } from "@tanstack/react-router";
import { SearchResultsPage, validateSearchSearch } from "@/features/storefront-search";

export const Route = createFileRoute("/loja/busca")({
  validateSearch: validateSearchSearch,
  component: SearchResultsPage,
});
