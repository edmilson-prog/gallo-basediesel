import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

/**
 * Optimistic conversation-tag writes. ONLY touches the
 * `["conversation-detail", id]` cache (frozen-layer-safe); the inbox list
 * refreshes via the existing realtime `conversations` channel in supabase
 * mode, or on its next refetch in mock mode.
 */
export interface IUseConversationTagsMutationResult {
  setTags: (next: ID[]) => Promise<void>;
  toggleTag: (tagId: ID) => Promise<void>;
  saving: boolean;
}

interface IDetailCacheShape {
  conversation: IConversation | null;
}

export function useConversationTagsMutation(
  conversation: IConversation,
  opts?: { onDone?: () => void },
): IUseConversationTagsMutationResult {
  const conversationsProvider = useConversationsProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const setTags = useCallback(
    async (next: ID[]) => {
      const key = ["conversation-detail", conversation.id] as const;
      const before = conversation.tags;
      const snapshot = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: IDetailCacheShape | undefined) =>
        old?.conversation
          ? { ...old, conversation: { ...old.conversation, tags: next } }
          : old,
      );
      setSaving(true);
      try {
        await conversationsProvider.update(conversation.id, { tags: next });
        opts?.onDone?.();
        if (currentUser) {
          void recordAuditLog({
            actorId: currentUser.id,
            storeId: conversation.storeId,
            action: "conversation.tags_update",
            resource: "conversation",
            resourceId: conversation.id,
            before: { tags: before },
            after: { tags: next },
          });
        }
      } catch {
        queryClient.setQueryData(key, snapshot);
        toast.error(CONVERSATION_STRINGS.tags.updateFailed);
      } finally {
        setSaving(false);
      }
    },
    [conversation.id, conversation.storeId, conversation.tags, conversationsProvider, currentUser, opts, queryClient],
  );

  const toggleTag = useCallback(
    async (tagId: ID) => {
      const has = conversation.tags.includes(tagId);
      const next = has ? conversation.tags.filter((t) => t !== tagId) : [...conversation.tags, tagId];
      await setTags(next);
    },
    [conversation.tags, setTags],
  );

  return { setTags, toggleTag, saving };
}
