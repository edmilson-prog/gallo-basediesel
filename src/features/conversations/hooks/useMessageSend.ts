import { useCallback } from "react";
import { toast } from "sonner";
import type {
  ID,
  IConversation,
  IMessage,
  IWhatsAppAccount,
  MessageMediaType,
} from "@/shared/types";
import { getActiveDataSource, useMessagesProvider } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { SEND_FAILURE_RATE, SEND_READ_RATE } from "../utils/sendSimulation";
import { useConversationContext } from "./ConversationContext";
import { useAuth } from "@/features/auth/useAuth";

/** Friendly pt-BR feedback per whatsapp-send error code (PRD-115 RF-073..075). */
export const SEND_ERROR_MESSAGES: Record<string, string> = {
  TEMPLATE_REQUIRED: "Fora da janela de 24h — envie um template HSM.",
  CUSTOMER_INVALID_WHATSAPP:
    "Número marcado como inválido no WhatsApp — peça a um gestor para confirmar o envio.",
  RATE_LIMITED: "Limite de envios atingido. Aguarde alguns segundos e tente novamente.",
  PROVIDER_DISCONNECTED:
    "WhatsApp desconectado — peça ao gestor para reconectar a conta via QR Code.",
  FAILOVER_INCOMPATIBLE:
    "Conta em contingência — templates não podem sair pela conta reserva. Aguarde a restauração ou contate o gestor.",
  CONVERSATION_CLOSED: "Conversa encerrada — reabra antes de enviar.",
  FORBIDDEN: "Você não tem permissão para enviar nesta conversa.",
};

interface ISendFunctionError {
  error?: string;
  code?: string;
}

