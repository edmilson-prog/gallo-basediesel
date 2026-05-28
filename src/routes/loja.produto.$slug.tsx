import { createFileRoute } from "@tanstack/react-router";
import { ProductDetailPage } from "@/features/storefront-product";

export const Route = createFileRoute("/loja/produto/$slug")({
  component: ProductDetailPage,
});
