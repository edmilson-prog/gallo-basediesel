import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ICustomer, ID, ILead, IMessage, IConversation } from "@/shared/types";
import { useCustomersProvider, useLeadsProvider, useMessagesProvider } from "@/providers/data";

/** Directly-related entities the inbox list rows render, resolved per conversation. */
export interface IRelatedEntities {
  customers: Map<ID, ICustomer>;
  leads: Map<ID, ILead>;
  lastMessages: Map<ID, IMessage>;
}

const EMPTY_RELATED: IRelatedEntities = {
  customers: new Map(),
  leads: new Map(),
  lastMessages: new Map(),
};

/** Unique, defined customer/lead ids referenced by the given conversations. */
export function collectRelatedIds(conversations: IConversation[]): {
  customerIds: ID[];
  leadIds: ID[];
} {
  const customerIds = Array.from(
    new Set(conversations.map((c) => c.customerId).filter((id): id is ID => Boolean(id))),
  );
  const leadIds = Array.from(
    new Set(conversations.map((c) => c.leadId).filter((id): id is ID => Boolean(id))),
  );
  return { customerIds, leadIds };
}

/**
 * The subset of `ids` not yet resolved in `cache`. This is what makes a reorder
 * cheap: once a contact is cached it is never re-fetched, so the recency churn
 * that constantly replaces the conversation array can no longer restart (and
 * blank) the whole resolution batch.
 */
export function missingIds<T>(ids: ID[], cache: ReadonlyMap<ID, T>): ID[] {
  return ids.filter((id) => !cache.has(id));
}

/**
 * Pick the more recent of a cached last-message and a freshly-fetched one.
 *
 * The last-message cache is volatile and written by every (never-cancelled)
 * effect run, so overlapping realtime ticks can resolve out of order. Without
 * this guard a slow older lookup could stomp a newer preview already resolved by
 * a later run; comparing `sentAt` keeps the preview monotonic in time.
 */
export function newerMessage(prev: IMessage | undefined, next: IMessage): IMessage {
  if (!prev) return next;
  return new Date(next.sentAt).getTime() >= new Date(prev.sentAt).getTime() ? next : prev;
}

/**
 * Resolves the customer / lead / last-message each conversation row needs.
 *
 * The inbox is sorted by recency and kept live by `useRealtimeConversations`,
 * which bumps a refetch tick on every messages/conversations event (including
 * every delivery/read receipt on a busy campaign instance). Each tick re-pulls
 * page 1 and a new inbound reorders the list, so the `conversations` array — and
 * its id order — churns constantly.
 *
 * The previous implementation rebuilt a fresh result map per run and only
 * committed it once the WHOLE batch (≈30 customers + 30 last-message lookups)
 * settled, gated on a `cancelled` flag. On a busy inbox each reorder cancelled
 * the in-flight batch before it could finish, so for slower (non-staff) callers
 * the map never committed and every row fell back to "Lead anônimo" — while
 * faster (staff) callers won the race and resolved fine. RLS was a red herring:
 * the rows are readable; the resolver just never published.
 *
 * Fix: resolve into PERSISTENT caches that accumulate across renders and are
 * never wiped. Customer/lead identity is stable, so each id is fetched once and
 * reused forever; a superseded batch can only ever ADD resolved contacts, never
 * blank them. Results are published immediately (cached entries paint at once)
 * and again as the batch settles. Last messages stay volatile — they are
 * refreshed for the current set every run so the preview tracks new traffic.
 *
 * Trade-off: a customer renamed mid-session keeps its cached list label until
 * the page reloads; the detail/ficha refetches fresh, so this is cosmetic.
 */
export function useRelatedEntities(conversations: IConversation[]): IRelatedEntities {
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const messagesProvider = useMessagesProvider();

  const customersRef = useRef<Map<ID, ICustomer>>(new Map());
  const leadsRef = useRef<Map<ID, ILead>>(new Map());
  const messagesRef = useRef<Map<ID, IMessage>>(new Map());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [related, setRelated] = useState<IRelatedEntities>(EMPTY_RELATED);

  // Snapshot the accumulating caches into fresh Maps so React sees a new value.
  const publish = useCallback(() => {
    if (!mountedRef.current) return;
    setRelated({
      customers: new Map(customersRef.current),
      leads: new Map(leadsRef.current),
      lastMessages: new Map(messagesRef.current),
    });
  }, []);

  const idsKey = useMemo(() => conversations.map((c) => c.id).join(","), [conversations]);

  useEffect(() => {
    if (conversations.length === 0) return;

    const { customerIds, leadIds } = collectRelatedIds(conversations);

    const tasks: Promise<unknown>[] = [];

    // Stable identity → fetch each customer/lead once, then reuse from cache.
    for (const id of missingIds(customerIds, customersRef.current)) {
      tasks.push(
        customersProvider
          .get(id)
          .then((c) => {
            customersRef.current.set(id, c);
          })
          .catch(() => undefined),
      );
    }
    for (const id of missingIds(leadIds, leadsRef.current)) {
      tasks.push(
        leadsProvider
          .get(id)
          .then((l) => {
            leadsRef.current.set(id, l);
          })
          .catch(() => undefined),
      );
    }
    // Volatile preview → refresh the last message for the current set. The write
    // is recency-guarded: overlapping ticks can resolve out of order, so a slow
    // older lookup must not stomp a newer preview already in the cache.
    for (const c of conversations) {
      tasks.push(
        messagesProvider
          .list({ conversationId: c.id, page: 1, pageSize: 1, orderDir: "desc" })
          .then((res) => {
            const next = res.data[0];
            if (next) messagesRef.current.set(c.id, newerMessage(messagesRef.current.get(c.id), next));
          })
          .catch(() => undefined),
      );
    }

    // Paint whatever is already cached immediately, then republish as the batch
    // settles. NOT gated on a cancellation flag: the caches are monotonic, so a
    // late publish from a superseded run only adds resolved contacts.
    publish();
    if (tasks.length > 0) {
      void Promise.allSettled(tasks).then(publish);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return related;
}
