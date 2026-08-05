import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the shared presence channel manager (node env — no DOM, per
 * the project's testing convention).
 *
 * The invariant under test: presence is grouped BY WIRE TOPIC on the server, so
 * every browser watching the same logical scope must join the exact same topic.
 * A per-tab suffix (regression from 2026-07-05) silently isolates each browser
 * in a channel of its own — `presenceState()` then only ever contains the local
 * user, so everyone else reads as offline while no error is raised anywhere.
 *
 * The suffix existed to dodge supabase-js' dedup-by-topic: re-acquiring a topic
 * whose previous channel is still mid-`phx_leave` hands back the moribund
 * instance, whose `subscribe()` no-ops. The manager solves that by DEFERRING the
 * re-create until the pending removal settles instead of renaming the topic.
 */

interface IFakeChannel {
  topic: string;
  syncHandler: (() => void) | null;
  statusCallback: ((status: string) => void) | null;
  subscribeCalls: number;
  tracked: Array<Record<string, unknown>>;
  untrackCalls: number;
  presence: Record<string, Array<Record<string, unknown>>>;
  tornDown: boolean;
  on: (type: string, filter: unknown, cb: () => void) => IFakeChannel;
  subscribe: (cb?: (status: string) => void) => IFakeChannel;
  track: (payload: Record<string, unknown>) => Promise<string>;
  untrack: () => Promise<string>;
  presenceState: <T>() => Record<string, T[]>;
  teardown: () => void;
}

const state = vi.hoisted(() => ({
  channels: [] as IFakeChannel[],
  /** Resolvers of the in-flight removeChannel promises, in call order. */
  removals: [] as Array<{ channel: IFakeChannel; resolve: () => void }>,
}));

const fakeClient = vi.hoisted(() => ({
  channel(topic: string) {
    const wireTopic = `realtime:${topic}`;
    // Mirrors RealtimeClient.channel(): dedupe by wire topic.
    const existing = state.channels.find((c) => c.topic === wireTopic && !c.tornDown);
    if (existing) return existing;
    const ch: IFakeChannel = {
      topic: wireTopic,
      syncHandler: null,
      statusCallback: null,
      subscribeCalls: 0,
      tracked: [],
      untrackCalls: 0,
      presence: {},
      tornDown: false,
      on(_type: string, _filter: unknown, cb: () => void) {
        ch.syncHandler = cb;
        return ch;
      },
      subscribe(cb?: (status: string) => void) {
        ch.subscribeCalls += 1;
        ch.statusCallback = cb ?? null;
        return ch;
      },
      track(payload: Record<string, unknown>) {
        ch.tracked.push(payload);
        return Promise.resolve("ok");
      },
      untrack() {
        ch.untrackCalls += 1;
        return Promise.resolve("ok");
      },
      presenceState<T>() {
        return ch.presence as unknown as Record<string, T[]>;
      },
      teardown() {
        ch.tornDown = true;
      },
    };
    state.channels.push(ch);
    return ch;
  },
  getChannels() {
    return state.channels.filter((c) => !c.tornDown);
  },
  removeChannel(ch: IFakeChannel) {
    return new Promise<string>((resolve) => {
      state.removals.push({
        channel: ch,
        resolve: () => {
          ch.tornDown = true;
          resolve("ok");
        },
      });
    });
  },
}));

vi.mock("./supabase", () => ({
  getSupabaseClient: () => fakeClient,
}));

import {
  __resetPresenceChannelsForTests,
  acquirePresenceChannel,
  releasePresenceChannel,
} from "./presenceChannel";

const TOPIC = "presence:store:store-1";

/** Waits for queued microtasks AND the manager's deferring setTimeout(0). */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Drives the fake channel to SUBSCRIBED, like a real join would. */
function joinChannel(ch: IFakeChannel): void {
  ch.statusCallback?.("SUBSCRIBED");
}

function channelAt(index: number): IFakeChannel {
  const channel = state.channels[index];
  if (!channel) throw new Error(`no fake channel at index ${index}`);
  return channel;
}

beforeEach(() => {
  state.channels.length = 0;
  state.removals.length = 0;
  __resetPresenceChannelsForTests();
});

describe("presence channel manager", () => {
  it("joins the exact logical topic so every browser lands in the same channel", () => {
    acquirePresenceChannel(TOPIC);

    // A per-tab suffix here would isolate each browser: presence is grouped by
    // wire topic, so two tabs on different topics never see each other.
    expect(channelAt(0).topic).toBe(`realtime:${TOPIC}`);
    expect(state.channels).toHaveLength(1);
  });

  it("reuses one channel across concurrent consumers of the same topic", () => {
    const a = acquirePresenceChannel(TOPIC);
    const b = acquirePresenceChannel(TOPIC);

    expect(a).toBe(b);
    expect(state.channels).toHaveLength(1);
    expect(channelAt(0).subscribeCalls).toBe(1);
  });

  it("re-joins the same stable topic after a full release cycle", async () => {
    acquirePresenceChannel(TOPIC);
    releasePresenceChannel(TOPIC);
    await flushAsync();
    state.removals[0]?.resolve();
    await flushAsync();

    acquirePresenceChannel(TOPIC);
    await flushAsync();

    expect(state.channels).toHaveLength(2);
    expect(channelAt(1).topic).toBe(`realtime:${TOPIC}`);
  });

  it("defers the re-create until the previous channel finished leaving", async () => {
    acquirePresenceChannel(TOPIC);
    releasePresenceChannel(TOPIC);
    await flushAsync(); // removal now in flight, not settled

    acquirePresenceChannel(TOPIC);
    await flushAsync();

    // Creating now would hit supabase-js' dedupe-by-topic and hand back the
    // channel still mid-leave, whose subscribe() silently no-ops.
    expect(state.channels).toHaveLength(1);

    state.removals[0]?.resolve();
    await flushAsync();

    expect(state.channels).toHaveLength(2);
    expect(channelAt(1).subscribeCalls).toBe(1);
  });

  it("announces the tracked payload on the live channel once joined", () => {
    const entry = acquirePresenceChannel(TOPIC);
    entry.joinListeners.add(() => entry.track({ sellerId: "seller-1" }));

    joinChannel(channelAt(0));

    expect(entry.joined).toBe(true);
    expect(channelAt(0).tracked).toEqual([{ sellerId: "seller-1" }]);

    entry.untrack();
    expect(channelAt(0).untrackCalls).toBe(1);
  });

  it("reads presence from the live channel and stays empty while it is pending", async () => {
    const first = acquirePresenceChannel(TOPIC);
    channelAt(0).presence = { "key-1": [{ sellerId: "seller-1" }] };
    expect(first.presenceState()).toEqual({ "key-1": [{ sellerId: "seller-1" }] });

    releasePresenceChannel(TOPIC);
    await flushAsync();

    // Re-acquired while the previous channel is still leaving: no live channel
    // yet, so the reader must see an empty map instead of throwing.
    const second = acquirePresenceChannel(TOPIC);
    expect(second.presenceState()).toEqual({});

    state.removals[0]?.resolve();
    await flushAsync();
    channelAt(1).presence = { "key-2": [{ sellerId: "seller-2" }] };
    expect(second.presenceState()).toEqual({ "key-2": [{ sellerId: "seller-2" }] });
  });

  it("re-syncs readers when the deferred channel finally joins", async () => {
    acquirePresenceChannel(TOPIC);
    releasePresenceChannel(TOPIC);
    await flushAsync();

    const entry = acquirePresenceChannel(TOPIC);
    let syncs = 0;
    entry.syncListeners.add(() => {
      syncs += 1;
    });

    state.removals[0]?.resolve();
    await flushAsync();
    joinChannel(channelAt(1));
    channelAt(1).syncHandler?.();

    expect(syncs).toBeGreaterThan(0);
  });
});
