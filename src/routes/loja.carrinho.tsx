import { createFileRoute } from "@tanstack/react-router";
import { CartPage } from "@/features/storefront-cart";

export const Route = createFileRoute("/loja/carrinho")({
  component: CartPage,
});
