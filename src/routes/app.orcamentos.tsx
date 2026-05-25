import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/orcamentos")({
  component: () => (
    <PlaceholderPage prd="031" icon="mdi:file-document-outline" title="Orçamentos" />
  ),
});
