import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  PWAQuickQuotePage,
  readPwaSessionSync,
  type IPwaQuickQuoteSearch,
} from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/orcamento-rapido")({
  validateSearch: (search: Record<string, unknown>): IPwaQuickQuoteSearch => ({
    customerId: typeof search.customerId === "string" ? search.customerId : undefined,
  }),
  beforeLoad: () => {
    if (!readPwaSessionSync()) throw redirect({ to: "/pwa/login" });
  },
  component: PWAQuickQuotePage,
});
