import { useCallback, useEffect, useState } from "react";
import type { ID } from "@/shared/types";

const LOCAL_STORAGE_KEY = "gallo-last-conversation-id";

/**
 * Persist and recover the last conversation the user opened.
 *
 * Useful for "resume where you left off" hand-offs (e.g. the seller closes
 * the tab and reopens the next morning — the same conversation reopens).
 * Stores only the id; nothing identifying about the conversation itself.
 */
export function useLastSelectedConversation(): {
  lastId: ID | null;
  setLastId: (id: ID | null) => void;
} {
  const [lastId, setLastIdState] = useState<ID | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(LOCAL_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setLastId = useCallback((id: ID | null) => {
    setLastIdState(id);
    if (typeof window === "undefined") return;
    try {
      if (id === null) window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      else window.localStorage.setItem(LOCAL_STORAGE_KEY, id);
    } catch {
      // localStorage unavailable — keep state in memory only.
    }
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== LOCAL_STORAGE_KEY) return;
      setLastIdState(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { lastId, setLastId };
}
