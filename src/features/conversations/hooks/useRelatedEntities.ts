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
 * Cache key for the resolution effect — id AND last-message recency per row.
 *
 * The id-only key missed the case the inbox hits most: when the conversation
 * already at the TOP of the list receives another message it keeps its position,
 * so the id order is byte-identical and the volatile last-message batch never
 * re-ran — freezing the preview one message behind (the "Dhfh" instead of "Oii"
 * symptom). Folding `lastMessageAt` into the key re-runs the batch exactly when
 * new traffic lands — inbound (webhook touch) AND outbound (send/core touch)
 * both advance `last_message_at`. The contact lookup stays cheap regardless: it
 * is guarded by `missingIds` (monotonic cache), so a recency-only change makes
 * the batch re-resolve last messages without re-requesting any contact.
 */
export function recencyKeyOf(conversations: IConversation[]): string {
  return conversations.map((c) => `${c.id}:${c.lastMessageAt ?? ""}`).join(",");
}

/**
 * The subset of `conversations` whose last-message recency changed since
 * `lastSeen` (or that are new entirely). Mirrors `missingIds` for the
 * VOLATILE last-message cache: `recencyKeyOf` changing re-runs the resolution
 * effect, but a single new message elsewhere in a large Inbox shouldn't force
 * every OTHER already-resolved conversation's last message to be re-fetched —
 * only the one(s) that actually moved.
 */
export function changedRecencyIds(
  conversations: IConversation[],
  lastSeen: ReadonlyMap<ID, string>,
): ID[] {
  return conversations
    .filter((c) => lastSeen.get(c.id) !== (c.lastMessageAt ?? ""))
    .map((c) => c.id);
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
 * the batch settles. Last messages stay volatile — but only the conversation(s)
 * whose recency actually changed since the last run are re-fetched
 * (`changedRecencyIds`), so new traffic on one conversation doesn't re-ask for
 * every other already-resolved conversation's preview.
 *
 * Trade-off: a contact renamed mid-session keeps its cached list label until the
 * page reloads; the detail/ficha refetches fresh, so this is cosmetic.
 */
export interface IUseRelatedEntitiesOptions {
  /**
   * Skip the volatile last-message batch fetch. Set while the Inbox is in
   * "search inside messages" mode (Opção D): `ConversationListItem` renders
   * `conversation.matchedMessage` instead of `lastMessage` there, so fetching
   * and caching last messages would be pure waste — a network round trip on
   * every search with nothing ever reading the result. Contacts still resolve
   * (the avatar/name always render regardless of mode).
   */
  skipLastMessages?: boolean;
}

export function useRelatedEntities(
  conversations: IConversation[],
  options: IUseRelatedEntitiesOptions = {},
): IRelatedEntities {
  const skipLastMessages = options.skipLastMessages ?? false;
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();

  const contactsRef = useRef<Map<ID, IConversationContact>>(new Map());
  const messagesRef = useRef<Map<ID, IMessage>>(new Map());
  const lastSeenRecencyRef = useRef<Map<ID, string>>(new Map());
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

  const recencyKey = useMemo(() => recencyKeyOf(conversations), [conversations]);

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

    // Volatile preview → a batched RPC (supabase: `last_messages_for_conversations`,
    // gated by can_access) for only the conversation(s) whose recency actually
    // moved since the last run. This replaces the ~50 concurrent per-conversation
    // reads that — for a non-staff seller, each re-evaluating the RLS access gate —
    // saturated the backend (statement_timeout → 500 on /messages), AND avoids
    // re-asking for every OTHER already-resolved conversation's last message every
    // time a single one changes (`changedRecencyIds`). The merge is
    // recency-guarded: overlapping ticks can resolve out of order, so a slow older
    // lookup must not stomp a newer preview already in the cache.
    const changedIds = skipLastMessages
      ? []
      : changedRecencyIds(conversations, lastSeenRecencyRef.current);
    if (changedIds.length > 0) {
      const changedIdSet = new Set(changedIds);
      const recencyByChangedId = new Map(
        conversations.filter((c) => changedIdSet.has(c.id)).map((c) => [c.id, c.lastMessageAt ?? ""]),
      );
      tasks.push(
        messagesProvider
          .listLastMessages(changedIds)
          .then((msgs) => {
            for (const m of msgs) {
              messagesRef.current.set(
                m.conversationId,
                newerMessage(messagesRef.current.get(m.conversationId), m),
              );
            }
            // Only mark a conversation as "seen" for THIS recency on success —
            // a rejected fetch (e.g. a transient RPC timeout) must leave it
            // eligible for retry on the next unrelated recency change, mirroring
            // the success-only caching contacts already use (missingIds/contactsRef).
            for (const [id, recency] of recencyByChangedId) {
              lastSeenRecencyRef.current.set(id, recency);
            }
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
  }, [recencyKey, skipLastMessages]);

  return related;
}
