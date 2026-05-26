import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/clientes/")({
  component: () => <PlaceholderPage prd="015" icon="mdi:account-multiple" title="Clientes" />,
});
