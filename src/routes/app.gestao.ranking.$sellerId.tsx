import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SellerRankingDetailPage } from "@/features/gamification/pages/SellerRankingDetailPage";

export const Route = createFileRoute("/app/gestao/ranking/$sellerId")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  component: SellerRankingDetailPage,
});
