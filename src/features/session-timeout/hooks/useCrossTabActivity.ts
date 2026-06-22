import { useCallback, useEffect, useRef } from "react";

const CHANNEL_NAME = "gallo-session-activity";
const LS_KEY = "gallo-session-activity-ts";

/**
 * Cross-tab activity sync. Publishes/receives the latest activity timestamp via
 * BroadcastChannel (fallback: localStorage `storage` event). Logout only fires
 * when every tab is idle — the orchestrator keeps the MAX timestamp seen.
 */
export function useCrossTabActivity(
  onRemoteActivity: (ts: number) => void,
  enabled: boolean,
): { publish: (ts: number) => void } {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e: MessageEvent) => {
        if (typeof e.data === "number") onRemoteActivity(e.data);
      };
      channelRef.current = channel;
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        const ts = Number(e.newValue);
        if (Number.isFinite(ts)) onRemoteActivity(ts);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      channelRef.current = null;
    };
  }, [onRemoteActivity, enabled]);

  const publish = useCallback((ts: number) => {
    channelRef.current?.postMessage(ts);
    try {
      window.localStorage.setItem(LS_KEY, String(ts));
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }, []);

  return { publish };
}
