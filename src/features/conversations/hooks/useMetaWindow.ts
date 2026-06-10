import { useEffect, useMemo, useState } from "react";
import type { IConversation, IMessage, IWhatsAppAccount } from "@/shared/types";
import { getActiveDataSource, useMessagesProvider } from "@/providers/data";
import {
  computeSessionWindow,
  formatRemaining,
  SESSION_WINDOW_MS,
  type MetaWindowState,
} from "../engine/sessionWindow";
import { useConversationContext } from "./ConversationContext";

export type { MetaWindowState };
export { formatRemaining };

export interface IMetaWindowSnapshot {
  /** True only when provider is Meta. */
  applicable: boolean;
  /** Last `direction='in'` message timestamp, ISO. */
  lastInboundAt: string | null;
  /** Milliseconds remaining before the window closes. 0 when closed. */
  msRemaining: number;
  state: MetaWindowState;
  /** Convenience flag — whether free-text sending is allowed. */
  canSendFreeText: boolean;
}

function lastInbound(messages: IMessage[]): IMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.direction === "in") return m;
  }
  return null;
}

/** Picks the most recent of two optional ISO timestamps. */
function newest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Compute the Meta provider's 24-hour conversation window state (PRD-117).
 *
 * Only meaningful when the account uses the Meta Cloud API and the
 * conversation is not archived. Other providers (Evolution) advertise
 * `supportsProactiveMessaging` and have no equivalent restriction.
 *
 * The math lives in the pure `engine/sessionWindow.ts`; this hook adds the
 * reactive shell: a 30s tick, the in-memory message stream (Realtime inserts
 * land there, reopening the window in real time) and — on the `supabase`
 * source — an exact seed from the `last_inbound_at` RPC, so the countdown is
 * correct even when the loaded message page contains no inbound rows.
 * The mock source keeps the Fase-1 behaviour byte-identical (falls back to
 * `conversation.lastMessageAt` when no inbound message is loaded).
 */
export function useMetaWindow(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IMetaWindowSnapshot {
  const { messages: msg } = useConversationContext();
  const provider = useMessagesProvider();
  const [now, setNow] = useState(() => Date.now());
  const [rpcSeed, setRpcSeed] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const applicable =
    conversation.channel === "whatsapp" &&
    !!whatsappAccount &&
    whatsappAccount.provider === "meta" &&
    conversation.status !== "arquivada";

  const isSupabase = getActiveDataSource() === "supabase";

  // Exact seed (supabase only): the visible page may hold zero inbound rows
  // (e.g. a long outbound streak), and `lastMessageAt` counts outbound too —
  // both would wrongly extend the window. Best-effort: on failure the
  // in-memory stream still drives the state.
  useEffect(() => {
    if (!isSupabase || !applicable) return;
    let cancelled = false;
    setRpcSeed(null);
    provider
      .getLastInboundAt(conversation.id)
      .then((ts) => {
        if (!cancelled) setRpcSeed(ts);
      })
      .catch(() => {
        /* keep null — in-memory inbound still applies */
      });
    return () => {
      cancelled = true;
    };
  }, [applicable, conversation.id, isSupabase, provider]);

  return useMemo<IMetaWindowSnapshot>(() => {
    if (!applicable) {
      return {
        applicable: false,
        lastInboundAt: null,
        msRemaining: SESSION_WINDOW_MS,
        state: "open-fresh",
        canSendFreeText: true,
      };
    }

    const inboundInMemory = lastInbound(msg.messages)?.sentAt ?? null;
    // Mock keeps the Fase-1 fallback; supabase trusts RPC + live stream only
    // (no inbound at all => window never opened => template required).
    const lastInboundAt = isSupabase
      ? newest(rpcSeed, inboundInMemory)
      : (inboundInMemory ?? conversation.lastMessageAt);

    const w = computeSessionWindow({ provider: "meta", lastInboundAt, nowMs: now });
    return {
      applicable: true,
      lastInboundAt: w.lastInboundAt,
      msRemaining: w.msRemaining,
      state: w.state,
      canSendFreeText: w.canSendFreeText,
    };
  }, [applicable, conversation.lastMessageAt, isSupabase, msg.messages, now, rpcSeed]);
}
