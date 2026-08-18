import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { RankingPage, validateRankingSearch } from "@/features/gamification";

export const Route = createFileRoute("/app/gestao/ranking/")({
  // "Vendedor" removed (issue #421): the ranking is scored client-side from
  // store-wide orders/customers, which per-seller RLS truncates to the
  // caller's own rows — every colleague scored 0 and the viewer always read
  // "#1". Restore once a SECURITY DEFINER ranking RPC exists.
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor", "Financeiro"]),
  validateSearch: validateRankingSearch,
  component: RankingPage,
});
