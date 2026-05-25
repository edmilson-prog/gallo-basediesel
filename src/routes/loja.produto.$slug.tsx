import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/loja/produto/$slug")({
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:cog"
      title="Ficha de produto"
      backTo="/loja"
      backLabel="Voltar à vitrine"
    />
  ),
});
