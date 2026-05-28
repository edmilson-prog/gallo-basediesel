import { createFileRoute } from "@tanstack/react-router";
import { AccountQuotesPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/orcamentos/")({
  component: AccountQuotesPage,
});
