import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

/**
 * Generic Realtime Presence channel manager, one channel per topic,
 * reference-counted: the first subscriber creates and joins the channel,
 * later subscribers reuse it, and it's torn down when the last leaves.
 * Extracted from `src/features/shell/hooks/useStorePresence.ts` (PRD "users
 * CRUD addendum", originally store-only) so a second presence scope
 * (per-conversation collaboration) can reuse the exact same join/re-join/
 * teardown semantics instead of duplicating them.
 *
 * --- realtime-js v2 behaviour (verified in the installed dist source) ---
 * 1. `client.channel(topic)` REUSES an existing channel when one with the same
 *    topic is already registered (RealtimeClient.js, `channel()`: it finds by
 *    topic and returns the existing instance instead of creating a new one).
 *    Any two consumers of the SAME topic therefore SHARE one channel instance,
 *    so the lifecycle must be owned by this module-level ref-counted manager —
 *    otherwise one consumer's removeChannel tears the channel down for the other.
 * 2. The default presence key is `''` (RealtimeChannel.js line 97), which makes
 *    the SERVER assign a random UUID per connection as the presence key. The
 *    keys of `presenceState()` are therefore NOT the tracked identity — the
 *    tracked payload (e.g. `{ sellerId }`) lives in the presence VALUES, so a
 *    reader maps over `Object.values(state).flat()` instead of `Object.keys(state)`.
 * 3. `channel.subscribe(cb)` is guarded by `channelAdapter.isClosed()`
 *    (RealtimeChannel.js line 136): a second subscribe on a joining/joined
 *    channel silently skips its body and the callback is never registered.
 *    Hence the manager calls subscribe() exactly ONCE and fans the SUBSCRIBED
 *    transition out to `joinListeners` — a tracker attaches its `.track()`
 *    announce there (and fires immediately when attaching after the join).
 */
export interface IPresenceChannelEntry {
  channel: RealtimeChannel;
  /** Number of active consumers (tracker + readers). */
  refs: number;
  /** True while the channel is SUBSCRIBED (re-fires after reconnects). */
  joined: boolean;
  /** Fired on every SUBSCRIBED transition — trackers (re-)announce here. */
  joinListeners: Set<() => void>;
  /** Fired on every presence sync — readers recompute their set here. */
  syncListeners: Set<() => void>;
}

const presenceEntries = new Map<string, IPresenceChannelEntry>();

/**
 * Acquire (or reuse) the shared presence channel for a topic. The manager owns
 * the channel lifecycle: it subscribes exactly once and fans join/sync events
 * out to the listener sets on the returned entry. Pair with `releasePresenceChannel(topic)`.
 */
export function acquirePresenceChannel(topic: string): IPresenceChannelEntry {
  let entry = presenceEntries.get(topic);

  if (!entry) {
    // No presence key config: the server assigns a per-connection UUID key;
    // identity travels in the tracked payload instead (see header note 2).
    const channel = getSupabaseClient().channel(topic);

    const created: IPresenceChannelEntry = {
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
 * StrictMode's unmount→remount and rapid toggles re-acquire the live entry
 * instead of grabbing a channel that is mid-teardown.
 */
export function releasePresenceChannel(topic: string): void {
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

/** Test-only hook to reset module state between cases. Not for production code. */
export function __resetPresenceChannelsForTests(): void {
  presenceEntries.clear();
}
