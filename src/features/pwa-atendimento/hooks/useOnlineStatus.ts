import { useCallback, useEffect, useState } from "react";

/**
 * Connection state as the device reports it.
 *
 * `navigator.onLine` only tells us whether the OS has a network interface up —
 * it lies about captive portals and dead uplinks. That is good enough for the
 * offline band, which is a hint ("your message will sit in the queue"), not a
 * guarantee; the send path still surfaces real failures on its own.
 */
export function useOnlineStatus(): { online: boolean; recheck: () => void } {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const recheck = useCallback(() => {
    setOnline(navigator.onLine);
  }, []);

  return { online, recheck };
}
