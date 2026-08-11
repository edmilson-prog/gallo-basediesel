import { createFileRoute } from "@tanstack/react-router";
import { MidiasPage } from "@/features/pwa-atendimento/pages/MidiasPage";

export const Route = createFileRoute("/atendimento/conversa/$id/midias")({
  component: MidiasPage,
});
