import { useEffect, useState } from "react";
import type { ICustomer, ID, IConversation, ILead, IWhatsAppAccount } from "@/shared/types";
import {
  useConversationsProvider,
  useCustomersProvider,
  useLeadsProvider,
  useWhatsAppAccountsProvider,
} from "@/providers/data";

export interface IConversationDetail {
  conversation: IConversation | null;
  customer: ICustomer | null;
  lead: ILead | null;
  whatsappAccount: IWhatsAppAccount | null;
  isLoading: boolean;
  notFound: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Loads the selected conversation plus the directly related entities the
 * `<ConversationPage>` header and helpers need: customer/lead participant
 * and the WhatsApp account behind the channel (when applicable).
 *
 * Returning a flat record keeps consumers stateless and lets the page
 * skip null-checks inline.
 */
export function useConversationDetail(conversationId: ID | null): IConversationDetail {
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const whatsappProvider = useWhatsAppAccountsProvider();

  const [conversation, setConversation] = useState<IConversation | null>(null);
  const [customer, setCustomer] = useState<ICustomer | null>(null);
  const [lead, setLead] = useState<ILead | null>(null);
  const [whatsappAccount, setWhatsappAccount] = useState<IWhatsAppAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setCustomer(null);
      setLead(null);
      setWhatsappAccount(null);
      setIsLoading(false);
      setNotFound(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setNotFound(false);
    setError(null);

    conversationsProvider
      .get(conversationId)
      .then(async (conv) => {
        if (cancelled) return;
        setConversation(conv);

        const tasks: Promise<unknown>[] = [];
        if (conv.customerId) {
          tasks.push(
            customersProvider
              .get(conv.customerId)
              .then((c) => {
                if (!cancelled) setCustomer(c);
              })
              .catch(() => {
                if (!cancelled) setCustomer(null);
              }),
          );
        } else {
          setCustomer(null);
        }
        if (conv.leadId) {
          tasks.push(
            leadsProvider
              .get(conv.leadId)
              .then((l) => {
                if (!cancelled) setLead(l);
              })
              .catch(() => {
                if (!cancelled) setLead(null);
              }),
          );
        } else {
          setLead(null);
        }
        if (conv.whatsappAccountId) {
          tasks.push(
            whatsappProvider
              .get(conv.whatsappAccountId)
              .then((wa) => {
                if (!cancelled) setWhatsappAccount(wa);
              })
              .catch(() => {
                if (!cancelled) setWhatsappAccount(null);
              }),
          );
        } else {
          setWhatsappAccount(null);
        }
        await Promise.all(tasks);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof Error && /not found/i.test(err.message)) {
          setNotFound(true);
          setConversation(null);
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    tick,
    conversationsProvider,
    customersProvider,
    leadsProvider,
    whatsappProvider,
  ]);

  return {
    conversation,
    customer,
    lead,
    whatsappAccount,
    isLoading,
    notFound,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}
