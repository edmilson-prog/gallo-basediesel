import { createFileRoute } from "@tanstack/react-router";
import { OrderConfirmedPage } from "@/features/storefront-cart";

export const Route = createFileRoute("/loja/pedido-confirmado/$orderId")({
  component: OrderConfirmedPage,
});
