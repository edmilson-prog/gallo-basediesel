import { createFileRoute } from "@tanstack/react-router";
import { AccountVehiclesPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/veiculos")({
  component: AccountVehiclesPage,
});
