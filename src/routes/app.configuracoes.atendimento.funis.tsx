import { createFileRoute } from "@tanstack/react-router";
import { FunnelsSettingsPage } from "@/features/funnels/pages/FunnelsSettingsPage";

export const Route = createFileRoute("/app/configuracoes/atendimento/funis")({
  component: FunnelsSettingsPage,
});
