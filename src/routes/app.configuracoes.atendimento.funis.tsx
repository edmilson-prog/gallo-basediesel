import { createFileRoute } from "@tanstack/react-router";
import { FunnelsSettingsPage } from "@/features/funnels/pages/FunnelsSettingsPage";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/configuracoes/atendimento/funis")({
  // Mirrors the sidebar entry (funnel:view). Without a guard this admin screen
  // was reachable by URL from any role the /app shell lets in.
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "funnel", action: "view" }),
  component: FunnelsSettingsPage,
});
