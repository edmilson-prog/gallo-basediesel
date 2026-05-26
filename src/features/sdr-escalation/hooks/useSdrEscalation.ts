import { useCallback } from "react";
import type {
  ID,
  IConversation,
  ICustomer,
  IMessage,
  IPart,
  IPlatformSettings,
  IQuote,
  ISdrEscalation,
  ISdrSession,
  ISeller,
  SdrEscalationMode,
  SdrEscalationReason,
} from "@/shared/types";
import {
  recordAuditLogSync,
  useConversationsProvider,
  useMessagesProvider,
  useSdrEscalationsProvider,
  useSdrSessionsProvider,
} from "@/providers/data";
import {
  buildContextSummary,
  escalateToHuman,
  renderCustomerHandoff,
  renderEscalationBubble,
  type IBuildSummaryInput,
} from "..";
import { dispatchEscalationEvent } from "./useUrgentBroadcastQueue";

const SDR_AUTHOR_ID = "sdr-agent";

export interface IRunEscalationArgs {
  session: ISdrSession;
  conversation: IConversation;
  messages: IMessage[];
  settings: IPlatformSettings;
  reason: SdrEscalationReason;
  reasonDetails?: string;
  mode?: SdrEscalationMode;
  customer?: ICustomer;
  parts?: IPart[];
  quote?: IQuote | null;
  sellers: ISeller[];
  loadBySeller: Record<ID, number>;
  specialtiesBySeller?: Record<ID, string[]>;
}

export interface IRunEscalationResult {
  escalation: ISdrEscalation;
  customerMessageId?: ID;
  systemBubbleId?: ID;
}

/**
 * Glue between the pure escalation engine and the data providers.
 *
 * Responsibilities (atomic per call — failures abort the whole sequence):
 *  1. Compose the context summary from session + customer + quote.
 *  2. Run `escalateToHuman()` and pick the receiving seller.
 *  3. Send the customer-facing handoff message (`authorType='sdr'`).
 *  4. Persist the system bubble carrying the structured summary.
 *  5. Patch the conversation (`assignedSellerId`, `isSdrActive=false`).
 *  6. Persist the escalation record + audit log.
 */
export function useSdrEscalation() {
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();
  const escalationsProvider = useSdrEscalationsProvider();
  const sessionsProvider = useSdrSessionsProvider();

  const run = useCallback(
    async (args: IRunEscalationArgs): Promise<IRunEscalationResult> => {
      const now = new Date().toISOString();
      const summaryInput: IBuildSummaryInput = {
        session: args.session,
        conversation: args.conversation,
        messages: args.messages,
        customer: args.customer,
        parts: args.parts,
        quote: args.quote ?? null,
        reasonText: args.reasonDetails,
        now,
      };
      const contextSummary = buildContextSummary(summaryInput);
      const identifiedBrand = contextSummary.vehicleIdentified?.brand;

      const { escalation, selection } = escalateToHuman({
        sessionId: args.session.id,
        conversationId: args.conversation.id,
        storeId: args.conversation.storeId,
        customerId: args.conversation.customerId,
        leadId: args.conversation.leadId,
        reason: args.reason,
        reasonDetails: args.reasonDetails,
        mode: args.mode,
        context: contextSummary,
        identifiedBrand,
        now,
        selection: {
          storeId: args.conversation.storeId,
          sellers: args.sellers,
          loadBySeller: args.loadBySeller,
          specialtiesBySeller: args.specialtiesBySeller,
          carteiraSellerId: args.customer?.sellerId,
          excludeSellerIds: [SDR_AUTHOR_ID],
        },
      });

      // 3. Customer-facing handoff message.
      const handoffText = renderCustomerHandoff(
        args.settings.escalationCustomerHandoffTemplate,
        contextSummary,
      );
      let customerMessageId: ID | undefined;
      try {
        const sent = await messagesProvider.send(args.conversation.id, {
          authorType: "sdr",
          authorId: SDR_AUTHOR_ID,
          text: handoffText,
        });
        customerMessageId = sent.id;
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[sdr-escalation] handoff message persist failed", err);
        }
      }

      // 4. System bubble carrying the structured resumo.
      const bubbleText = renderEscalationBubble({
        summary: contextSummary,
        reason: args.reason,
        mode: escalation.mode,
      });
      let systemBubbleId: ID | undefined;
      try {
        const sent = await messagesProvider.send(args.conversation.id, {
          authorType: "system",
          authorId: SDR_AUTHOR_ID,
          text: bubbleText,
        });
        systemBubbleId = sent.id;
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[sdr-escalation] system bubble persist failed", err);
        }
      }

      // 5. Conversation patch — deactivate SDR and assign the seller (when picked).
      try {
        await conversationsProvider.patch(args.conversation.id, {
          isSdrActive: false,
          assignedSellerId: escalation.assignedSellerId ?? undefined,
          status: escalation.assignedSellerId ? "em_andamento" : "aguardando",
        });
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[sdr-escalation] conversation patch failed", err);
        }
      }

      // 6. Session — mark finished with reason=escalated.
      try {
        await sessionsProvider.patch(args.session.id, {
          state: "finalizado",
          finishedAt: now,
          finishReason: "escalated",
          lastActivityAt: now,
        });
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[sdr-escalation] session patch failed", err);
        }
      }

      // 7. Persist the escalation record.
      let stored = escalation;
      try {
        stored = await escalationsProvider.create(escalation);
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[sdr-escalation] escalation persist failed", err);
        }
      }

      // 8. Audit log — escalation creation + selection.
      recordAuditLogSync({
        storeId: args.conversation.storeId,
        actorId: SDR_AUTHOR_ID,
        action: "sdr_escalate",
        resource: "conversation",
        resourceId: args.conversation.id,
        after: {
          escalationId: stored.id,
          reason: args.reason,
          mode: escalation.mode,
          assignedSellerId: escalation.assignedSellerId,
          step: selection.step,
          specialtyMatched: selection.specialtyMatched,
        },
      });
      if (escalation.assignedSellerId) {
        recordAuditLogSync({
          storeId: args.conversation.storeId,
          actorId: SDR_AUTHOR_ID,
          action: "sdr_escalate_assign",
          resource: "conversation",
          resourceId: args.conversation.id,
          after: {
            escalationId: stored.id,
            sellerId: escalation.assignedSellerId,
            step: selection.step,
            reason: selection.reason,
          },
        });
      }

      dispatchEscalationEvent({
        kind: "create",
        escalationId: stored.id,
        payload: { mode: stored.mode, status: stored.status },
      });

      return { escalation: stored, customerMessageId, systemBubbleId };
    },
    [conversationsProvider, escalationsProvider, messagesProvider, sessionsProvider],
  );

  return { run };
}
