import { createFileRoute } from "@tanstack/react-router";
import { ConversationPage } from "@/features/conversations";

export const Route = createFileRoute("/app/atendimento/$id")({
  component: ConversationPage,
});
