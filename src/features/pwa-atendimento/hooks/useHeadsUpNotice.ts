import { useCallback, useEffect, useRef, useState } from "react";
import type { ID } from "@/shared/types";
import { getActiveDataSource } from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";
import type { IMessageRealtimeRow } from "@/features/conversations/hooks/useRealtimeMessages";

const IS_SUPABASE = getActiveDataSource() === "supabase";
const AUTO_DISMISS_MS = 5200;

export interface IHeadsUpNotice {
  conversationId: ID;
  /** Message body, already trimmed for the two-line clamp. */
  body: string;
}

export interface IUseHeadsUpNoticeOptions {
  /** Conversation currently on screen — its own messages never raise a band. */
  activeConversationId?: ID | null;
  /** Off when the user turned the in-app band off in the preferences. */
  enabled: boolean;
}

/**
 * In-app band for a message arriving in ANOTHER conversation.
 *
 * It listens to the shared `messages` channel directly rather than diffing the
 * list, so it works on the thread screen too — where no conversation list is
 * loaded — without costing a single extra query.
 */
export function useHeadsUpNotice({
  activeConversationId = null,
  enabled,
}: IUseHeadsUpNoticeOptions) {
  const [notice, setNotice] = useState<IHeadsUpNotice | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setNotice(null);
  }, []);

  useEffect(() => {
    if (!IS_SUPABASE || !enabled) return;

    const off = subscribeToTable("messages", (payload) => {
      if (payload.eventType !== "INSERT") return;
      const row = payload.new as Partial<IMessageRealtimeRow> | null;
      if (!row?.conversation_id || row.direction !== "in") return;
      if (row.conversation_id === activeConversationId) return;

      const text = typeof row.text === "string" ? row.text.trim() : "";
      setNotice({
        conversationId: row.conversation_id,
        body: text || "Nova mensagem",
      });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setNotice(null), AUTO_DISMISS_MS);
    });

    return () => {
      off();
      window.clearTimeout(timerRef.current);
    };
  }, [enabled, activeConversationId]);

  // Never leave a band pointing at the conversation the user just opened.
  useEffect(() => {
    if (notice && notice.conversationId === activeConversationId) dismiss();
  }, [notice, activeConversationId, dismiss]);

  return { notice, dismiss };
}
