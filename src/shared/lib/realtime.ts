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
 * supabase-js already handles reconnection with backoff; the optional status
 * listener surfaces the SUBSCRIBED/disconnected transitions for UI badges.
 */

export type TableEventListener = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) => void;

export type ChannelStatusListener = (connected: boolean) => void;

interface IChannelEntry {
  channel: RealtimeChannel;
  refs: number;
  listeners: Set<TableEventListener>;
  statusListeners: Set<ChannelStatusListener>;
  connected: boolean;
}

const entries = new Map<string, IChannelEntry>();

/**
 * Subscribes to all postgres_changes events of a `public.<table>`.
 * Returns the unsubscribe function (always call it on cleanup).
 */
export function subscribeToTable(
  table: string,
  onEvent: TableEventListener,
  onStatus?: ChannelStatusListener,
): () => void {
  const key = `table:${table}`;
  let entry = entries.get(key);

  if (!entry) {
    const listeners = new Set<TableEventListener>();
    const statusListeners = new Set<ChannelStatusListener>();
    const channel = getSupabaseClient()
      .channel(key)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        for (const listener of listeners) listener(payload);
      });

    const created: IChannelEntry = {
      channel,
      refs: 0,
      listeners,
      statusListeners,
      connected: false,
    };
    entries.set(key, created);

    channel.subscribe((status) => {
      const ok = status === "SUBSCRIBED";
      created.connected = ok;
      for (const listener of created.statusListeners) listener(ok);
    });

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
      void getSupabaseClient().removeChannel(tracked.channel);
      entries.delete(key);
    }
  };
}
