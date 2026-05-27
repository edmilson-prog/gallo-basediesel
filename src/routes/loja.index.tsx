import { createFileRoute } from "@tanstack/react-router";
import { StorefrontHomePage } from "@/features/storefront";

export const Route = createFileRoute("/loja/")({
  component: StorefrontHomePage,
});
