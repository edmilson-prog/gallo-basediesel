import { useEffect, useState } from "react";
import type { IConversation, IMessage, IWhatsAppAccount } from "@/shared/types";
import { useConversationContext } from "./ConversationContext";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type MetaWindowState = "open-fresh" | "open-soon" | "open-closing" | "closed";

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

function pickState(msRemaining: number): MetaWindowState {
  if (msRemaining <= 0) return "closed";
  const hours = msRemaining / 3_600_000;
  if (hours <= 1) return "open-closing";
  if (hours <= 12) return "open-soon";
  return "open-fresh";
}

function lastInbound(messages: IMessage[]): IMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.direction === "in") return m;
  }
  return null;
}

/**
 * Compute the Meta provider's 24-hour conversation window state.
 *
 * Only meaningful when the account uses the Meta Cloud API and the
 * conversation is not archived. Other providers (Evolution) advertise
 * `supportsProactiveMessaging` and have no equivalent restriction.
 *
 * The hook re-evaluates every 30 seconds via a local timer so the
 * indicator and the input both stay in sync without prop drilling.
 */
export function useMetaWindow(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IMetaWindowSnapshot {
  const { messages: msg } = useConversationContext();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const applicable =
    conversation.channel === "whatsapp" &&
    !!whatsappAccount &&
    whatsappAccount.provider === "meta" &&
    conversation.status !== "arquivada";

  if (!applicable) {
    return {
      applicable: false,
      lastInboundAt: null,
      msRemaining: WINDOW_MS,
      state: "open-fresh",
      canSendFreeText: true,
    };
  }

  const inbound = lastInbound(msg.messages);
  const lastInboundAt = inbound?.sentAt ?? conversation.lastMessageAt;
  const elapsed = now - new Date(lastInboundAt).getTime();
  const msRemaining = Math.max(0, WINDOW_MS - elapsed);
  const state = pickState(msRemaining);

  return {
    applicable: true,
    lastInboundAt,
    msRemaining,
    state,
    canSendFreeText: msRemaining > 0,
  };
}

export function formatRemaining(msRemaining: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes };
}
