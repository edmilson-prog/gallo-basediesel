import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

/**
 * Shared Supabase Realtime channel manager (PRD-105).
 *
 * One channel per table, reference-counted: the first subscriber creates and
 * subscribes the channel, later subscribers reuse it, and the channel is torn
 * down when the last subscriber leaves. Listeners receive every postgres_changes
 * event for the table; RLS scopes the events server-side (a seller only receives
 * changes for rows their policies let them SELECT).
 *
 * ## Auth-aware joins (fix for the silent `anon` subscription)
 *
 * postgres_changes claims are derived from the token present at JOIN time and
 * are never re-evaluated by the server — a later `access_token` push (which
 * supabase-js sends automatically after every join) updates broadcast/presence
 * auth but NOT the CDC subscription. A join that races ahead of
 * `auth.getSession()` therefore carries only the publishable (anon) apikey:
 * the channel reports SUBSCRIBED, no error is ever raised, and the RLS
 * authorizer silently filters 100% of events (all policies are
 * `to authenticated`). Verified live on 2026-07-02: `realtime.subscription`
 * rows with `claims_role='anon'` while a signed-in tab was open.
 *
 * The manager therefore:
 * 1. awaits `realtime.setAuth()` (which resolves the current session token)
 *    BEFORE the first `channel.subscribe()`, and
 * 2. tears down + re-joins every live channel whenever the auth token changes
 *    (sign-in, sign-out, token refresh — join claims also carry the token's
 *    `exp`, so refreshing keeps long sessions alive), preserving listeners and
 *    ref-counts across the swap.
 *
 * Channel topics carry a monotonic suffix so a replacement never collides with
 * a channel still leaving (supabase-js dedupes channels by topic and would
 * hand back the moribund instance).
 *
 * supabase-js already handles reconnection with backoff; the optional status
 * listener surfaces the SUBSCRIBED/disconnected transitions for UI badges and
 * lets consumers refetch on (re)join — postgres_changes has no replay, so any
 * join may sit after events that were never delivered.
 */

export type TableEventListener = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) => void;

export type ChannelStatusListener = (connected: boolean) => void;

interface IChannelEntry {
  table: string;
  channel: RealtimeChannel;
  /** Bumped on every (re)create — in-flight joins from older generations abort. */
  generation: number;
  /** Token the current channel joined with; `undefined` while the join is in flight. */
  joinToken: string | null | undefined;
  refs: number;
  listeners: Set<TableEventListener>;
  statusListeners: Set<ChannelStatusListener>;
  connected: boolean;
}

const entries = new Map<string, IChannelEntry>();

/** Monotonic topic suffix — topics are never reused across (re)creations. */
let channelSeq = 0;

let authWatcherStarted = false;

/**
 * Creates a fresh channel for the entry and joins it once the session token is
 * applied to the Realtime socket. Safe to call again for the same entry (auth
 * re-join): the generation bump makes any older in-flight join a no-op.
 */
function createAndJoin(entry: IChannelEntry): void {
  const client = getSupabaseClient();
  const generation = ++entry.generation;
  entry.joinToken = undefined;
  const channel = client
    .channel(`table:${entry.table}:${++channelSeq}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: entry.table },
      (payload) => {
        for (const listener of entry.listeners) listener(payload);
      },
    );
  entry.channel = channel;

  void (async () => {
    try {
      // Resolve the current session token into the socket BEFORE joining —
      // the join payload only includes a token that is already cached.
      await client.realtime.setAuth();
    } catch {
      // Best-effort: joining with the apikey is still better than never
      // joining; the auth watcher re-joins as soon as a session token lands.
    }

    let token: string | null = null;
    try {
      const { data } = await client.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      // Same best-effort stance as above.
    }

    const current = entries.get(`table:${entry.table}`);
    if (current !== entry || entry.generation !== generation) {
      // Torn down or re-created while waiting — this channel never joined.
      void client.removeChannel(channel);
      return;
    }

    entry.joinToken = token;
    channel.subscribe((status) => {
      if (entry.generation !== generation) return;
      const ok = status === "SUBSCRIBED";
      entry.connected = ok;
      for (const listener of entry.statusListeners) listener(ok);
    });
  })();
}

/** Swaps the entry's channel for a fresh one (join claims are join-sticky). */
function recreate(entry: IChannelEntry): void {
  const stale = entry.channel;
  if (entry.connected) {
    entry.connected = false;
    for (const listener of entry.statusListeners) listener(false);
  }
  void getSupabaseClient().removeChannel(stale);
  createAndJoin(entry);
}

/**
 * Registers (once) the auth watcher that re-joins live channels whenever the
 * access token changes. Registered lazily on first subscription so mock-mode
 * builds never instantiate the Supabase client.
 */
function ensureAuthRejoinWatcher(): void {
  if (authWatcherStarted) return;
  authWatcherStarted = true;
  getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    const token = session?.access_token ?? null;
    // Deferred: onAuthStateChange callbacks must not invoke other Supabase
    // auth APIs synchronously (the auth client still holds its lock).
    setTimeout(() => {
      for (const entry of entries.values()) {
        // `undefined` joinToken = join still in flight → recreate anyway; the
        // generation bump aborts the stale join, and the replacement reads the
        // session AFTER this event, so it always joins with the fresh token.
        if (entry.joinToken !== token) recreate(entry);
      }
    }, 0);
  });
}

/**
 * Subscribes to all postgres_changes events of a `public.<table>`.
 * Returns the unsubscribe function (always call it on cleanup).
 */
export function subscribeToTable(
  table: string,
  onEvent: TableEventListener,
  onStatus?: ChannelStatusListener,
): () => void {
  ensureAuthRejoinWatcher();
  const key = `table:${table}`;
  let entry = entries.get(key);

  if (!entry) {
    const created: IChannelEntry = {
      table,
      // Assigned synchronously by createAndJoin below.
      channel: null as unknown as RealtimeChannel,
      generation: 0,
      joinToken: undefined,
      refs: 0,
      listeners: new Set<TableEventListener>(),
      statusListeners: new Set<ChannelStatusListener>(),
      connected: false,
    };
    entries.set(key, created);
    createAndJoin(created);
    entry = created;
  }

  entry.refs += 1;
  entry.listeners.add(onEvent);
  if (onStatus) {
    entry.statusListeners.add(onStatus);
    onStatus(entry.connected);
  }

  const tracked = entry;
  return () => {
    tracked.refs -= 1;
    tracked.listeners.delete(onEvent);
    if (onStatus) tracked.statusListeners.delete(onStatus);
    if (tracked.refs <= 0) {
      // Abort any in-flight join for this entry before leaving.
      tracked.generation += 1;
      void getSupabaseClient().removeChannel(tracked.channel);
      entries.delete(key);
    }
  };
}

/**
 * Test-only hook to reset the module state between cases.
 * Not for production code.
 */
export function __resetRealtimeForTests(): void {
  entries.clear();
  channelSeq = 0;
  authWatcherStarted = false;
}
