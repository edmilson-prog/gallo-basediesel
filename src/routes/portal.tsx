import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/portal")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Cliente"]),
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:office-building"
      title="Portal do cliente B2B"
      backTo="/loja"
      backLabel="Voltar à vitrine"
    />
  ),
});
