import { useCallback, useEffect, useState } from "react";
import type { ID, IConversation } from "@/shared/types";

const PREFIX = "gallo-conversation-last-view";

function buildKey(userId: ID, conversationId: ID): string {
  return `${PREFIX}-${userId}-${conversationId}`;
}

function readLastView(userId: ID, conversationId: ID): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(buildKey(userId, conversationId));
  } catch {
    return null;
  }
}

function writeLastView(userId: ID, conversationId: ID, iso: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildKey(userId, conversationId), iso);
  } catch {
    // ignore
  }
}

/**
 * Track per-user "last-viewed" timestamps to derive an unread count without
 * mutating the conversation entity.
 *
 * Two flavors of unread coexist on the MVP:
 *   - `conversation.unreadCount` set by the mock when inbound traffic
 *     arrives. Authoritative for the badge on the item.
 *   - per-user "viewed" markers below — used to bold the row even after the
 *     mock counter is reset (e.g. when another tab marked the conversation
 *     read).
 *
 * Fase 2 swaps this for a Supabase `conversation_views(user_id, ...)` table.
 */
export function useUnreadTracking(userId: ID | null): {
  isUnread: (conversation: IConversation) => boolean;
  markViewed: (conversationId: ID, when?: string) => void;
} {
  // Bump on `markViewed` to force re-renders for components reading isUnread.
  const [, setTick] = useState(0);

  const isUnread = useCallback(
    (conversation: IConversation): boolean => {
      if (!userId) return conversation.unreadCount > 0;
      const last = readLastView(userId, conversation.id);
      if (!last) return conversation.unreadCount > 0;
      return last < conversation.lastMessageAt;
    },
    [userId],
  );

  const markViewed = useCallback(
    (conversationId: ID, when?: string) => {
      if (!userId) return;
      writeLastView(userId, conversationId, when ?? new Date().toISOString());
      setTick((t) => t + 1);
    },
    [userId],
  );

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith(PREFIX)) return;
      setTick((t) => t + 1);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { isUnread, markViewed };
}
