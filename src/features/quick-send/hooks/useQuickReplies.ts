import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IQuickReply } from "@/shared/types";
import { useQuickReplyProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";

/**
 * Foundation data hook for quick replies / snippets (PRD-027). Lists the
 * seller's visible snippets (own private + store shared) and resolves a
 * shortcut synchronously from the loaded list.
 */
export function useQuickReplies(): {
  replies: IQuickReply[];
  isLoading: boolean;
  findByShortcut: (shortcut: string) => IQuickReply | null;
} {
  const provider = useQuickReplyProvider();
  // Identity must be the REAL seller id (sellers.id), not the auth profile id.
  // The provider filters `owner_id = sellerId` and the write path stores
  // `ownerId = currentUser.sellerId`, so a profile id here makes private replies
  // invisible. The matching write-side identity lives in useSendAsset.
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId ?? "anon";

  const repliesQuery = useQuery({
    queryKey: ["quick-send", "replies", sellerId],
    queryFn: () => provider.list({ sellerId }),
  });

  // Stabilize identity so the `?? []` fallback doesn't produce a fresh array
  // every render (clears react-hooks/exhaustive-deps on findByShortcut).
  const replies = useMemo(() => repliesQuery.data ?? [], [repliesQuery.data]);

  const findByShortcut = useCallback(
    (shortcut: string): IQuickReply | null => {
      const candidates = replies.filter((r) => r.shortcut === shortcut);
      const own = candidates.find((r) => r.scope === "private" && r.ownerId === sellerId);
      if (own) return own;
      return candidates.find((r) => r.scope === "shared") ?? null;
    },
    [replies, sellerId],
  );

  return {
    replies,
    isLoading: repliesQuery.isLoading,
    findByShortcut,
  };
}
