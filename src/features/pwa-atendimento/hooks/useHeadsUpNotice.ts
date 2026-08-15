import { useCallback, useEffect, useRef, useState } from "react";
import type { ID } from "@/shared/types";
import { getActiveDataSource, useConversationsProvider } from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";
import {
  rowToMessage,
  type IMessageRealtimeRow,
} from "@/features/conversations/hooks/useRealtimeMessages";
import { buildPwaPreview } from "../engine/messagePreview";
import { shortNameOf } from "../components/ui/statusMeta";

const IS_SUPABASE = getActiveDataSource() === "supabase";
const AUTO_DISMISS_MS = 5200;

export interface IHeadsUpNotice {
  conversationId: ID;
  /**
   * Nome do contato. Chega DEPOIS do aviso: o banner é a coisa mais urgente da
   * tela e não pode esperar uma ida à rede para aparecer.
   */
  title: string | null;
  /** Ícone da prévia quando a mensagem é mídia (áudio, foto, documento…). */
  icon: string | null;
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

  // Guardado em ref, e não nas dependências do efeito: a assinatura do canal
  // `messages` é compartilhada e contada por referência — refazê-la porque uma
  // identidade de provider mudou é mexer onde não se deve.
  // Nomes já resolvidos nesta sessão. Cresce só com conversas que efetivamente
  // avisaram, e um nome trocado no meio da sessão fica no rótulo antigo até o
  // recarregamento — mesma troca que a lista do Inbox já assume.
  const namesRef = useRef(new Map<ID, string>());

  const conversationsProvider = useConversationsProvider();
  const providerRef = useRef(conversationsProvider);
  useEffect(() => {
    providerRef.current = conversationsProvider;
  }, [conversationsProvider]);

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

      // Mesma prévia da lista: um áudio anuncia "Áudio", não o "Nova mensagem"
      // genérico que sobrava de ler só `text` — mídia não tem texto.
      const preview = buildPwaPreview(rowToMessage(row as IMessageRealtimeRow));
      const conversationId = row.conversation_id;
      const known = namesRef.current.get(conversationId) ?? null;
      setNotice({
        conversationId,
        title: known,
        icon: preview.icon,
        body: preview.text || "Nova mensagem",
      });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setNotice(null), AUTO_DISMISS_MS);

      // Nome já conhecido nesta sessão sai do cache — uma rajada de cinco
      // mensagens seguidas do mesmo contato não pode virar cinco consultas.
      if (known) return;

      // Quem mandou, resolvido em seguida por UMA chamada limitada a esta
      // conversa. Falha ou contato sem nome apenas deixa o banner sem a linha —
      // nunca atrasa nem derruba o aviso.
      void providerRef.current
        .listContacts([conversationId])
        .then((rows) => {
          const name = rows[0]?.name?.trim();
          if (!name) return;
          const label = shortNameOf(name);
          namesRef.current.set(conversationId, label);
          setNotice((current) =>
            current && current.conversationId === conversationId
              ? { ...current, title: label }
              : current,
          );
        })
        .catch(() => undefined);
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
