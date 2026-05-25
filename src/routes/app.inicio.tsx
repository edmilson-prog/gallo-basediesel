import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/inicio")({
  component: () => (
    <PlaceholderPage prd="014" icon="mdi:home-variant" title="Início — dashboard do operador" />
  ),
});
