import { createFileRoute } from "@tanstack/react-router";
import { PWACustomerDetailPage } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/carteira/$id")({
  component: PWACustomerDetailPage,
});
