import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";

/**
 * Realtime Presence per store (users CRUD addendum): "online" means the app is
 * open in some browser. The shell tracks the signed-in seller; the users screen
 * reads the set of online seller ids. Supabase auth mode only — in mock mode
 * the reader returns null and callers derive a seeded status instead.
 *
 * --- Duplicate-topic channel behaviour (investigated 2026-06-11) ---
 * supabase-js RealtimeClient.channel() RETURNS AN EXISTING channel if one with
 * the same topic string is already registered (src: node_modules/@supabase/
 * realtime-js/dist/main/RealtimeClient.js lines 343-355, method `channel()`):
 *
 *   const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
 *   if (!exists) { ... push new; return new; } else { return exists; }
 *
 * This means the tracker (AppLayout) and the reader (users screen) would get
 * the same instance for `presence:store:<id>`. Strategy (a) is therefore
 * unsafe: calling removeChannel from one component would tear down the channel
 * for the other. We use strategy (b): a module-level shared channel manager
 * (ref-counted, one channel per topic) modelled after src/shared/lib/realtime.ts.
 * The tracker calls .track() on the shared channel; the reader attaches presence
 * event listeners to it. Both share the same underlying WS join.
 */

const channelTopic = (storeId: string) => `presence:store:${storeId}`;

// ---------------------------------------------------------------------------
// Module-level shared presence channel manager (strategy b)
// ---------------------------------------------------------------------------

interface IPresenceEntry {
  channel: RealtimeChannel;
  /** Number of active consumers (tracker + readers). */
  refs: number;
  /** Presence sync callbacks registered by readers. */
  syncCallbacks: Set<() => void>;
}

const presenceEntries = new Map<string, IPresenceEntry>();

/**
 * Acquire a shared presence channel for the given store, subscribing if it
 * does not yet exist. Returns an unsubscribe/release function.
 *
 * @param topic     The presence topic string, e.g. `presence:store:<id>`.
 * @param onSync    Optional callback invoked on every presence sync/join/leave
 *                  event — register this from readers.
 */
function acquirePresenceChannel(topic: string, onSync?: () => void): () => void {
  let entry = presenceEntries.get(topic);

  if (!entry) {
    const syncCallbacks = new Set<() => void>();
    const fireSync = () => {
      for (const cb of syncCallbacks) cb();
    };

    const channel = getSupabaseClient()
      .channel(topic, { config: { presence: { key: "" } } })
      .on("presence", { event: "sync" }, fireSync)
      .on("presence", { event: "join" }, fireSync)
      .on("presence", { event: "leave" }, fireSync);

    channel.subscribe();

    entry = { channel, refs: 0, syncCallbacks };
    presenceEntries.set(topic, entry);
  }

  entry.refs += 1;
  if (onSync) entry.syncCallbacks.add(onSync);

  const capturedEntry = entry;
  return () => {
    if (onSync) capturedEntry.syncCallbacks.delete(onSync);
    capturedEntry.refs -= 1;
    if (capturedEntry.refs <= 0) {
      void getSupabaseClient().removeChannel(capturedEntry.channel);
      presenceEntries.delete(topic);
    }
  };
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

/** Mounted once in AppLayout — announces the signed-in seller as online. */
export function usePresenceTracker(): void {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const sellerId = currentUser?.sellerId;

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase" || !sellerId || !currentStoreId) return;
    const topic = channelTopic(currentStoreId);
    // Acquire (or reuse) the shared channel for this store, then track.
    const release = acquirePresenceChannel(topic);
    const entry = presenceEntries.get(topic);
    if (entry) {
      entry.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void entry.channel.track({ sellerId });
      });
    }
    return () => {
      release();
    };
  }, [sellerId, currentStoreId]);
}

/** Set of seller ids currently online in the store; null in mock auth mode. */
export function useStorePresence(storeId: string): Set<string> | null {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase") return;
    const topic = channelTopic(storeId);
    const sync = () => {
      const entry = presenceEntries.get(topic);
      if (entry) {
        setOnline(new Set(Object.keys(entry.channel.presenceState())));
      }
    };
    const release = acquirePresenceChannel(topic, sync);
    // Immediately derive the current state in case the channel was already live.
    sync();
    return () => {
      release();
    };
  }, [storeId]);

  return AUTH_SOURCE === "supabase" ? online : null;
}
