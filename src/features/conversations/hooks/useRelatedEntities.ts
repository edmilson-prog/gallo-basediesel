import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ID, IConversationContact, IMessage, IConversation } from "@/shared/types";
import { useConversationsProvider, useMessagesProvider } from "@/providers/data";

/** Directly-related entities the inbox list rows render, resolved per conversation. */
export interface IRelatedEntities {
  /** Display-ready contact (name/phone/avatar) keyed by conversation id. */
  contacts: Map<ID, IConversationContact>;
  lastMessages: Map<ID, IMessage>;
}

const EMPTY_RELATED: IRelatedEntities = {
  contacts: new Map(),
  lastMessages: new Map(),
};

/**
 * The subset of `ids` not yet resolved in `cache`. This is what makes a reorder
 * cheap: once a conversation's contact is cached it is never re-requested, so the
 * recency churn that constantly replaces the conversation array can no longer
 * restart (and blank) the whole resolution batch.
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
 * Resolves the contact + last-message each conversation row needs.
 *
 * Contacts come from a single `conversations.listContacts` call (supabase: the
 * SECURITY DEFINER `conversation_contacts` RPC). This is what lets a non-staff
 * seller see the real name of a POOL conversation: the per-entity
 * `customers.get()` it replaces was RLS-blocked for unassigned conversations and
 * silently fell back to "Lead anônimo". Resolving by conversation also collapses
 * the old N per-customer reads into ONE bounded round-trip.
 *
 * The inbox is sorted by recency and kept live by `useRealtimeConversations`,
 * which bumps a refetch tick on every messages/conversations event, so the
 * `conversations` array — and its id order — churns constantly. Contacts resolve
 * into a PERSISTENT cache keyed by conversation id that accumulates across
 * renders and is never wiped: each conversation's contact is requested once and
 * reused, so a superseded batch can only ever ADD resolved contacts, never blank
 * them. Results publish immediately (cached entries paint at once) and again as
 * the batch settles. Last messages stay volatile — refreshed for the current set
 * every run so the preview tracks new traffic.
 *
 * Trade-off: a contact renamed mid-session keeps its cached list label until the
 * page reloads; the detail/ficha refetches fresh, so this is cosmetic.
 */
export function useRelatedEntities(conversations: IConversation[]): IRelatedEntities {
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();

  const contactsRef = useRef<Map<ID, IConversationContact>>(new Map());
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
      contacts: new Map(contactsRef.current),
      lastMessages: new Map(messagesRef.current),
    });
  }, []);

  const idsKey = useMemo(() => conversations.map((c) => c.id).join(","), [conversations]);

  useEffect(() => {
    if (conversations.length === 0) return;

    const tasks: Promise<unknown>[] = [];

    // Contacts: one bounded RPC for the not-yet-resolved conversations. Only
    // conversations that actually LINK a customer/lead need a lookup — a link-less
    // conversation renders the unknown fallback with no request. Stable identity →
    // each contact is requested once and reused (a superseded run only ADDS, never
    // blanks). A conversation that LATER gains a link (webhook) re-enters `missing`
    // on the next tick — its refreshed row now carries the id — and resolves, so
    // there is no stale "Lead anônimo" and no negative cache to invalidate.
    const linkableIds = conversations
      .filter((c) => c.customerId || c.leadId)
      .map((c) => c.id);
    const missing = missingIds(linkableIds, contactsRef.current);
    if (missing.length > 0) {
      tasks.push(
        conversationsProvider
          .listContacts(missing)
          .then((rows) => {
            for (const r of rows) contactsRef.current.set(r.conversationId, r);
          })
          .catch(() => undefined),
      );
    }

    // Volatile preview → ONE batched RPC for the whole page's last messages
    // (supabase: `last_messages_for_conversations`, gated by can_access). This
    // replaces the ~50 concurrent per-conversation reads that — for a non-staff
    // seller, each re-evaluating the RLS access gate — saturated the backend
    // (statement_timeout → 500 on /messages). The merge is recency-guarded:
    // overlapping ticks can resolve out of order, so a slow older lookup must
    // not stomp a newer preview already in the cache.
    tasks.push(
      messagesProvider
        .listLastMessages(conversations.map((c) => c.id))
        .then((msgs) => {
          for (const m of msgs) {
            messagesRef.current.set(
              m.conversationId,
              newerMessage(messagesRef.current.get(m.conversationId), m),
            );
          }
        })
        .catch(() => undefined),
    );

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
