import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { FiscalNoteReviewPage } from "@/features/fiscal-notes/pages/FiscalNoteReviewPage";

/**
 * Destino de menu da Entrada de nota. Sem `$id` a tela escolhe sozinha a
 * primeira nota em conferência — é assim que o kit desenha, e é o que faz a
 * conferência ser alcançável sem passar pela lista.
 */
export const Route = createFileRoute("/app/suprimentos/entrada/")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: () => <FiscalNoteReviewPage />,
});
