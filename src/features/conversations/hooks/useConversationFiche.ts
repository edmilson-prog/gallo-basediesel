import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gallo-conversation-fiche-open";

/**
 * Persistent toggle for the customer fiche column.
 *
 * Owned by the conversation viewer: the header's "Ficha" button drives it and
 * the state is mirrored through localStorage so the user's preference survives
 * navigation between conversations. (`ConversationLayout` no longer renders a
 * fiche slot of its own.)
 *
 * The actual fiche column is delivered by PRD-012 (`CustomerProfileFiche`).
 */
export function useConversationFiche() {
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
