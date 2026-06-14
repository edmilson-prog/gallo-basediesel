import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useSellersProvider } from "@/providers/data";

/**
 * The logged-in seller's "nome de exibição nos atendimentos" (`attendantName`),
 * or `null` when unset / unavailable (no seller, blank field). Used to sign
 * outbound WhatsApp messages so the customer knows which attendant is talking.
 *
 * Cached per sellerId; the user form invalidates `["seller"]` on save so a
 * change to the signature takes effect without a reload.
 */
export function useCurrentAttendantName(): string | null {
  const { currentUser } = useAuth();
  const sellers = useSellersProvider();
  const sellerId = currentUser?.sellerId;

  const { data } = useQuery({
    queryKey: ["seller", sellerId],
    queryFn: () => sellers.get(sellerId as string),
    enabled: Boolean(sellerId),
    staleTime: 5 * 60_000,
  });

  return data?.attendantName?.trim() || null;
}
