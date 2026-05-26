import { useCallback } from "react";
import type {
  ID,
  IConversation,
  IMessage,
  IWhatsAppAccount,
  MessageMediaType,
} from "@/shared/types";
import { useMessagesProvider } from "@/providers/data";
import { SEND_FAILURE_RATE, SEND_READ_RATE } from "../utils/sendSimulation";
import { useConversationContext } from "./ConversationContext";
import { useAuth } from "@/features/auth/useAuth";

function jitter(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface ISendOptions {
  text: string;
  mediaType?: MessageMediaType;
  mediaUrl?: string;
  /** Marks this message as a template HSM send (uses provider = meta). */
  template?: boolean;
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
    async ({ text, mediaType, mediaUrl, template }: ISendOptions) => {
      const now = new Date().toISOString();
      const tempId: ID = `tmp-${crypto.randomUUID()}`;
      const optimistic: IMessage = {
        id: tempId,
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
        status: "sent",
        sentAt: now,
      };

      const handle = messages.appendOptimistic(optimistic);

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
