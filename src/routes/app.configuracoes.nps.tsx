import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { NpsSettingsPage } from "@/features/nps/pages/NpsSettingsPage";

/**
 * Permission only, no role ceiling — see app.nps.tsx for why pairing `roles`
 * with `permission` would make the Role Editor inert for this screen.
 */
export const Route = createFileRoute("/app/configuracoes/nps")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings_nps", action: "view" }),
  component: NpsSettingsPage,
});
