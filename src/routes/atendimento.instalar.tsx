import { createFileRoute } from "@tanstack/react-router";
import { InstallPage } from "@/features/pwa-atendimento/pages/InstallPage";

export const Route = createFileRoute("/atendimento/instalar")({
  component: InstallPage,
});
