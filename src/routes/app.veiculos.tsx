import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/veiculos")({
  component: () => <PlaceholderPage prd="016" icon="mdi:truck" title="Veículos" />,
});
