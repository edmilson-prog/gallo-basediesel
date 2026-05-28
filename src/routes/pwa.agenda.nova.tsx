import { createFileRoute } from "@tanstack/react-router";
import { PWANewVisitPage, type IPwaNewVisitSearch } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/agenda/nova")({
  validateSearch: (search: Record<string, unknown>): IPwaNewVisitSearch => ({
    customerId: typeof search.customerId === "string" ? search.customerId : undefined,
  }),
  component: PWANewVisitPage,
});
