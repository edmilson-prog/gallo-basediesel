import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/sdr")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => <PlaceholderPage prd="024" icon="mdi:robot" title="Painel do agente SDR" />,
});
