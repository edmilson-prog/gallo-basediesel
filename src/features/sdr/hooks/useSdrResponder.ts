import { useCallback } from "react";
import type {
  ID,
  IConversation,
  ICustomer,
  IMessage,
  IOrderItem,
  IPart,
  IPlatformSettings,
  IQuote,
  ISdrResponse,
  ISdrSession,
  IVehicle,
} from "@/shared/types";
import {
  useMessagesProvider,
  useOrdersProvider,
  useQuotesProvider,
  useSdrSessionsProvider,
  recordAuditLogSync,
} from "@/providers/data";
import { applyResponseToSession, createSdrSession, sdrRespond } from "../engine/respond";

export interface ISdrTurnResult {
  session: ISdrSession;
  response: ISdrResponse;
  emittedMessages: IMessage[];
  /** Quote persisted this turn, when the engine generated one. */
  persistedQuote?: IQuote;
  /** Order id created as a stub when the customer accepted a quote. */
  orderStubId?: ID;
}

interface IRunTurnArgs {
  conversation: IConversation;
  incoming: IMessage;
  settings: IPlatformSettings;
  /** Pre-loaded session; when missing the hook bootstraps a new one. */
  existingSession?: ISdrSession | null;
  /** Catalog snapshot — enables the PRD-021 identification path when present. */
  parts?: IPart[];
  /** Customer attached to the conversation (PRD-021 vehicle reuse). */
  customer?: ICustomer;
  /** Fleet of the customer — see RF-008. */
  vehicles?: IVehicle[];
}

const SDR_AUTHOR_ID = "sdr-agent";

/**
 * Glue between the pure engine and the mock store. Runs a single SDR turn —
 * loads/creates the session, calls `sdrRespond()`, persists side effects:
 *  - outbound messages (`authorType='sdr'`)
 *  - session state updates (state, collectedData, finishReason)
 *  - quote persistence (PRD-022) when the engine emits `quote_generated`
 *  - order stub creation when the customer accepts a quote
 *  - audit log entries for transition / escalation / identification / quote
 *
 * The hook itself is React-aware (uses providers) but the engine it wraps is
 * pure — the same `runTurn` call must produce the same outputs given the same
 * inputs (modulo the SDR session id, which is generated once on first turn).
 */
