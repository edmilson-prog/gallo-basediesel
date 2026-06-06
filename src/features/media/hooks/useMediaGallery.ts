// src/features/media/hooks/useMediaGallery.ts
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gallo-conversation-media-open";

/** Open/close state for the conversation media Sheet (mirrors useConversationFiche). */
export function useMediaGallery() {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(open));
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return { open, setOpen, toggle };
}
