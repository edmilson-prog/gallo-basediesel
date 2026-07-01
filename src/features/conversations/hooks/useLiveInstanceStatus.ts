import { useQuery } from "@tanstack/react-query";
import type { ID, IWhatsAppAccount } from "@/shared/types";
import { useWhatsAppAccountsProvider } from "@/providers/data";

const POLL_INTERVAL_MS = 30_000;

/** Query key for a single account's live connection status. */
function liveInstanceStatusKey(accountId: ID | null | undefined): readonly [string, ID | null] {
  return ["whatsapp-account-live-status", accountId ?? null];
}

/**
 * Polls a single WhatsApp account's connection status on a short interval —
 * deliberately independent of `useConversationDetail`'s cached bundle (its
 * `staleTime`/`retry` tuning is settled and shouldn't be perturbed by an
 * unrelated concern). Same `accountId` across many open conversations/list
 * rows shares one cache entry (TanStack Query dedupes by key), so this stays
 * cheap even with dozens of conversations on screen.
 *
 * Falls back to the initially-known account (from the conversation/list
 * fetch) until the first poll resolves, so the instance-down gate never
 * flashes to "unlocked" while this query is still loading.
 */
export function useLiveInstanceStatus(
  account: IWhatsAppAccount | null | undefined,
): IWhatsAppAccount | null {
  const provider = useWhatsAppAccountsProvider();
  const accountId = account?.id ?? null;

  const { data } = useQuery({
    queryKey: liveInstanceStatusKey(accountId),
    queryFn: () => provider.get(accountId as ID),
    enabled: !!accountId,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: POLL_INTERVAL_MS,
  });

  return data ?? account ?? null;
}
