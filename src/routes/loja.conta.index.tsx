import { createFileRoute } from "@tanstack/react-router";
import { AccountDashboardPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/")({
  component: AccountDashboardPage,
});
