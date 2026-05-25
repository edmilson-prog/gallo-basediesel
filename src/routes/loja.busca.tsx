import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/loja/busca")({
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:magnify"
      title="Busca avançada"
      backTo="/loja"
      backLabel="Voltar à vitrine"
    />
  ),
});
