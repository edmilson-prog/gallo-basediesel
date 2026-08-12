import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { NpsAnalyticsPage } from "@/features/nps/pages/NpsAnalyticsPage";

/**
 * Guarded by the permission alone, with no role ceiling.
 *
 * requireAuth combines `roles` and `permission` with AND, so passing
 * ["Owner","Gestor"] here would mean granting `nps` to a custom role in the
 * Role Editor has no effect — the matrix would be inert for this screen. The
 * matrix is the thing that should decide, and today it grants `nps` only to
 * Owner and Gestor anyway.
 */
export const Route = createFileRoute("/app/nps")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "nps", action: "view" }),
  component: NpsAnalyticsPage,
});
