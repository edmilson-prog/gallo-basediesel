import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useSoundEventPlayer } from "@/features/sound-settings";
import {
  getActiveDataSource,
  useConversationsProvider,
  useMessagesProvider,
} from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";
import { isQueuedConversation } from "../engine/isQueuedConversation";
import { isRecentEvent } from "../engine/isRecentEvent";
import { isFreshInboundTimestamp } from "../engine/isFreshInboundTimestamp";
import { shouldThrottle } from "../engine/shouldThrottle";
import {
  MAX_EVENT_AGE_MS,
  MIN_BEEP_INTERVAL_MS,
  CONVERSATION_TOUCH_DEBOUNCE_MS,
  SIGNAL_REVALIDATE_DEBOUNCE_MS,
  MINE_SCAN_PAGE_SIZE,
} from "../engine/constants";
import { useInboxActivityStore } from "../store/inboxActivityStore";

const IS_SUPABASE = getActiveDataSource() === "supabase";

/**
 * Mine-only cache entry — just enough to (a) resolve the messages fast-path
 * ("is this message's conversation assigned to me?") and (b) gate the touch
 * fallback on an actual `last_message_at` advance. Only the seller's own
 * conversations are cached, so the map stays bounded to the seller's caseload
 * rather than growing with every store-wide conversation touched this session.
 */
interface ICachedConversation {
  assignedSellerId: string | null;
  lastMessageAt: string;
}

/** Raw `public.conversations` row as delivered by Realtime postgres_changes. */
interface IConversationRealtimeRow {
  id: string;
  store_id: string;
  assigned_seller_id: string | null;
  status: string;
  is_sdr_active: boolean;
  unread_count: number;
  last_message_at: string;
  created_at: string;
}

/** Raw `public.messages` row — only the fields this monitor needs. */
interface IMessageRealtimeRow {
  conversation_id: string;
  direction: "in" | "out";
  sent_at: string;
}

/**
 * Global Inbox activity monitor — mounted ONCE (via InboxActivityGuard, in
 * AppLayout) for the whole authenticated session. Watches the shared
 * `conversations`/`messages` Realtime channels (PRD-105) app-wide and:
 *
 *  - Plays "new-in-queue" when a fresh unassigned conversation is created.
 *  - Plays "assigned-mine" when a fresh inbound message lands on a
 *    conversation assigned to the signed-in seller.
 *  - Keeps `inboxActivityStore` (hasQueueWaiting / hasUnreadMine) live for the
 *    TopBar badge icon.
 *
 * Badge derivation is AUTHORITATIVE, not cache-derived: on every relevant
 * Realtime event (debounced) the monitor re-queries the exact state.
 *  - hasQueueWaiting = "does this store have any queued conversation?" — read
 *    from count() (the gated-once count_conversations RPC), so a backlog larger
 *    than any page size still lights the signal without paying per-row RLS.
 *  - hasUnreadMine = "does the seller have any unread conversation of their
 *    own?" — turned ON by inbound and OFF by markRead (both are `conversations`
 *    UPDATEs), so the badge is a single source of truth owned here (the Inbox
 *    page no longer writes a filter-scoped value into it).
 *
 * Reliability note: the `messages` Realtime channel alone can silently miss
 * INSERTs under RLS evaluation load (documented in
 * `conversations/hooks/useRealtimeMessages.ts`) — the `conversations` touch
 * (last_message_at UPDATE, always reliable) is used as a fallback via
 * `getLastInboundAt`, deduped against the same per-conversation "last alerted"
 * timestamp as the fast path so neither path double-beeps.
 */
