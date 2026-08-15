/**
 * Capture of the browser's install offer, outside React's lifecycle.
 *
 * Chromium fires `beforeinstallprompt` **once** per document load, and only
 * after it has judged the page installable — which it cannot do before the
 * service worker registers, and `main.tsx` defers that to `window.load`.
 * Measured on a throttled phone profile: the event lands ~1s after load.
 *
 * A listener that lives inside a React component therefore only hears the
 * event when that component happens to be mounted at that exact instant, and
 * the browser never fires it again. Whoever lands on the login screen, or
 * opens a conversation straight from a push notification, loses the only
 * chance to install for the rest of that page load — and a component that
 * mounts later starts with an empty `useState`, so the app concludes the
 * browser never offered anything.
 *
 * So the listener is installed from `main.tsx`, at module scope, before any
 * route mounts, and what it caught is kept here for whoever asks afterwards.
 */

/** The non-standard event Chromium fires when the app qualifies for install. */
export interface IInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The two installable apps that share this origin. */
export const APP_SCOPES = ["/atendimento", "/pwa"] as const;
export type AppScope = (typeof APP_SCOPES)[number];

/** Where witnessed installs are remembered. See `rememberInstall` below. */
export const INSTALLED_SCOPES_KEY = "gallo-pwa-installed-scopes";

export interface IInstallState {
  /** The deferred offer, or null while the browser has not made one. */
  readonly prompt: IInstallPromptEvent | null;
  /** Apps we have witnessed being installed on this device. */
  readonly installedScopes: readonly AppScope[];
}

const EMPTY_STATE: IInstallState = { prompt: null, installedScopes: [] };

let deferredPrompt: IInstallPromptEvent | null = null;
let installedScopes: AppScope[] = [];
let snapshot: IInstallState = EMPTY_STATE;
const subscribers = new Set<() => void>();

function publish(): void {
  // A fresh object per change: `useSyncExternalStore` compares by identity.
  snapshot = { prompt: deferredPrompt, installedScopes: [...installedScopes] };
  for (const notify of subscribers) notify();
}

/** Which app a path belongs to — `null` for the rest of the CRM. */
export function scopeForPath(pathname: string): AppScope | null {
  return APP_SCOPES.find((scope) => pathname.startsWith(scope)) ?? null;
}

interface IStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function readScopes(storage: IStorageLike): AppScope[] {
  try {
    const raw = storage.getItem(INSTALLED_SCOPES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return APP_SCOPES.filter((scope) => parsed.includes(scope));
  } catch {
    // Unreadable or corrupt: behave as if nothing was ever installed.
    return [];
  }
}

function writeScopes(storage: IStorageLike, scopes: readonly AppScope[]): void {
  try {
    storage.setItem(INSTALLED_SCOPES_KEY, JSON.stringify(scopes));
  } catch {
    // Private mode or a full quota — the app still works, it just forgets.
  }
}

export interface IInstallCaptureOptions {
  target?: EventTarget;
  storage?: IStorageLike;
  /** Path of the tab at install time — see `rememberInstall`. */
  currentPath?: () => string;
}

let dispose: (() => void) | null = null;

/**
 * Starts listening. Idempotent; returns a disposer (used by the tests).
 *
 * `appinstalled` does not say *which* of the two apps was installed, but it
 * always fires in the tab the user installed from — so the tab's path is the
 * answer. Remembering it is what lets the account sheet stop claiming "not
 * installed" forever: `display-mode: standalone` is only ever true in the
 * window opened from the home screen, so a browser tab of an installed app
 * reports exactly the same as a browser tab of an app nobody ever installed.
 */
export function initInstallPromptCapture(options: IInstallCaptureOptions = {}): () => void {
  if (dispose) return dispose;

  const target = options.target ?? (typeof window === "undefined" ? null : window);
  if (!target) return () => {};

  const storage =
    options.storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  const currentPath =
    options.currentPath ?? (() => (typeof window === "undefined" ? "" : window.location.pathname));

  if (storage) installedScopes = readScopes(storage);

  const onBeforeInstall = (event: Event) => {
    // Suppress the browser's own automatic offer, because the app now has a
    // durable one of its own: this store outlives every route change, so the
    // in-app button cannot vanish the way the old per-component state did.
    event.preventDefault();
    deferredPrompt = event as IInstallPromptEvent;
    publish();
  };

  const onInstalled = () => {
    deferredPrompt = null;
    const scope = scopeForPath(currentPath());
    if (scope && !installedScopes.includes(scope)) {
      installedScopes = [...installedScopes, scope];
      if (storage) writeScopes(storage, installedScopes);
    }
    publish();
  };

  target.addEventListener("beforeinstallprompt", onBeforeInstall);
  target.addEventListener("appinstalled", onInstalled);
  publish();

  dispose = () => {
    target.removeEventListener("beforeinstallprompt", onBeforeInstall);
    target.removeEventListener("appinstalled", onInstalled);
    deferredPrompt = null;
    installedScopes = [];
    snapshot = EMPTY_STATE;
    subscribers.clear();
    dispose = null;
  };
  return dispose;
}

export function getInstallState(): IInstallState {
  return snapshot;
}

export function subscribeInstallState(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** A deferred offer is single-use, accepted or not. */
export function consumeInstallPrompt(): void {
  if (!deferredPrompt) return;
  deferredPrompt = null;
  publish();
}
