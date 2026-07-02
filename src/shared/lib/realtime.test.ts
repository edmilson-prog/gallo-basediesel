import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the shared Realtime channel manager (node env — no DOM, per
 * the project's testing convention), covering the fix for the "anon join" bug:
 *
 * postgres_changes claims are derived from the token present at JOIN time and
 * never re-evaluated by the server (a later `access_token` push is ignored for
 * CDC authorization). A join that races ahead of `auth.getSession()` is
 * therefore silently dead — `SUBSCRIBED`, zero events, zero errors. The manager
 * must (1) apply the session token to the socket BEFORE joining and (2) tear
 * down + re-join every live channel whenever the auth token changes.
 */

interface IFakeChannel {
  topic: string;
  eventHandler: ((payload: unknown) => void) | null;
  statusCallback: ((status: string) => void) | null;
  subscribeCalls: number;
  on: (type: string, filter: unknown, cb: (payload: unknown) => void) => IFakeChannel;
  subscribe: (cb?: (status: string) => void) => IFakeChannel;
}

const state = vi.hoisted(() => {
  const s = {
    channels: [] as IFakeChannel[],
    removedChannels: [] as IFakeChannel[],
    authResolvers: [] as Array<{ resolve: () => void; reject: (e: Error) => void }>,
    authStateCallback: null as
      | ((event: string, session: { access_token: string } | null) => void)
      | null,
    session: { access_token: "token-a" } as { access_token: string } | null,
  };
  return s;
});

const fakeClient = vi.hoisted(() => ({
  channel(topic: string) {
    const ch: IFakeChannel = {
      topic,
      eventHandler: null,
      statusCallback: null,
      subscribeCalls: 0,
      on(_type: string, _filter: unknown, cb: (payload: unknown) => void) {
        ch.eventHandler = cb;
        return ch;
      },
      subscribe(cb?: (status: string) => void) {
        ch.subscribeCalls += 1;
        ch.statusCallback = cb ?? null;
        return ch;
      },
    };
    state.channels.push(ch);
    return ch;
  },
  removeChannel(ch: IFakeChannel) {
    state.removedChannels.push(ch);
    return Promise.resolve("ok");
  },
  realtime: {
    setAuth: () =>
      new Promise<void>((resolve, reject) => {
        state.authResolvers.push({ resolve, reject: (e: Error) => reject(e) });
      }),
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session: state.session } }),
    onAuthStateChange(cb: (event: string, session: { access_token: string } | null) => void) {
      state.authStateCallback = cb;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  },
}));

vi.mock("./supabase", () => ({
  getSupabaseClient: () => fakeClient,
}));

import { __resetRealtimeForTests, subscribeToTable } from "./realtime";

/** Resolves every pending `realtime.setAuth()` and lets microtasks settle. */
async function flushAuth(): Promise<void> {
  for (const pending of state.authResolvers.splice(0)) pending.resolve();
  await flushAsync();
}

/** Rejects every pending `realtime.setAuth()` and lets microtasks settle. */
async function flushAuthWithError(): Promise<void> {
  for (const pending of state.authResolvers.splice(0)) pending.reject(new Error("boom"));
  await flushAsync();
}

/** Waits for queued microtasks AND the watcher's deferring setTimeout(0). */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Emits an auth state change and waits for the (deferred) re-join sweep. */
async function emitAuthChange(token: string | null): Promise<void> {
  state.session = token === null ? null : { access_token: token };
  state.authStateCallback?.("TOKEN_REFRESHED", state.session);
  await flushAsync();
}

beforeEach(() => {
  __resetRealtimeForTests();
  state.channels.length = 0;
  state.removedChannels.length = 0;
  state.authResolvers.length = 0;
  state.authStateCallback = null;
  state.session = { access_token: "token-a" };
});

