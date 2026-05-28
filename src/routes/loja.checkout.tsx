import { createFileRoute } from "@tanstack/react-router";
import { CheckoutPage } from "@/features/storefront-cart";

export const Route = createFileRoute("/loja/checkout")({
  component: CheckoutPage,
});
