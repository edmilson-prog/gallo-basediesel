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
 * --- realtime-js v2 behaviour (verified in the installed dist source) ---
 * 1. `client.channel(topic)` REUSES an existing channel when one with the same
 *    topic is already registered (RealtimeClient.js, `channel()`: it finds by
 *    topic and returns the existing instance instead of creating a new one).
 *    Tracker and reader therefore SHARE one instance for `presence:store:<id>`,
 *    so the lifecycle must be owned by a module-level ref-counted manager —
 *    otherwise one consumer's removeChannel tears the channel down for the other.
 * 2. The default presence key is `''` (RealtimeChannel.js line 97), which makes
 *    the SERVER assign a random UUID per connection as the presence key. The
 *    keys of `presenceState()` are therefore NOT seller ids — the tracked
 *    payload `{ sellerId }` lives in the presence VALUES, so the reader maps
 *    over `Object.values(state).flat()` instead of `Object.keys(state)`.
 * 3. `channel.subscribe(cb)` is guarded by `channelAdapter.isClosed()`
 *    (RealtimeChannel.js line 136): a second subscribe on a joining/joined
 *    channel silently skips its body and the callback is never registered.
 *    Hence the manager calls subscribe() exactly ONCE and fans the SUBSCRIBED
 *    transition out to `joinListeners` — the tracker attaches its `.track()`
 *    announce there (and fires immediately when attaching after the join).
 */

const channelTopic = (storeId: string) => `presence:store:${storeId}`;

// ---------------------------------------------------------------------------
// Module-level shared presence channel manager (one channel per topic)
// ---------------------------------------------------------------------------

interface IPresenceEntry {
  channel: RealtimeChannel;
  /** Number of active consumers (tracker + readers). */
  refs: number;
  /** True while the channel is SUBSCRIBED (re-fires after reconnects). */
  joined: boolean;
  /** Fired on every SUBSCRIBED transition — trackers (re-)announce here. */
  joinListeners: Set<() => void>;
  /** Fired on every presence sync — readers recompute the online set here. */
  syncListeners: Set<() => void>;
}

const presenceEntries = new Map<string, IPresenceEntry>();

/**
 * Acquire (or reuse) the shared presence channel for a topic. The manager owns
 * the channel lifecycle: it subscribes exactly once and fans join/sync events
 * out to the listener sets on the returned entry. Pair with `release(topic)`.
 */
function acquire(topic: string): IPresenceEntry {
  let entry = presenceEntries.get(topic);

  if (!entry) {
    // No presence key config: the server assigns a per-connection UUID key;
    // identity travels in the tracked payload instead (see header note 2).
    const channel = getSupabaseClient().channel(topic);

    const created: IPresenceEntry = {
      channel,
      refs: 0,
      joined: false,
      joinListeners: new Set(),
      syncListeners: new Set(),
    };

    // realtime-js fires a "sync" after every presence diff (join/leave
    // included), so a single sync binding is sufficient for readers.
    channel.on("presence", { event: "sync" }, () => {
      for (const listener of created.syncListeners) listener();
    });

    // Subscribe exactly ONCE (see header note 3) and fan out the join.
    channel.subscribe((status) => {
      created.joined = status === "SUBSCRIBED";
      if (created.joined) {
        for (const listener of created.joinListeners) listener();
      }
    });

    presenceEntries.set(topic, created);
    entry = created;
  }

  entry.refs += 1;
  return entry;
}

/**
 * Release one reference. Removal is DEFERRED with a grace re-check so React
 * StrictMode's unmount→remount and rapid store toggles re-acquire the live
 * entry instead of grabbing a channel that is mid-teardown.
 */
function release(topic: string): void {
  const entry = presenceEntries.get(topic);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    setTimeout(() => {
      const e = presenceEntries.get(topic);
      if (e && e.refs <= 0) {
        presenceEntries.delete(topic);
        void getSupabaseClient().removeChannel(e.channel);
      }
    }, 0);
  }
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
    const entry = acquire(topic);

    const announce = () => void entry.channel.track({ sellerId });
    entry.joinListeners.add(announce);
    // Late attach: the shared channel may already be joined (e.g. a reader
    // acquired it first) — the join fanout already happened, announce now.
    if (entry.joined) announce();

    return () => {
      entry.joinListeners.delete(announce);
      // Stop broadcasting this seller even if a reader keeps the channel
      // alive — prevents a ghost "online" after logout/store switch.
      if (entry.joined) void entry.channel.untrack();
      release(topic);
    };
  }, [sellerId, currentStoreId]);
}

/** Set of seller ids currently online in the store; null in mock auth mode. */
export function useStorePresence(storeId: string): Set<string> | null {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase") return;
    const topic = channelTopic(storeId);
    const entry = acquire(topic);

    const sync = () => {
      // Presence keys are server-assigned UUIDs (header note 2) — read the
      // seller ids from the tracked payload values instead.
      const state = entry.channel.presenceState<{ sellerId?: string }>();
      const ids = Object.values(state)
        .flat()
        .map((presence) => presence.sellerId)
        .filter((value): value is string => typeof value === "string");
      setOnline(new Set(ids));
    };
    entry.syncListeners.add(sync);
    // Initial state for late attachers — the channel may already hold a
    // synced presence map from before this reader mounted.
    sync();

    return () => {
      entry.syncListeners.delete(sync);
      release(topic);
    };
  }, [storeId]);

  return AUTH_SOURCE === "supabase" ? online : null;
}
