import { createFileRoute } from "@tanstack/react-router";
import { AccountProfilePage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/perfil")({
  component: AccountProfilePage,
});
