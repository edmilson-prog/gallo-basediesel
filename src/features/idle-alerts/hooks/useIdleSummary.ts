import { useQuery } from "@tanstack/react-query";
import { useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import type { ID, IIdleSummary } from "@/shared/types";

const POLL_MS = 60_000;

/**
 * Signed-in seller's idle-conversation summary. Polls every 60s; fails
 * SILENT (chip/panel simply hide) — no error toasts (spec: degradação).
 * Own query key — deliberately outside the frozen Atendimento cache keys.
 *
 * Identity: `currentUser.sellerId` is the REAL seller id conversations are
 * assigned to (`assignedSellerId`) — distinct from the auth/profile `id` in
 * both backends (mock: profile.id vs profile.sellerId; supabase: auth user id
 * vs profiles.seller_id). Gating on `sellerId` alone (no `?? currentUser.id`
 * fallback) mirrors every other seller-scoped read in this codebase (e.g.
 * useInboxActivityMonitor, InboxPage) — falling back to the profile id here
 * would silently query under the wrong identity instead of just staying
 * disabled, which is worse for a feature designed to fail quietly.
 */
export function useIdleSummary(): { summary: IIdleSummary | undefined; isLoading: boolean } {
  const provider = useConversationsProvider();
  const { currentUser } = useAuth();
  const sellerId: ID | null = currentUser?.sellerId ?? null;
  const query = useQuery<IIdleSummary>({
    queryKey: ["idle-summary", sellerId ?? "anon"],
    queryFn: () => provider.getIdleSummary(),
    enabled: Boolean(sellerId),
    refetchInterval: POLL_MS,
    staleTime: 30_000,
    retry: 1,
  });
  return { summary: query.data, isLoading: query.isLoading };
}
