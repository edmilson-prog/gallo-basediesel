import { createFileRoute } from "@tanstack/react-router";
import { CategoryListingPage, validateCategorySearch } from "@/features/storefront-category";

export const Route = createFileRoute("/loja/categoria/$slug")({
  validateSearch: validateCategorySearch,
  component: CategoryListingPage,
});
