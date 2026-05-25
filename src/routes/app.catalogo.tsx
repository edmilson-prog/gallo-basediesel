import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/catalogo")({
  component: () => <PlaceholderPage prd="030" icon="mdi:cog" title="Catálogo interno" />,
});
