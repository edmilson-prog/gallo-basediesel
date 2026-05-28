import { createFileRoute } from "@tanstack/react-router";
import { PWAPortfolioPage } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/carteira/")({
  component: PWAPortfolioPage,
});
