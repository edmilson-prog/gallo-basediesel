import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/clientes/$id")({
  component: () => (
    <PlaceholderPage
      prd="012"
      icon="mdi:account-details"
      title="Ficha do cliente"
      backTo="/app/clientes"
      backLabel="Voltar para a lista"
    />
  ),
});
