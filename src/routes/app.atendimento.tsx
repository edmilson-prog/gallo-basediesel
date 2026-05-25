import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/atendimento")({
  component: () => <PlaceholderPage prd="010" icon="mdi:message-text" title="Inbox unificado" />,
});
