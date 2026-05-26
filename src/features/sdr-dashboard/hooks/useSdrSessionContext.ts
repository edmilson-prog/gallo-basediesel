import { useEffect, useState } from "react";
import type {
  IConversation,
  ICustomer,
  ID,
  ILead,
  ISdrEscalation,
  ISdrSession,
  ISeller,
} from "@/shared/types";
import {
  useConversationsProvider,
  useCustomersProvider,
  useLeadsProvider,
  useSdrEscalationsProvider,
  useSellersProvider,
} from "@/providers/data";

export interface ISdrSessionContext {
  conversation: IConversation | null;
  customer: ICustomer | null;
  lead: ILead | null;
  escalation: ISdrEscalation | null;
  seller: ISeller | null;
  loading: boolean;
}

/**
 * Lazy-load every related entity for a single SDR session (PRD-024 RF-014).
 * Used by `<SdrSessionDetailModal>` so the table itself stays light.
 */
export function useSdrSessionContext(session: ISdrSession | null): ISdrSessionContext {
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const escalationsProvider = useSdrEscalationsProvider();
  const sellersProvider = useSellersProvider();

  const [conversation, setConversation] = useState<IConversation | null>(null);
  const [customer, setCustomer] = useState<ICustomer | null>(null);
  const [lead, setLead] = useState<ILead | null>(null);
  const [escalation, setEscalation] = useState<ISdrEscalation | null>(null);
  const [seller, setSeller] = useState<ISeller | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setConversation(null);
      setCustomer(null);
      setLead(null);
      setEscalation(null);
      setSeller(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    (async () => {
      try {
        const conv = await conversationsProvider.get(session.conversationId).catch(() => null);
        if (cancelled) return;
        setConversation(conv ?? null);

        const customerId: ID | undefined = conv?.customerId;
        const leadId: ID | undefined = conv?.leadId;

        const [customerEntity, leadEntity, lastEscalation] = await Promise.all([
          customerId ? customersProvider.get(customerId).catch(() => null) : Promise.resolve(null),
          leadId ? leadsProvider.get(leadId).catch(() => null) : Promise.resolve(null),
          escalationsProvider.getByConversation(session.conversationId).catch(() => null),
        ]);
        if (cancelled) return;
        setCustomer(customerEntity ?? null);
        setLead(leadEntity ?? null);
        setEscalation(lastEscalation);

        if (lastEscalation?.assignedSellerId) {
          const sellerEntity = await sellersProvider
            .get(lastEscalation.assignedSellerId)
            .catch(() => null);
          if (!cancelled) setSeller(sellerEntity ?? null);
        } else {
          setSeller(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    session,
    conversationsProvider,
    customersProvider,
    leadsProvider,
    escalationsProvider,
    sellersProvider,
  ]);

  return { conversation, customer, lead, escalation, seller, loading };
}
