import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IQuickReply } from "@/shared/types";
import { useQuickReplyProvider } from "@/providers/data";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";

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
  const sellerId = getCurrentContext().user?.id ?? "anon";

  const repliesQuery = useQuery({
    queryKey: ["quick-send", "replies", sellerId],
    queryFn: () => provider.list({ sellerId }),
  });

  const replies = repliesQuery.data ?? [];

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
