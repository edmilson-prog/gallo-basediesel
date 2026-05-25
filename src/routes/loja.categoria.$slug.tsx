import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/loja/categoria/$slug")({
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:format-list-bulleted"
      title="Categoria"
      backTo="/loja"
      backLabel="Voltar à vitrine"
    />
  ),
});
