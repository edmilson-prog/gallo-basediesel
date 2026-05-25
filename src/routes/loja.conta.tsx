import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/loja/conta")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Cliente"]),
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:account-circle"
      title="Minha conta"
      backTo="/loja"
      backLabel="Voltar à vitrine"
    />
  ),
});