/** Invokes the whatsapp-send Edge Function (PRD-115) — supabase source only. */
async function invokeWhatsAppSend(body: Record<string, unknown>): Promise<{ messageId: string }> {
  const { data, error } = await getSupabaseClient().functions.invoke("whatsapp-send", { body });
  if (error) {
    let payload: ISendFunctionError = {};
    try {
      payload = await (error as { context?: Response }).context?.json();
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    // TEMPLATE_REQUIRED is not an error to the user — the conversation screen
    // reacts by opening the template picker (PRD-116). Same idea for
    // CUSTOMER_INVALID_WHATSAPP (PRD-118): staff gets a confirmation dialog,
    // so the toast is up to the caller.
    if (payload.code !== "TEMPLATE_REQUIRED" && payload.code !== "CUSTOMER_INVALID_WHATSAPP") {
      const friendly =
        (payload.code && SEND_ERROR_MESSAGES[payload.code]) ??
        payload.error ??
        "Falha ao enviar a mensagem. Tente novamente.";
      toast.error(friendly);
    }
    throw new Error(payload.code ?? "SEND_FAILED");
  }
  return data as { messageId: string };
}

function jitter(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface ISendOptions {
  text: string;
  mediaType?: MessageMediaType;
  mediaUrl?: string;
  /** Marks this message as a template HSM send (uses provider = meta). */
  template?: boolean;
  /** Real HSM payload (PRD-116) — supabase source sends kind='template'. */
  templateMeta?: {
    templateName: string;
    languageCode: string;
    variables: string[];
  };
  /** Staff-only confirmation to send to an invalid-flagged number (PRD-118). */
  overrideInvalid?: boolean;
  /** Failed message this send retries — NEW message, original preserved (PRD-118). */
  retryOfMessageId?: string;
}

export interface IUseMessageSendResult {
  send(opts: ISendOptions): Promise<void>;
}

const TEMPLATE_PREFIX = "[template] ";

/**
 * Optimistic message-send orchestrator with a 4-stage status dance:
 *
 *   sent → delivered → (read | failed)
 *
 * The optimistic row appears immediately, then status transitions follow
 * the timings dictated by `mocks/config.ts`. Failure rate is configurable;
 * a failed message keeps the `failed` status and the bubble exposes a
 * "Tentar novamente" affordance handled by `useMessages.retry`.
 */
export function useMessageSend(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseMessageSendResult {
  const provider = useMessagesProvider();
  const { messages } = useConversationContext();
  const { currentUser } = useAuth();

  const send = useCallback(
    async ({
      text,
      mediaType,
      mediaUrl,
      template,
      templateMeta,
      overrideInvalid,
      retryOfMessageId,
    }: ISendOptions) => {
      const now = new Date().toISOString();
      // Client-generated id: the optimistic bubble and the Realtime INSERT
      // share ONE id, so the bubble never duplicates during the send window —
      // the supabase pipeline inserts the row with this id (PRD-115).
      const messageId: ID = crypto.randomUUID();
      const optimistic: IMessage = {
        id: messageId,
        conversationId: conversation.id,
        direction: "out",
        authorType: "seller",
        authorId: currentUser?.id,
        provider: template
          ? "meta"
          : whatsappAccount?.provider === "evolution"
            ? "evolution"
            : conversation.channel === "whatsapp"
              ? "meta"
              : "mock",
        text: template ? `${TEMPLATE_PREFIX}${text}` : text,
        mediaType,
        mediaUrl,
        // Starts "queued" (🕐) and becomes "sent" (✓) on commit, then
        // delivered/read (✓✓) via Realtime — one bubble, honest lifecycle.
        status: "queued",
        sentAt: now,
      };

      const handle = messages.appendOptimistic(optimistic);

      // Supabase source (PRD-115): real dispatch through the whatsapp-send
      // Edge Function — persist-before-send, Meta 24h pre-check and audit run
      // server-side. NO client-side status simulation: delivered/read arrive
      // via webhook (PRD-114) + Realtime (refinement tracked by PRD-118).
      if (getActiveDataSource() === "supabase") {
        try {
          const flags = {
            messageId,
            ...(overrideInvalid ? { overrideInvalid: true } : {}),
            ...(retryOfMessageId ? { retryOfMessageId } : {}),
          };
          const result = await invokeWhatsAppSend(
            templateMeta
              ? {
                  conversationId: conversation.id,
                  kind: "template",
                  text: optimistic.text,
                  templateName: templateMeta.templateName,
                  templateLanguage: templateMeta.languageCode,
                  templateParameters: templateMeta.variables,
                  ...flags,
                }
              : {
                  conversationId: conversation.id,
                  kind: mediaType ? "media" : "text",
                  text: optimistic.text,
                  ...(mediaType ? { mediaPath: mediaUrl, mediaType } : {}),
                  ...flags,
                },
          );
          handle.commit({ ...optimistic, id: result.messageId, status: "sent" });
        } catch (error) {
          handle.fail();
          // Surface the machine code so MessageInput can react (e.g. open the
          // template picker on TEMPLATE_REQUIRED).
          throw error;
        }
        return;
      }

      try {
        const real = await provider.send(conversation.id, {
          authorType: "seller",
          authorId: currentUser?.id,
          text: optimistic.text,
          mediaType,
          mediaUrl,
        });
        handle.commit({ ...real, status: "sent" });

        // delivered after 200–500ms
        await new Promise((r) => window.setTimeout(r, jitter(200, 500)));
        messages.patchStatus(real.id, "delivered");
        try {
          await provider.markStatus(real.id, "delivered");
        } catch {
          // Provider already mutated in send(); ignore secondary errors.
        }

        // Either read (with `SEND_READ_RATE`), failure (with `SEND_FAILURE_RATE`),
        // or stay at delivered. Failure check first so the rates compose.
        await new Promise((r) => window.setTimeout(r, jitter(1_000, 3_000)));
        if (Math.random() < SEND_FAILURE_RATE) {
          messages.patchStatus(real.id, "failed");
          try {
            await provider.markStatus(real.id, "failed");
          } catch {
            /* noop */
          }
          return;
        }
        if (Math.random() < SEND_READ_RATE) {
          messages.patchStatus(real.id, "read");
          try {
            await provider.markStatus(real.id, "read");
          } catch {
            /* noop */
          }
        }
      } catch {
        handle.fail();
      }
    },
    [conversation, currentUser?.id, messages, provider, whatsappAccount?.provider],
  );

  return { send };
}