describe("subscribeToTable — join waits for the auth token", () => {
  it("does not join until realtime.setAuth resolves", async () => {
    subscribeToTable("conversations", () => {});
    expect(state.channels).toHaveLength(1);
    expect(state.channels[0].subscribeCalls).toBe(0);

    await flushAuth();
    expect(state.channels[0].subscribeCalls).toBe(1);
  });

  it("still joins (best-effort) when setAuth rejects", async () => {
    subscribeToTable("conversations", () => {});
    await flushAuthWithError();
    expect(state.channels[0].subscribeCalls).toBe(1);
  });

  it("cancels the pending join when the last subscriber leaves first", async () => {
    const off = subscribeToTable("conversations", () => {});
    off();
    await flushAuth();

    expect(state.channels[0].subscribeCalls).toBe(0);
    expect(state.removedChannels).toContain(state.channels[0]);
  });
});

describe("subscribeToTable — shared ref-counted channel", () => {
  it("shares one channel across subscribers and fans events out to all", async () => {
    const seenA: unknown[] = [];
    const seenB: unknown[] = [];
    const offA = subscribeToTable("conversations", (p) => seenA.push(p));
    const offB = subscribeToTable("conversations", (p) => seenB.push(p));
    await flushAuth();

    expect(state.channels).toHaveLength(1);
    state.channels[0].eventHandler?.({ eventType: "UPDATE" });
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);

    offA();
    expect(state.removedChannels).toHaveLength(0);
    offB();
    expect(state.removedChannels).toContain(state.channels[0]);
  });

  it("notifies status listeners with the snapshot immediately and SUBSCRIBED later", async () => {
    const statuses: boolean[] = [];
    subscribeToTable("conversations", () => {}, (ok) => statuses.push(ok));
    expect(statuses).toEqual([false]);

    await flushAuth();
    state.channels[0].statusCallback?.("SUBSCRIBED");
    expect(statuses).toEqual([false, true]);
  });
});

describe("subscribeToTable — re-join on auth token change", () => {
  it("tears down and re-joins with a fresh channel when the token changes", async () => {
    const seen: unknown[] = [];
    subscribeToTable("conversations", (p) => seen.push(p));
    await flushAuth();
    state.channels[0].statusCallback?.("SUBSCRIBED");

    await emitAuthChange("token-b");
    await flushAuth();

    expect(state.removedChannels).toContain(state.channels[0]);
    expect(state.channels).toHaveLength(2);
    expect(state.channels[1].subscribeCalls).toBe(1);

    // Listeners stay wired to the replacement channel.
    state.channels[1].eventHandler?.({ eventType: "INSERT" });
    expect(seen).toHaveLength(1);
  });

  it("never reuses a channel topic across re-creations", async () => {
    subscribeToTable("conversations", () => {});
    await flushAuth();
    await emitAuthChange("token-b");
    await flushAuth();

    expect(state.channels).toHaveLength(2);
    expect(state.channels[1].topic).not.toBe(state.channels[0].topic);
  });

  it("ignores auth events whose token matches the one used at join", async () => {
    subscribeToTable("conversations", () => {});
    await flushAuth();

    await emitAuthChange("token-a");

    expect(state.removedChannels).toHaveLength(0);
    expect(state.channels).toHaveLength(1);
  });

  it("re-joins across a sign-out (token → null) and back in", async () => {
    subscribeToTable("conversations", () => {});
    await flushAuth();

    await emitAuthChange(null);
    await flushAuth();
    expect(state.channels).toHaveLength(2);

    await emitAuthChange("token-c");
    await flushAuth();
    expect(state.channels).toHaveLength(3);
    expect(state.channels[2].subscribeCalls).toBe(1);
  });

  it("surfaces the drop to status listeners and reports SUBSCRIBED after the re-join", async () => {
    const statuses: boolean[] = [];
    subscribeToTable("conversations", () => {}, (ok) => statuses.push(ok));
    await flushAuth();
    state.channels[0].statusCallback?.("SUBSCRIBED");
    expect(statuses).toEqual([false, true]);

    await emitAuthChange("token-b");
    await flushAuth();
    state.channels[1].statusCallback?.("SUBSCRIBED");

    expect(statuses).toEqual([false, true, false, true]);
  });

  it("a stale in-flight join aborted by the re-join never subscribes its channel", async () => {
    subscribeToTable("conversations", () => {});
    // Token changes BEFORE the first join's setAuth resolves.
    await emitAuthChange("token-b");
    await flushAuth();

    expect(state.channels[0].subscribeCalls).toBe(0);
    expect(state.channels[1].subscribeCalls).toBe(1);
  });
});
