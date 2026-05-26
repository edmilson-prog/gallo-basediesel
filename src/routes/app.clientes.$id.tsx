import { createFileRoute, useParams } from "@tanstack/react-router";
import { CustomerProfile } from "@/features/customers/components/CustomerProfile";

export const Route = createFileRoute("/app/clientes/$id")({
  component: CustomerProfileRoute,
});

function CustomerProfileRoute() {
  const { id } = useParams({ from: "/app/clientes/$id" });
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <CustomerProfile customerId={id} variant="page" className="mx-auto w-full max-w-3xl" />
    </div>
  );
}
