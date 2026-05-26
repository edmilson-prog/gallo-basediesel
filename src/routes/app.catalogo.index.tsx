import { createFileRoute } from "@tanstack/react-router";
import { CatalogListPage } from "@/features/catalog/pages/CatalogListPage";
import { validateCatalogSearch } from "@/features/catalog/hooks/useCatalogUrlState";

export const Route = createFileRoute("/app/catalogo/")({
  validateSearch: validateCatalogSearch,
  component: CatalogListPage,
});
