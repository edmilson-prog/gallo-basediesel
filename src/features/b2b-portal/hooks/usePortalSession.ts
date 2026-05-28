import { useQuery } from "@tanstack/react-query";
import type { ICustomer, IPortalUser } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data";
import { usePortalStore } from "../store/portalStore";
import { usePortalAuthStore } from "../store/portalAuthStore";

export interface IPortalSessionData {
  user: IPortalUser | null;
  customer: ICustomer | null;
  isLoadingCustomer: boolean;
}

/**
 * Resolves the signed-in portal user + their company (PRD-071). Returns the
 * fresh user record from the store and the customer snapshot from the provider.
 */
export function usePortalSession(): IPortalSessionData {
  const session = usePortalAuthStore((s) => s.session);
  const users = usePortalStore((s) => s.users);
  const provider = useCustomersProvider();

  const user = session ? (users.find((u) => u.id === session.portalUserId) ?? null) : null;

  const customerQuery = useQuery({
    queryKey: ["portal", "customer", session?.customerId] as const,
    enabled: Boolean(session?.customerId),
    staleTime: 60_000,
    queryFn: () => provider.get(session!.customerId),
  });

  return {
    user,
    customer: customerQuery.data ?? null,
    isLoadingCustomer: customerQuery.isLoading,
  };
}
