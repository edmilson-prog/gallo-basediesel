import { createFileRoute } from "@tanstack/react-router";
import { AccountNotificationPreferencesPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/preferencias")({
  component: AccountNotificationPreferencesPage,
});
