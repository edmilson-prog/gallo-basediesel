import { createFileRoute } from "@tanstack/react-router";
import { NewQuotePage } from "@/features/quotes/pages/NewQuotePage";

export const Route = createFileRoute("/app/orcamentos/novo")({
  component: NewQuotePage,
});
