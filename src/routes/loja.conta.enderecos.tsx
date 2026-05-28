import { createFileRoute } from "@tanstack/react-router";
import { AccountAddressesPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/enderecos")({
  component: AccountAddressesPage,
});
