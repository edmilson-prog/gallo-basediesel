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
 *
 * --- The wire topic is SHARED STATE, never per-tab (fix for "everyone offline") ---
 * Presence is grouped BY WIRE TOPIC on the server: only clients joined to the
 * SAME topic appear in each other's `presenceState()`. A per-tab topic suffix
 * (`<topic>:<bootId>:<seq>`, in place from 2026-07-05 to 2026-08-05) therefore
 * isolated every browser in a channel of its own — each user only ever saw
 * THEMSELVES online, on the users screen and on the per-conversation dot, with
 * no error raised anywhere. That suffix is legitimate in `shared/lib/realtime.ts`
 * (postgres_changes carries no cross-client state) but is a silent correctness
 * bug here.
 *
 * The problem the suffix worked around — re-acquiring a topic whose previous
 * channel is still mid-`phx_leave` gets the dedup-by-topic zombie (note 1)
 * whose `subscribe()` no-ops (note 3), leaving a dead presence dot — is instead
 * solved by DEFERRING: the manager tracks the in-flight removal per topic and
 * only creates the replacement once that removal settles. Consumers therefore
 * never hold the channel directly (it may not exist yet); they go through the
 * entry's `track` / `untrack` / `presenceState` methods, which no-op or read
 * empty while a channel is pending and re-fire `syncListeners` once it lands.
 */
export interface IPresenceChannelEntry {
  /** Number of active consumers (tracker + readers). */
  refs: number;
  /** True while the channel is SUBSCRIBED (re-fires after reconnects). */
  joined: boolean;
  /** Fired on every SUBSCRIBED transition — trackers (re-)announce here. */
  joinListeners: Set<() => void>;
  /** Fired on every presence sync (and once per channel (re)create) — readers recompute here. */
  syncListeners: Set<() => void>;
  /** Announce the local payload. No-op until the channel exists and is joined. */
  track: (payload: Record<string, unknown>) => void;
  /** Stop announcing the local payload. No-op when there is nothing joined. */
  untrack: () => void;
  /** Current presence map; empty object while the channel is being (re)created. */
  presenceState: <T extends Record<string, unknown>>() => Record<string, T[]>;
}

interface IPresenceEntry extends IPresenceChannelEntry {
  /** null while a (re)create is deferred behind a pending removal. */
  channel: RealtimeChannel | null;
}

const presenceEntries = new Map<string, IPresenceEntry>();

/**
 * In-flight `removeChannel()` per topic. A replacement for the same topic waits
 * on this instead of racing the leave (see the header note on deferring).
 */
const pendingRemovals = new Map<string, Promise<unknown>>();

/**
 * Acquire (or reuse) the shared presence channel for a topic. The manager owns
 * the channel lifecycle: it subscribes exactly once and fans join/sync events
 * out to the listener sets on the returned entry. Pair with `releasePresenceChannel(topic)`.
 */
export function acquirePresenceChannel(topic: string): IPresenceChannelEntry {
  let entry = presenceEntries.get(topic);

  if (!entry) {
    const created: IPresenceEntry = {
      channel: null,
      refs: 0,
      joined: false,
      joinListeners: new Set(),
      syncListeners: new Set(),
      track: (payload) => {
        if (created.channel && created.joined) void created.channel.track(payload);
      },
      untrack: () => {
        if (created.channel && created.joined) void created.channel.untrack();
      },
      presenceState: <T extends Record<string, unknown>>() =>
        created.channel ? created.channel.presenceState<T>() : ({} as Record<string, T[]>),
    };

    presenceEntries.set(topic, created);
    openChannel(topic, created);
    entry = created;
  }

  entry.refs += 1;
  return entry;
}

/** Creates the channel now, or as soon as a pending removal for the topic settles. */
function openChannel(topic: string, entry: IPresenceEntry): void {
  const pending = pendingRemovals.get(topic);
  if (!pending) {
    createAndJoin(topic, entry);
    return;
  }
  void pending.then(() => {
    // Released again while waiting — a newer entry (or none) owns the topic now.
    if (presenceEntries.get(topic) !== entry) return;
    createAndJoin(topic, entry);
  });
}

function createAndJoin(topic: string, entry: IPresenceEntry): void {
  const client = getSupabaseClient();

  // Defensive: a leave that timed out or errored never reached `teardown()`, so
  // the moribund channel can still be registered under this topic and would be
  // handed back by dedup-by-topic (note 1). Tear it down before creating.
  const stale = client.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (stale) stale.teardown();

  const channel = client.channel(topic);
  entry.channel = channel;

  // realtime-js fires a "sync" after every presence diff (join/leave
  // included), so a single sync binding is sufficient for readers.
  channel.on("presence", { event: "sync" }, () => {
    for (const listener of entry.syncListeners) listener();
  });

  // Subscribe exactly ONCE (see header note 3) and fan out the join.
  channel.subscribe((status) => {
    entry.joined = status === "SUBSCRIBED";
    if (entry.joined) {
      for (const listener of entry.joinListeners) listener();
    }
  });

  // Readers that mounted while the channel was pending read an empty map — let
  // them recompute now that a live channel exists.
  for (const listener of entry.syncListeners) listener();
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
      if (!e || e.refs > 0) return;
      presenceEntries.delete(topic);
      if (!e.channel) return; // never created (deferred create still waiting)
      const removal = getSupabaseClient()
        .removeChannel(e.channel)
        .finally(() => {
          // Only clear our own removal — a later cycle may already own the slot.
          if (pendingRemovals.get(topic) === removal) pendingRemovals.delete(topic);
        });
      pendingRemovals.set(topic, removal);
    }, 0);
  }
}

/** Test-only hook to reset module state between cases. Not for production code. */
export function __resetPresenceChannelsForTests(): void {
  presenceEntries.clear();
  pendingRemovals.clear();
}
