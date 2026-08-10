import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ID, IMessage, IMessageReplyRef } from "@/shared/types";

export interface IReplyTarget {
  /** Nossa mensagem citada — o que vai para o servidor. */
  messageId: ID;
  /** Snapshot local, usado na barra do composer e na bolha otimista. */
  ref: IMessageReplyRef;
}

export interface IReplyDraftValue {
  target: IReplyTarget | null;
  startReply: (message: IMessage) => void;
  clear: () => void;
}

const Ctx = createContext<IReplyDraftValue | null>(null);

/**
 * Rascunho de "respondendo a" da conversa aberta.
 *
 * Contexto próprio, e não o ConversationContext, de propósito: trocar o alvo
 * re-renderizaria toda a thread se morasse lá. Aqui quem consome o alvo é só o
 * composer; as bolhas consomem apenas `startReply`, que é estável.
 */
export function ReplyDraftProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<IReplyTarget | null>(null);

  const startReply = useCallback((message: IMessage) => {
    setTarget({
      messageId: message.id,
      ref: {
        messageId: message.id,
        text: message.text.trim() || undefined,
        mediaType: message.mediaType,
        direction: message.direction,
      },
    });
  }, []);

  const clear = useCallback(() => setTarget(null), []);
  const value = useMemo(() => ({ target, startReply, clear }), [target, startReply, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Retorna null (em vez de lançar) fora do provider: bolhas são renderizadas em
 * telas que não oferecem resposta, e ali o menu simplesmente não mostra a ação.
 */
export function useReplyDraft(): IReplyDraftValue | null {
  return useContext(Ctx);
}
