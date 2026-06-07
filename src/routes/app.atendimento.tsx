import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { ConversationLayout } from "@/features/shell/layouts/ConversationLayout";
import { InboxPage, validateInboxSearch } from "@/features/conversations";

export const Route = createFileRoute("/app/atendimento")({
  validateSearch: validateInboxSearch,
  component: AtendimentoLayout,
});

function AtendimentoLayout() {
  const params = useParams({ strict: false }) as { id?: string };
  const hasSelection = Boolean(params.id);
  return (
    <ConversationLayout
      listSlot={<InboxPage />}
      conversationSlot={<Outlet />}
      mobileShow={hasSelection ? "conversation" : "list"}
    />
  );
}
