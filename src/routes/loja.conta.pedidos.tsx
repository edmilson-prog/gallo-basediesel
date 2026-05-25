import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/loja/conta/pedidos")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Cliente"]),
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:clipboard-list"
      title="Meus pedidos"
      backTo="/loja/conta"
      backLabel="Voltar à conta"
    />
  ),
});
