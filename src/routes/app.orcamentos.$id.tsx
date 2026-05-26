import { createFileRoute } from "@tanstack/react-router";
import { QuoteDetailPage } from "@/features/quotes/pages/QuoteDetailPage";

export const Route = createFileRoute("/app/orcamentos/$id")({
  component: QuoteDetailPage,
});
