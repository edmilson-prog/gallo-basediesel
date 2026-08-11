import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSTALLED_SCOPES_KEY,
  consumeInstallPrompt,
  getInstallState,
  initInstallPromptCapture,
  scopeForPath,
  subscribeInstallState,
  type IInstallPromptEvent,
} from "./installPrompt";

function makeStorage(seed?: string) {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(INSTALLED_SCOPES_KEY, seed);
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    read: () => map.get(INSTALLED_SCOPES_KEY) ?? null,
  };
}

/** Stands in for the browser's non-standard event. */
function installPromptEvent(): Event {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, {
    prompt: () => Promise.resolve(),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  return event;
}

let stop: (() => void) | null = null;

function start(options: Parameters<typeof initInstallPromptCapture>[0] = {}) {
  const target = options.target ?? new EventTarget();
  stop = initInstallPromptCapture({ ...options, target });
  return target;
}

afterEach(() => {
  stop?.();
  stop = null;
});

describe("scopeForPath", () => {
  it("tells the two installable apps apart and ignores the rest of the CRM", () => {
    expect(scopeForPath("/atendimento")).toBe("/atendimento");
    expect(scopeForPath("/atendimento/conversa/42")).toBe("/atendimento");
    expect(scopeForPath("/pwa/carteira")).toBe("/pwa");
    expect(scopeForPath("/app/inbox")).toBeNull();
    expect(scopeForPath("/")).toBeNull();
  });
});

describe("initInstallPromptCapture", () => {
  it("keeps an offer made before anything subscribed", () => {
    // The regression this module exists for: the browser fires once, about a
    // second after load, and whoever mounts later used to get nothing.
    const target = start();
    target.dispatchEvent(installPromptEvent());

    const late = vi.fn();
    subscribeInstallState(late);

    expect(getInstallState().prompt).not.toBeNull();
  });

  it("suppresses the browser's automatic offer, since the app now has its own", () => {
    const target = start();
    const event = installPromptEvent();
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("notifies subscribers when an offer arrives", () => {
    const target = start();
    const notify = vi.fn();
    subscribeInstallState(notify);

    target.dispatchEvent(installPromptEvent());

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("hands out a new snapshot per change, so useSyncExternalStore sees it", () => {
    const target = start();
    const before = getInstallState();

    target.dispatchEvent(installPromptEvent());

    expect(getInstallState()).not.toBe(before);
  });

  it("stops notifying once a subscriber unsubscribes", () => {
    const target = start();
    const notify = vi.fn();
    subscribeInstallState(notify)();

    target.dispatchEvent(installPromptEvent());

    expect(notify).not.toHaveBeenCalled();
  });

  it("is idempotent — a second call does not double-register", () => {
    const target = start();
    const again = initInstallPromptCapture({ target });
    const notify = vi.fn();
    subscribeInstallState(notify);

    target.dispatchEvent(installPromptEvent());

    expect(again).toBe(stop);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("consumeInstallPrompt", () => {
  it("drops the offer, because a deferred prompt is single-use", () => {
    const target = start();
    target.dispatchEvent(installPromptEvent());

    consumeInstallPrompt();

    expect(getInstallState().prompt).toBeNull();
  });

  it("does nothing when there is no offer to drop", () => {
    start();
    const notify = vi.fn();
    subscribeInstallState(notify);

    consumeInstallPrompt();

    expect(notify).not.toHaveBeenCalled();
  });
});

describe("appinstalled", () => {
  it("remembers which app was installed, using the path of the tab it fired in", () => {
    const storage = makeStorage();
    const target = start({ storage, currentPath: () => "/atendimento/conversas" });

    target.dispatchEvent(new Event("appinstalled"));

    expect(getInstallState().installedScopes).toEqual(["/atendimento"]);
    expect(storage.read()).toBe(JSON.stringify(["/atendimento"]));
  });

  it("keeps the two apps apart", () => {
    const storage = makeStorage();
    const target = start({ storage, currentPath: () => "/pwa" });

    target.dispatchEvent(new Event("appinstalled"));

    expect(getInstallState().installedScopes).toEqual(["/pwa"]);
  });

  it("remembers nothing when it fires outside both apps", () => {
    const storage = makeStorage();
    const target = start({ storage, currentPath: () => "/app/inbox" });

    target.dispatchEvent(new Event("appinstalled"));

    expect(getInstallState().installedScopes).toEqual([]);
    expect(storage.read()).toBeNull();
  });

  it("clears the spent offer", () => {
    const target = start({ storage: makeStorage(), currentPath: () => "/atendimento" });
    target.dispatchEvent(installPromptEvent());

    target.dispatchEvent(new Event("appinstalled"));

    expect(getInstallState().prompt).toBeNull();
  });

  it("does not duplicate a scope already remembered", () => {
    const storage = makeStorage(JSON.stringify(["/atendimento"]));
    const target = start({ storage, currentPath: () => "/atendimento" });

    target.dispatchEvent(new Event("appinstalled"));

    expect(getInstallState().installedScopes).toEqual(["/atendimento"]);
  });
});

describe("seeding from storage", () => {
  it("starts out knowing what was installed on a previous visit", () => {
    // Without this, a browser tab of an installed app looks exactly like a tab
    // of an app nobody ever installed: `display-mode: standalone` is false in
    // both, so the account sheet would keep answering "no".
    start({ storage: makeStorage(JSON.stringify(["/atendimento"])) });

    expect(getInstallState().installedScopes).toEqual(["/atendimento"]);
  });

  it("ignores a corrupt marker instead of throwing on boot", () => {
    start({ storage: makeStorage("{not json") });

    expect(getInstallState().installedScopes).toEqual([]);
  });

  it("ignores values that are not known scopes", () => {
    start({ storage: makeStorage(JSON.stringify(["/etc/passwd", "/atendimento"])) });

    expect(getInstallState().installedScopes).toEqual(["/atendimento"]);
  });

  it("survives storage that throws, as private mode does", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const target = start({ storage: hostile, currentPath: () => "/atendimento" });

    expect(() => target.dispatchEvent(new Event("appinstalled"))).not.toThrow();
    expect(getInstallState().installedScopes).toEqual(["/atendimento"]);
  });
});

describe("typing", () => {
  it("exposes the event with the members the app calls", () => {
    const target = start();
    target.dispatchEvent(installPromptEvent());

    const offer = getInstallState().prompt as IInstallPromptEvent;

    expect(typeof offer.prompt).toBe("function");
    expect(offer.userChoice).toBeInstanceOf(Promise);
  });
});
