import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";

/**
 * Lists all quotes attached to a given customer (PRD-065 RF-029).
 *
 * Excludes purely internal `rascunho` drafts — the customer should only see
 * what has been formally sent (or further along the lifecycle).
 */
export function useCustomerQuotes(customerId: ID | undefined) {
  const provider = useQuotesProvider();
  return useQuery({
    queryKey: ["customer-account", "quotes", customerId] as const,
    enabled: Boolean(customerId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!customerId) return [];
      const result = await provider.list({
        customerId,
        status: ["enviado", "aceito", "recusado", "expirado", "convertido"],
        pageSize: 200,
        orderBy: "createdAt",
        orderDir: "desc",
      });
      return result.data;
    },
  });
}
