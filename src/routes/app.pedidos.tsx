import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/pedidos")({
  component: () => <PlaceholderPage prd="032" icon="mdi:clipboard-list" title="Pedidos" />,
});
