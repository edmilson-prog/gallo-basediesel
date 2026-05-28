import { createFileRoute } from "@tanstack/react-router";
import { AccountOrderDetailPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/pedidos/$id")({
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  const { id } = Route.useParams();
  return <AccountOrderDetailPage orderId={id} />;
}
