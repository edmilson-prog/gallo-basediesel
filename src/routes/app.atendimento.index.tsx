import { createFileRoute } from "@tanstack/react-router";
import { InboxCenterPlaceholder } from "@/features/conversations";

export const Route = createFileRoute("/app/atendimento/")({
  component: InboxCenterPlaceholder,
});
