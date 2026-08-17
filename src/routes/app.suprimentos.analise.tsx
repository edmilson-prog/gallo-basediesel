import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { FiscalAnalysisPage } from "@/features/fiscal-notes/pages/FiscalAnalysisPage";

export const Route = createFileRoute("/app/suprimentos/analise")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: FiscalAnalysisPage,
});
