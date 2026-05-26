import { createContext, useContext, type ReactNode } from "react";
import type { IUseMessagesResult } from "./useMessages";

export interface IConversationContextValue {
  messages: IUseMessagesResult;
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
