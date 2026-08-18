import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { FiscalNoteReviewPage } from "@/features/fiscal-notes/pages/FiscalNoteReviewPage";

export const Route = createFileRoute("/app/suprimentos/entrada/$id")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <FiscalNoteReviewPage noteId={id} />;
}
