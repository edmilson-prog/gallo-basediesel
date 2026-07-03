import { useCallback, useState } from "react";
import { LOCALSTORAGE_KEYS } from "@/config/themes";
import { parseRecent, pushRecent } from "../engine/recentParts";

export function useRecentParts() {
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    parseRecent(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(LOCALSTORAGE_KEYS.partLookupRecent),
    ),
  );

  const remember = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = pushRecent(prev, id);
      try {
        window.localStorage.setItem(LOCALSTORAGE_KEYS.partLookupRecent, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { recentIds, remember };
}
