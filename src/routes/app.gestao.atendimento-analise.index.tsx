import { createFileRoute } from "@tanstack/react-router";
import { CustomerServiceAnalyticsPage } from "@/features/customer-service-analytics";

export const Route = createFileRoute("/app/gestao/atendimento-analise/")({
  component: CustomerServiceAnalyticsPage,
});
