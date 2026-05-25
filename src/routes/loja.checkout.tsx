import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/loja/checkout")({
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:credit-card-outline"
      title="Checkout"
      backTo="/loja/carrinho"
      backLabel="Voltar ao carrinho"
    />
  ),
});
