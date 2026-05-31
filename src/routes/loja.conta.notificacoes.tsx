import { createFileRoute } from "@tanstack/react-router";
import { AccountNotificationsPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/notificacoes")({
  component: AccountNotificationsPage,
});
