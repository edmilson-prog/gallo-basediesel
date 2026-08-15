import { createFileRoute } from "@tanstack/react-router";
import { ConversaPage } from "@/features/pwa-atendimento/pages/ConversaPage";

export const Route = createFileRoute("/atendimento/conversa/$id/")({
  component: ConversaPage,
});
