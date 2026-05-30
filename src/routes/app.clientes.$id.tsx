import { createFileRoute, useParams } from "@tanstack/react-router";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";

export const Route = createFileRoute("/app/clientes/$id")({
  component: CustomerProfileRoute,
});

function CustomerProfileRoute() {
  const { id } = useParams({ from: "/app/clientes/$id" });
  return <CustomerDetailPage customerId={id} />;
}
