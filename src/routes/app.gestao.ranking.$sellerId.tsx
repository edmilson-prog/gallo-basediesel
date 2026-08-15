import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SellerRankingDetailPage } from "@/features/gamification/pages/SellerRankingDetailPage";

export const Route = createFileRoute("/app/gestao/ranking/$sellerId")({
  // "Vendedor" removed alongside the index route — see issue #421.
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor", "Financeiro"]),
  component: SellerRankingDetailPage,
});
