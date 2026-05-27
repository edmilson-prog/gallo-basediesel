import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { RankingPage, validateRankingSearch } from "@/features/gamification";

export const Route = createFileRoute("/app/gestao/ranking/")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validateRankingSearch,
  component: RankingPage,
});
