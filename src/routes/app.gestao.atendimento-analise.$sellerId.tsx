import { createFileRoute } from "@tanstack/react-router";
import { SellerServicePage } from "@/features/customer-service-analytics";

export const Route = createFileRoute("/app/gestao/atendimento-analise/$sellerId")({
  component: SellerServicePage,
});