export function useInboxActivityMonitor(): void {
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId ?? null;
  const { currentStoreId } = useCurrentStore();
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();

  const { play } = useSoundEventPlayer();

  const cacheRef = useRef(new Map<string, ICachedConversation>());
  const lastAlertedInboundRef = useRef(new Map<string, string>());
  const lastQueueBeepAtRef = useRef<number | null>(null);
  const lastMineBeepAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!IS_SUPABASE || !currentStoreId) return;

    // Narrowed copy: `currentStoreId` is `string` here (guarded above), but TS
    // re-widens it to `string | null` inside the nested closures below, which
    // the `storeId?: ID` list param rejects. Capture it once as a `string`.
    const storeId = currentStoreId;
    const cache = cacheRef.current;
    const lastAlertedInbound = lastAlertedInboundRef.current;

    // Reset ALL per-store runtime state. `currentStoreId`/`sellerId` can change
    // at RUNTIME (MultistoreProvider.setCurrentStore — no page reload) while
    // this hook stays mounted for the whole session. Without a full reset,
    // stale conversations, throttle timers, and badge flags from the PREVIOUS
    // store would leak into the new one (e.g. a recent beep suppressing the
    // first legitimate beep of the new store, or a stale dot lingering until
    // the first event of the new store). The re-queries below repaint the badge
    // from ground truth for the newly selected store.
    cache.clear();
    lastAlertedInbound.clear();
    lastQueueBeepAtRef.current = null;
    lastMineBeepAtRef.current = null;
    useInboxActivityStore.getState().setHasQueueWaiting(false);
    useInboxActivityStore.getState().setHasUnreadMine(false);

    let disposed = false;
    // Monotonic generation guards: only the most recently issued re-query for a
    // signal may write it, so a slow response can never clobber a newer value
    // (whether from a later re-query or a live event handled in the meantime).
    let queueGen = 0;
    let mineGen = 0;
    let queueRevalidateHandle: number | undefined;
    let mineRevalidateHandle: number | undefined;
    const touchDebounceHandles = new Map<string, number>();

    function revalidateQueue() {
      const gen = ++queueGen;
      // count() routes to the gated-once count_conversations RPC. The previous
      // list({queue, pageSize: 1}) read res.total, which is PostgREST
      // `count: "exact"` — per-row RLS over the WHOLE queue candidate set
      // (5-20s for non-staff). Fired here on every conversations Realtime
      // event, per connected client, it was the main driver of the 2026-07-07
      // statement_timeout storm. count() takes no storeId by contract: the RPC
      // scopes by the JWT's store, and this effect already resets per store.
      void conversationsProvider
        .count({ assignmentAny: { queue: true } })
        .then((total) => {
          if (disposed || gen !== queueGen) return;
          useInboxActivityStore.getState().setHasQueueWaiting(total > 0);
        })
        .catch(() => {
          /* best-effort — the next event reschedules a re-query */
        });
    }

    function revalidateMine() {
      if (!sellerId) return;
      const gen = ++mineGen;
      void conversationsProvider
        .list({
          storeId,
          assignedSellerId: sellerId,
          pageSize: MINE_SCAN_PAGE_SIZE,
          // Only res.data is read below — skip the count: "exact" total, which
          // re-runs the per-row RLS gate over the seller's whole assigned set.
          withTotal: false,
        })
        .then((res) => {
          if (disposed) return;
          // Refresh the mine-only cache the messages fast-path reads from.
          for (const c of res.data) {
            cache.set(c.id, {
              assignedSellerId: c.assignedSellerId ?? null,
              lastMessageAt: c.lastMessageAt,
            });
          }
          if (gen !== mineGen) return;
          useInboxActivityStore
            .getState()
            .setHasUnreadMine(res.data.some((c) => c.unreadCount > 0));
        })
        .catch(() => {
          /* best-effort — the next event reschedules a re-query */
        });
    }

    function scheduleQueueRevalidate() {
      if (queueRevalidateHandle !== undefined) window.clearTimeout(queueRevalidateHandle);
      queueRevalidateHandle = window.setTimeout(revalidateQueue, SIGNAL_REVALIDATE_DEBOUNCE_MS);
    }
    function scheduleMineRevalidate() {
      if (mineRevalidateHandle !== undefined) window.clearTimeout(mineRevalidateHandle);
      mineRevalidateHandle = window.setTimeout(revalidateMine, SIGNAL_REVALIDATE_DEBOUNCE_MS);
    }

    function maybeBeepMine(conversationId: string, candidateSentAt: string) {
      const nowIso = new Date().toISOString();
      const lastAlerted = lastAlertedInbound.get(conversationId) ?? null;
      if (!isFreshInboundTimestamp(candidateSentAt, lastAlerted, nowIso, MAX_EVENT_AGE_MS)) return;
      lastAlertedInbound.set(conversationId, candidateSentAt);
      useInboxActivityStore.getState().setHasUnreadMine(true);

      const nowMs = Date.now();
      if (shouldThrottle(lastMineBeepAtRef.current, nowMs, MIN_BEEP_INTERVAL_MS)) return;
      lastMineBeepAtRef.current = nowMs;
      play("inboxAssignedMine");
    }

    // Seed the badge from ground truth before any Realtime event lands.
    revalidateQueue();
    revalidateMine();

    const offConversations = subscribeToTable("conversations", (payload) => {
      if (payload.eventType === "DELETE") {
        const deletedId = (payload.old as { id?: string } | null)?.id;
        if (deletedId) cache.delete(deletedId);
        // A deleted conversation may have been queued or mine — re-derive both.
        scheduleQueueRevalidate();
        if (sellerId) scheduleMineRevalidate();
        return;
      }

      const row = payload.new as Partial<IConversationRealtimeRow> | null;
      if (!row?.id || row.store_id !== storeId) return;

      const assignedSellerId = row.assigned_seller_id ?? null;
      const isMine = sellerId !== null && assignedSellerId === sellerId;
      const wasMine = cache.has(row.id);
      const prevLastMessageAt = cache.get(row.id)?.lastMessageAt ?? null;
      const rowLastMessageAt = row.last_message_at ?? row.created_at ?? null;

      // Keep the cache to the seller's own conversations only.
      if (isMine) {
        cache.set(row.id, {
          assignedSellerId,
          lastMessageAt: rowLastMessageAt ?? prevLastMessageAt ?? new Date().toISOString(),
        });
      } else if (wasMine) {
        cache.delete(row.id);
      }

      // Queue signal: any event can add or remove a queued conversation.
      scheduleQueueRevalidate();
      // Mine signal: re-derive when the event touches a conversation that is or
      // was the seller's — inbound raises unread, markRead clears it, and a
      // reassignment moves it in or out of "mine".
      if (isMine || wasMine) scheduleMineRevalidate();

      // Queue beep: only on creation (INSERT), never on a hand-back (UPDATE) —
      // detecting a hand-back would require REPLICA IDENTITY FULL to compare the
      // previous state, which is out of scope.
      if (
        payload.eventType === "INSERT" &&
        isQueuedConversation({
          assignedSellerId,
          status: row.status ?? "aguardando",
          isSdrActive: row.is_sdr_active ?? false,
        })
      ) {
        const nowIso = new Date().toISOString();
        const eventIso = rowLastMessageAt ?? nowIso;
        const nowMs = Date.now();
        if (
          isRecentEvent(eventIso, nowIso, MAX_EVENT_AGE_MS) &&
          !shouldThrottle(lastQueueBeepAtRef.current, nowMs, MIN_BEEP_INTERVAL_MS)
        ) {
          lastQueueBeepAtRef.current = nowMs;
          play("inboxNewInQueue");
        }
      }

      // Reliable fallback (see hook docstring): the `messages` channel can miss
      // an inbound INSERT under RLS load. Probe `getLastInboundAt` only when this
      // event actually ADVANCED `last_message_at` on one of my conversations —
      // markRead / tag / status / SDR toggles bump only `updated_at`, so they no
      // longer trigger a wasted RPC round-trip.
      if (
        isMine &&
        rowLastMessageAt !== null &&
        (prevLastMessageAt === null || rowLastMessageAt > prevLastMessageAt)
      ) {
        const conversationId = row.id;
        const pending = touchDebounceHandles.get(conversationId);
        if (pending !== undefined) window.clearTimeout(pending);
        touchDebounceHandles.set(
          conversationId,
          window.setTimeout(() => {
            touchDebounceHandles.delete(conversationId);
            void messagesProvider
              .getLastInboundAt(conversationId)
              .then((iso) => {
                if (!disposed && iso) maybeBeepMine(conversationId, iso);
              })
              .catch(() => {
                /* best-effort — a later touch retries */
              });
          }, CONVERSATION_TOUCH_DEBOUNCE_MS),
        );
      }
    });

    const offMessages = subscribeToTable("messages", (payload) => {
      const row = payload.new as Partial<IMessageRealtimeRow> | null;
      if (!row?.conversation_id || row.direction !== "in" || !row.sent_at) return;
      const cached = cache.get(row.conversation_id);
      if (!sellerId || !cached || cached.assignedSellerId !== sellerId) return;
      maybeBeepMine(row.conversation_id, row.sent_at);
    });

    return () => {
      disposed = true;
      offConversations();
      offMessages();
      if (queueRevalidateHandle !== undefined) window.clearTimeout(queueRevalidateHandle);
      if (mineRevalidateHandle !== undefined) window.clearTimeout(mineRevalidateHandle);
      for (const handle of touchDebounceHandles.values()) window.clearTimeout(handle);
      touchDebounceHandles.clear();
    };
  }, [conversationsProvider, messagesProvider, currentStoreId, sellerId]);
}
