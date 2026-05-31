import { useCallback, useState } from "react";

export type NotificationLayout = "painel" | "lista";
const STORAGE_KEY = "gallo-notif-layout";

function readLayout(): NotificationLayout {
  if (typeof window === "undefined") return "painel";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "lista" || v === "painel" ? v : "painel";
}

/** UI-only layout preference (separate from the channel×category matrix). */
export function useNotificationLayout(): [NotificationLayout, (next: NotificationLayout) => void] {
  const [layout, setLayout] = useState<NotificationLayout>(readLayout);
  const update = useCallback((next: NotificationLayout) => {
    setLayout(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);
  return [layout, update];
}