export function useSdrResponder() {
  const messagesProvider = useMessagesProvider();
  const sessionsProvider = useSdrSessionsProvider();
  const quotesProvider = useQuotesProvider();
  const ordersProvider = useOrdersProvider();

  const runTurn = useCallback(
    async ({
      conversation,
      incoming,
      settings,
      existingSession,
      parts,
      customer,
      vehicles,
    }: IRunTurnArgs): Promise<ISdrTurnResult> => {
      const now = new Date().toISOString();
      const session: ISdrSession = existingSession ?? createSdrSession(conversation.id, now);

      if (!existingSession) {
        recordAuditLogSync({
          storeId: conversation.storeId,
          actorId: SDR_AUTHOR_ID,
          action: "sdr_session_start",
          resource: "conversation",
          resourceId: conversation.id,
        });
      }

      const response = sdrRespond(incoming, session, settings, {
        parts,
        customer,
        vehicles,
        storeId: conversation.storeId,
        sellerId: conversation.assignedSellerId ?? SDR_AUTHOR_ID,
      });
      let updatedSession = applyResponseToSession(session, response, now);

      if (response.nextState !== session.state) {
        recordAuditLogSync({
          storeId: conversation.storeId,
          actorId: SDR_AUTHOR_ID,
          action: "sdr_state_transition",
          resource: "conversation",
          resourceId: conversation.id,
          before: { state: session.state },
          after: { state: response.nextState },
        });
      }

      let persistedQuote: IQuote | undefined;
      let orderStubId: ID | undefined;
      const emitted: IMessage[] = [];
      for (const action of response.actions) {
        if (action.kind === "send_message") {
          const sent = await messagesProvider.send(conversation.id, {
            authorType: "sdr",
            authorId: SDR_AUTHOR_ID,
            text: action.text,
          });
          emitted.push(sent);
        } else if (action.kind === "escalate_to_human") {
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_escalate",
            resource: "conversation",
            resourceId: conversation.id,
            after: { reason: action.reason },
          });
        } else if (action.kind === "identify_part") {
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_identify_part_requested",
            resource: "conversation",
            resourceId: conversation.id,
            after: action.identification
              ? {
                  text: action.text,
                  identificationId: action.identification.id,
                  decision: action.identification.decision.kind,
                  confidence: action.identification.confidence,
                  candidates: action.identification.candidates.length,
                }
              : { text: action.text },
          });
        } else if (action.kind === "part_identification_resolved") {
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_identify_part_resolved",
            resource: "conversation",
            resourceId: conversation.id,
            after: {
              identificationId: action.identification.id,
              status: action.identification.status,
              partId: action.identification.customerConfirmedPartId,
            },
          });
        } else if (action.kind === "create_quote") {
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_quote_requested",
            resource: "conversation",
            resourceId: conversation.id,
            after: { partId: action.partId, identificationId: action.identificationId },
          });
        } else if (action.kind === "quote_generated") {
          // Persist the inline-generated quote — the engine has already
          // composed it and the pending projection lives on the session.
          const inlineQuote = response.trace.pendingQuote;
          if (inlineQuote && customer) {
            try {
              const stored = await quotesProvider.create({
                storeId: conversation.storeId,
                customerId: customer.id,
                sellerId: conversation.assignedSellerId ?? SDR_AUTHOR_ID,
                items: [
                  {
                    id: `${inlineQuote.quoteId}-item-1`,
                    partId: inlineQuote.partId,
                    partSku: "—",
                    partName: inlineQuote.partName,
                    quantity: 1,
                    unitPrice: inlineQuote.total,
                    discount: 0,
                    total: inlineQuote.total,
                  },
                ],
                subtotal: inlineQuote.total,
                discount: 0,
                shipping: inlineQuote.shippingIsToNegotiate ? 0 : 0,
                total: inlineQuote.total,
                paymentCondition: "à combinar",
                validUntil: inlineQuote.validUntil,
                status: "enviado",
                origin: "sdr",
                division: "parts",
                notes: inlineQuote.shippingIsToNegotiate ? "Frete a combinar." : undefined,
              });
              persistedQuote = stored;
              // Replace the local quoteId with the persisted one so downstream
              // matching keeps working.
              updatedSession = {
                ...updatedSession,
                collectedData: {
                  ...updatedSession.collectedData,
                  quoteId: stored.id,
                  pendingQuote: {
                    ...inlineQuote,
                    quoteId: stored.id,
                  },
                },
              };
            } catch (err) {
              if (typeof console !== "undefined") {
                console.warn("[sdr-quote] persist failed", err);
              }
            }
          }
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_quote_create",
            resource: "quote",
            resourceId: persistedQuote?.id ?? action.pending.quoteId,
            after: {
              total: action.pending.total,
              validUntil: action.pending.validUntil,
              partName: action.pending.partName,
            },
          });
        } else if (action.kind === "quote_response") {
          const auditAction =
            action.intent === "accept"
              ? "sdr_quote_accepted"
              : action.intent === "reject"
                ? "sdr_quote_rejected"
                : action.intent === "negotiate"
                  ? "sdr_quote_negotiate_detected"
                  : action.intent === "escalate"
                    ? "sdr_quote_escalate"
                    : "sdr_quote_unknown_reply";
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: auditAction,
            resource: "quote",
            resourceId: action.quoteId,
            after: { intent: action.intent, keywords: action.matchedKeywords },
          });
          if (action.intent === "accept") {
            try {
              const quote = await quotesProvider.get(action.quoteId).catch(() => null);
              if (quote) {
                await quotesProvider.update(quote.id, { status: "aceito" });
                if (customer) {
                  const stubItems: IOrderItem[] = quote.items.map((item, idx) => ({
                    id: `${quote.id}-orderitem-${idx + 1}`,
                    partId: item.partId,
                    partSku: item.partSku,
                    partName: item.partName,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    unitCost: item.unitPrice * 0.7,
                    discount: item.discount,
                    total: item.total,
                    marginValue: item.unitPrice * 0.3 * item.quantity,
                  }));
                  const order = await ordersProvider.create({
                    storeId: conversation.storeId,
                    customerId: customer.id,
                    sellerId: conversation.assignedSellerId ?? SDR_AUTHOR_ID,
                    quoteId: quote.id,
                    items: stubItems,
                    subtotal: quote.subtotal,
                    discount: quote.discount,
                    shipping: quote.shipping,
                    total: quote.total,
                    paymentCondition: quote.paymentCondition,
                    paymentStatus: "pendente",
                    fulfillmentStatus: "pendente",
                    origin: "whatsapp",
                    division: quote.division,
                    notes: "Pedido placeholder gerado pelo SDR — aguardando confirmação manual.",
                  });
                  orderStubId = order.id;
                  updatedSession = {
                    ...updatedSession,
                    collectedData: {
                      ...updatedSession.collectedData,
                      pendingOrderId: order.id,
                    },
                  };
                  recordAuditLogSync({
                    storeId: conversation.storeId,
                    actorId: SDR_AUTHOR_ID,
                    action: "sdr_order_stub_created",
                    resource: "order",
                    resourceId: order.id,
                    after: { quoteId: quote.id, total: order.total },
                  });
                }
              }
            } catch (err) {
              if (typeof console !== "undefined") {
                console.warn("[sdr-quote] accept-flow persist failed", err);
              }
            }
          } else if (action.intent === "reject") {
            try {
              await quotesProvider.update(action.quoteId, { status: "recusado" }).catch(() => null);
            } catch {
              // best-effort — provider may be Supabase placeholder
            }
          }
        }
      }

      // Persist the (possibly mutated) session after all actions ran so the
      // mock store reflects the quote/order ids resolved synchronously above.
      await sessionsProvider.upsert(updatedSession);

      // Audit photo placeholder (RF-021).
      if (incoming.mediaType === "image") {
        recordAuditLogSync({
          storeId: conversation.storeId,
          actorId: SDR_AUTHOR_ID,
          action: "sdr_photo_received",
          resource: "conversation",
          resourceId: conversation.id,
          after: { ocr: "pending_fase_2" },
        });
      }

      return {
        session: updatedSession,
        response,
        emittedMessages: emitted,
        persistedQuote,
        orderStubId,
      };
    },
    [messagesProvider, ordersProvider, quotesProvider, sessionsProvider],
  );

  return { runTurn };
}

export function getSdrAuthorId(): ID {
  return SDR_AUTHOR_ID;
}
