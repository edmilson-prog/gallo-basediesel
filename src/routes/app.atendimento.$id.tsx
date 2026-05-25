import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/atendimento/$id")({
  component: () => (
    <PlaceholderPage
      prd="011"
      icon="mdi:message-text-outline"
      title="Conversa"
      backTo="/app/atendimento"
      backLabel="Voltar para o inbox"
    />
  ),
});
