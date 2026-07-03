import { useCallback, useState } from "react";
import { LOCALSTORAGE_KEYS } from "@/config/themes";
import { parsePartLookupLayout, type PartLookupLayout } from "../engine/partLookupLayout";

export function usePartLookupLayout() {
  const [layout, setLayoutState] = useState<PartLookupLayout>(() =>
    parsePartLookupLayout(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(LOCALSTORAGE_KEYS.partLookupLayout),
    ),
  );

  const setLayout = useCallback((next: PartLookupLayout) => {
    setLayoutState(next);
    try {
      window.localStorage.setItem(LOCALSTORAGE_KEYS.partLookupLayout, next);
    } catch {
      /* storage unavailable — keep in-memory value */
    }
  }, []);

  return { layout, setLayout };
}
