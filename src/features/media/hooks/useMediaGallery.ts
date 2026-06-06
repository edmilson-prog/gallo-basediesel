// src/features/media/hooks/useMediaGallery.ts
import { useCallback, useState } from "react";

/** Open/close state for the conversation media Sheet (mirrors useConversationFiche). */
export function useMediaGallery() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { open, setOpen, toggle };
}
