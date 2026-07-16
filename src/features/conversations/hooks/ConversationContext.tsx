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

export function useConversationContext(): IConversationContextValue {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useConversationContext must be used inside <ConversationProvider> (PRD-011)");
  }
  return value;
}
