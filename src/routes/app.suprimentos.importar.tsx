import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { FiscalNotesImportPage } from "@/features/fiscal-notes/pages/FiscalNotesImportPage";

export const Route = createFileRoute("/app/suprimentos/importar")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: FiscalNotesImportPage,
});
