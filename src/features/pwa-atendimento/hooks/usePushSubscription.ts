import { useCallback, useEffect, useState } from "react";
import { getActiveDataSource } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { captureObservabilityException } from "@/shared/lib/observability";

/**
 * Base64url → bytes, the shape `pushManager.subscribe` wants for the key.
 *
 * Backed by an explicit `ArrayBuffer` so the result is a `BufferSource` the DOM
 * types accept — a bare `new Uint8Array(n)` widens to `ArrayBufferLike`.
 */
function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function readPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

export interface IUsePushSubscriptionResult {
  /** The browser's permission state, kept in sync after each request. */
  permission: NotificationPermission;
  /** False when the browser has no Push API or no service worker. */
  isSupported: boolean;
  /** True once this device has a subscription registered on the server. */
  isSubscribed: boolean;
  /** Asks for permission (must be called from a user gesture) and registers the
   *  endpoint. Resolves true only when the device is subscribed afterwards. */
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

/**
 * Web Push registration for this device.
 *
 * `requestPermission` is only ever called from here, and this is only ever
 * called from a tap — a permission prompt fired on load has roughly a one-in-ten
 * acceptance rate and the browser's "Block" cannot be taken back.
 */
export function usePushSubscription(): IUsePushSubscriptionResult {
  const [permission, setPermission] = useState<NotificationPermission>(readPermission);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined";

  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setIsSubscribed(subscription !== null);
      })
      .catch(() => {
        if (!cancelled) setIsSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      // Nothing to subscribe to yet: the key lands with the deploy. Ask for
      // permission anyway so the OS-level answer is captured.
      const granted = await Notification.requestPermission();
      setPermission(granted);
      return false;
    }

    const granted = await Notification.requestPermission();
    setPermission(granted);
    if (granted !== "granted") return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(vapidKey),
        }));

      // Mock mode has no table to write to; the browser-side registration is
      // still useful for testing the SW handlers locally.
      if (getActiveDataSource() !== "supabase") {
        setIsSubscribed(true);
        return true;
      }

      const client = getSupabaseClient();
      const { data: auth } = await client.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return false;

      const { error } = await client.from("push_subscriptions").upsert(
        {
          recipient_id: userId,
          recipient_type: "seller",
          endpoint: subscription.endpoint,
          p256dh: arrayBufferToBase64(subscription.getKey("p256dh")),
          auth: arrayBufferToBase64(subscription.getKey("auth")),
          user_agent: navigator.userAgent.slice(0, 400),
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);

      setIsSubscribed(true);
      return true;
    } catch (error) {
      captureObservabilityException(error, { feature: "pwa-atendimento.push.subscribe" });
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (getActiveDataSource() === "supabase") {
        await getSupabaseClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setIsSubscribed(false);
    } catch (error) {
      captureObservabilityException(error, { feature: "pwa-atendimento.push.unsubscribe" });
    }
  }, [isSupported]);

  return { permission, isSupported, isSubscribed, subscribe, unsubscribe };
}
