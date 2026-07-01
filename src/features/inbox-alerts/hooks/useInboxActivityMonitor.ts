import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useAudioUnlock } from "@/features/session-timeout/hooks/useAudioUnlock";
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
} from "../engine/constants";
import { createTonePlayer } from "../lib/tonePlayer";
import { useInboxActivityStore } from "../store/inboxActivityStore";
import { useSoundAlertPreferencesStore } from "../store/soundAlertPreferencesStore";

const IS_SUPABASE = getActiveDataSource() === "supabase";

interface ICachedConversation {
  assignedSellerId: string | null;
  status: string;
  isSdrActive: boolean;
}

/** Raw `public.conversations` row as delivered by Realtime postgres_changes. */
interface IConversationRealtimeRow {
  id: string;
  store_id: string;
  assigned_seller_id: string | null;
  status: string;
  is_sdr_active: boolean;
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
 *  - Keeps `inboxActivityStore` (hasQueueWaiting / hasUnreadMine) live for
 *    the TopBar badge icon.
 *
 * Reliability note: the `messages` Realtime channel alone can silently miss
 * INSERTs under RLS evaluation load (documented in
 * `conversations/hooks/useRealtimeMessages.ts`) — the `conversations` touch
 * (last_message_at UPDATE, always reliable) is used as a fallback via
 * `getLastInboundAt`, deduped against the same per-conversation "last
 * alerted" timestamp as the fast path so neither path double-beeps.
 */
export function useInboxActivityMonitor(): void {
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId ?? null;
  const { currentStoreId } = useCurrentStore();
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();

  const tonePlayerRef = useRef<ReturnType<typeof createTonePlayer> | null>(null);
  if (!tonePlayerRef.current) tonePlayerRef.current = createTonePlayer();

  const unlockTonePlayer = useCallback(() => tonePlayerRef.current?.unlock(), []);
  useAudioUnlock(unlockTonePlayer, true);

  const cacheRef = useRef(new Map<string, ICachedConversation>());
  const lastAlertedInboundRef = useRef(new Map<string, string>());
  const lastQueueBeepAtRef = useRef<number | null>(null);
  const lastMineBeepAtRef = useRef<number | null>(null);

  // Seed: initial state before any Realtime event lands (e.g. right after login).
  useEffect(() => {
    if (!IS_SUPABASE || !currentStoreId) return;
    let cancelled = false;

    void conversationsProvider
      .list({ storeId: currentStoreId, assignmentAny: { queue: true }, pageSize: 200 })
      .then((res) => {
        if (cancelled) return;
        for (const c of res.data) {
          cacheRef.current.set(c.id, {
            assignedSellerId: c.assignedSellerId ?? null,
            status: c.status,
            isSdrActive: c.isSdrActive,
          });
        }
        useInboxActivityStore.getState().setHasQueueWaiting(res.total > 0);
      })
      .catch(() => {
        /* best-effort seed — the live channel still catches up */
      });

    if (sellerId) {
      void conversationsProvider
        .list({ storeId: currentStoreId, assignedSellerId: sellerId, pageSize: 200 })
        .then((res) => {
          if (cancelled) return;
          for (const c of res.data) {
            cacheRef.current.set(c.id, {
              assignedSellerId: c.assignedSellerId ?? null,
              status: c.status,
              isSdrActive: c.isSdrActive,
            });
          }
          useInboxActivityStore
            .getState()
            .setHasUnreadMine(res.data.some((c) => c.unreadCount > 0));
        })
        .catch(() => {
          /* best-effort seed — the live channel still catches up */
        });
    }

    return () => {
      cancelled = true;
    };
  }, [conversationsProvider, currentStoreId, sellerId]);

  // Live: Realtime subscriptions on the shared, ref-counted channels.
  useEffect(() => {
    if (!IS_SUPABASE || !currentStoreId) return;

    const cache = cacheRef.current;
    const lastAlertedInbound = lastAlertedInboundRef.current;
    // Reset per-store state — `currentStoreId` can change at RUNTIME (no page
    // reload: see MultistoreProvider.setCurrentStore) while this hook stays
    // mounted for the whole session. Without clearing, a conversation cached
    // from the PREVIOUS store would keep leaking into recomputeQueueState().
    cache.clear();
    lastAlertedInbound.clear();

    // Per-conversation debounce handles — several "mine" conversations can
    // each touch within the same debounce window, and a single shared handle
    // would cancel an earlier conversation's pending fallback check instead
    // of merely coalescing repeat touches of the SAME conversation.
    const touchDebounceHandles = new Map<string, number>();

    function recomputeQueueState() {
      let anyQueued = false;
      for (const entry of cache.values()) {
        if (isQueuedConversation(entry)) {
          anyQueued = true;
          break;
        }
      }
      useInboxActivityStore.getState().setHasQueueWaiting(anyQueued);
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
      const prefs = useSoundAlertPreferencesStore.getState();
      if (prefs.enabled) tonePlayerRef.current?.play("assigned-mine", prefs.volume);
    }

    const offConversations = subscribeToTable("conversations", (payload) => {
      if (payload.eventType === "DELETE") {
        const deletedId = (payload.old as { id?: string } | null)?.id;
        if (deletedId) {
          cache.delete(deletedId);
          recomputeQueueState();
        }
        return;
      }

      const row = payload.new as Partial<IConversationRealtimeRow> | null;
      if (!row?.id || row.store_id !== currentStoreId) return;

      const entry: ICachedConversation = {
        assignedSellerId: row.assigned_seller_id ?? null,
        status: row.status ?? "aguardando",
        isSdrActive: row.is_sdr_active ?? false,
      };
      cache.set(row.id, entry);
      recomputeQueueState();

      // Fila: só dispara na criação (INSERT), nunca em devolução (UPDATE) — fora
      // de escopo por exigir REPLICA IDENTITY FULL para comparar o estado anterior.
      if (payload.eventType === "INSERT" && isQueuedConversation(entry)) {
        const nowIso = new Date().toISOString();
        const eventIso = row.last_message_at ?? row.created_at ?? nowIso;
        const nowMs = Date.now();
        if (
          isRecentEvent(eventIso, nowIso, MAX_EVENT_AGE_MS) &&
          !shouldThrottle(lastQueueBeepAtRef.current, nowMs, MIN_BEEP_INTERVAL_MS)
        ) {
          lastQueueBeepAtRef.current = nowMs;
          const prefs = useSoundAlertPreferencesStore.getState();
          if (prefs.enabled) tonePlayerRef.current?.play("new-in-queue", prefs.volume);
        }
      }

      // Fallback confiável (ver docstring do hook): todo touch de uma conversa
      // "minha" checa a última mensagem inbound via RPC — o canal `messages`
      // pode ter perdido o INSERT correspondente.
      if (sellerId && entry.assignedSellerId === sellerId) {
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
                if (iso) maybeBeepMine(conversationId, iso);
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
      offConversations();
      offMessages();
      for (const handle of touchDebounceHandles.values()) window.clearTimeout(handle);
      touchDebounceHandles.clear();
    };
  }, [currentStoreId, sellerId, messagesProvider]);
}
