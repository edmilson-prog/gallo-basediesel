import { createFileRoute } from "@tanstack/react-router";
import { PWAAgendaPage } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/agenda/")({
  component: PWAAgendaPage,
});
