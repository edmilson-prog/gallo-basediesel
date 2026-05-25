import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/app/leads")({
  component: () => (
    <PlaceholderPage prd="017" icon="mdi:account-question" title="Pipeline de leads" />
  ),
});
