import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";

/**
 * Stale time of 2 minutes — matches the "cache de 2min" requirement (RNF-003).
 * Reopening the same fiche within the window skips the provider call and
 * renders from cache instantly.
 */
const TWO_MINUTES_MS = 2 * 60 * 1000;

export interface ICustomerProfileQuery {
  customer: ICustomer | null;
  isLoading: boolean;
  isError: boolean;
  notFound: boolean;
  refetch: () => void;
}

export function useCustomerProfile(customerId: ID | null | undefined): ICustomerProfileQuery {
  const provider = useCustomersProvider();
  const query = useQuery({
    queryKey: ["customer-profile", customerId] as const,
    enabled: Boolean(customerId),
    staleTime: TWO_MINUTES_MS,
    gcTime: TWO_MINUTES_MS,
    retry: 1,
    queryFn: async ({ queryKey }) => {
      const [, id] = queryKey;
      if (!id) return null;
      try {
        return await provider.get(id);
      } catch {
        return null;
      }
    },
  });

  return {
    customer: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    notFound: !query.isLoading && !query.isError && query.data === null && Boolean(customerId),
    refetch: () => void query.refetch(),
  };
}
