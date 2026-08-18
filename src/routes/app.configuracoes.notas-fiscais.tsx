import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { FiscalNotesSettingsPage } from "@/features/fiscal-notes/pages/FiscalNotesSettingsPage";

export const Route = createFileRoute("/app/configuracoes/notas-fiscais")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings_supplies", action: "view" }),
  component: FiscalNotesSettingsPage,
});
