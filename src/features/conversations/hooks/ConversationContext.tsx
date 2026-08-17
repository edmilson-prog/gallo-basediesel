import { createContext, useContext, type ReactNode } from "react";
import type { IUseMessagesResult } from "./useMessages";

export interface IConversationContextValue {
  messages: IUseMessagesResult;
  /** Opens the "Nova conversa" dialog pre-filled for this contact (e.g. from a
   *  shared-contact-card bubble's "Abrir conversa" shortcut). Optional so
   *  contexts that don't offer the shortcut (tests, future call sites) aren't
   *  forced to wire it. */
  openContactConversation?: (contact: { name?: string; phone: string }) => void;
}

const Ctx = createContext<IConversationContextValue | null>(null);

export function ConversationProvider({
  value,
  children,
}: {
  value: IConversationContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Same context, but null instead of a throw when there is no provider.
 *
 * For consumers that ENRICH themselves with the open conversation rather than
 * depend on it — the lead panel's history section wants the loaded messages if
 * they happen to be there, and must still render the lead's notes and audit
 * trail if the panel is ever mounted outside the conversation screen.
 */
export function useOptionalConversationContext(): IConversationContextValue | null {
  return useContext(Ctx);
}

export function useConversationContext(): IConversationContextValue {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useConversationContext must be used inside <ConversationProvider> (PRD-011)");
  }
  return value;
}
