import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { ExecutiveCockpitPage, validateCockpitSearch } from "@/features/executive-cockpit";

export const Route = createFileRoute("/app/gestao/")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor", "Financeiro"]),
  validateSearch: validateCockpitSearch,
  component: ExecutiveCockpitPage,
});
