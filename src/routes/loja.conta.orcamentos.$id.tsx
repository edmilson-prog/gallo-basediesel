import { createFileRoute } from "@tanstack/react-router";
import { AccountQuoteDetailPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/orcamentos/$id")({
  component: QuoteDetailRoute,
});

function QuoteDetailRoute() {
  const { id } = Route.useParams();
  return <AccountQuoteDetailPage quoteId={id} />;
}
