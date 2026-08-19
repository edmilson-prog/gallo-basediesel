// src/features/quotes/hooks/useSendQuoteWhatsApp.ts
import { useCallback } from "react";
import type { ID, IMessage, IWhatsAppAccount } from "@/shared/types";
import {
  getActiveDataSource,
  useConversationsProvider,
  useMessagesProvider,
} from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { useAuth } from "@/features/auth/useAuth";

/** Statuses that still count as an open thread to reuse. */
const OPEN_STATUSES = ["aguardando", "em_andamento", "aguardando_cliente"] as const;

export interface ISendQuoteWhatsAppParams {
  storeId: ID;
  customerId: ID;
  /** Connected instance the message goes out from. */
  account: IWhatsAppAccount;
  text: string;
}

export interface ISendQuoteWhatsAppResult {
  conversationId: ID;
}

/**
 * Sends the quote to the customer's WhatsApp thread — reusing the open
 * conversation on that instance when there is one, opening an outbound thread
 * when there is not. The message lands in the Inbox like any other, which is
 * the point: the quote leaves a trace where the relationship lives, instead of
 * being copy-pasted out of the app.
 *
 * On supabase the dispatch goes through the same Edge Functions the composer
 * uses (persist-before-send, so the row is written server-side with the id we
 * generate here); on the mock source the provider writes it directly.
 */
export function useSendQuoteWhatsApp() {
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();
  const { currentUser } = useAuth();

  return useCallback(
    async ({
      storeId,
      customerId,
      account,
      text,
    }: ISendQuoteWhatsAppParams): Promise<ISendQuoteWhatsAppResult> => {
      const sellerId = currentUser?.sellerId;
      if (!sellerId) throw new Error("Seu usuário não está vinculado a um vendedor.");

      // Reuse an open thread on this instance before opening another one.
      const open = await conversationsProvider.list({
        storeId,
        customerId,
        whatsappAccountId: account.id,
        status: [...OPEN_STATUSES],
        pageSize: 1,
        withTotal: false,
      });
      const conversationId =
        open.data[0]?.id ??
        (
          await conversationsProvider.createOutbound({
            storeId,
            whatsappAccountId: account.id,
            assignedSellerId: sellerId,
            customerId,
          })
        ).id;

      if (getActiveDataSource() === "supabase") {
        // The Edge Function persists the row with this id and dispatches it.
        const messageId: ID = crypto.randomUUID();
        const functionName = account.provider === "waha" ? "waha-send" : "whatsapp-send";
        const { error } = await getSupabaseClient().functions.invoke(functionName, {
          body: { conversationId, kind: "text", text, messageId },
        });
        if (error) {
          let payload: { error?: string; code?: string } = {};
          try {
            payload = await (error as { context?: Response }).context?.json();
          } catch {
            // Non-JSON body — fall through to the generic message.
          }
          throw new Error(payload.code ?? payload.error ?? "SEND_FAILED");
        }
      } else {
        const outbound: Omit<
          IMessage,
          "id" | "conversationId" | "sentAt" | "status" | "direction" | "provider"
        > = {
          authorType: "seller",
          authorId: currentUser?.id,
          text,
        };
        await messagesProvider.send(conversationId, outbound);
      }

      return { conversationId };
    },
    [conversationsProvider, messagesProvider, currentUser?.id, currentUser?.sellerId],
  );
}
