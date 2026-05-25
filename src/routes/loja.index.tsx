import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/loja/")({
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:storefront"
      title="Vitrine GALLO PARTS"
      backTo="/loja"
      backLabel="Explorar"
    />
  ),
});
