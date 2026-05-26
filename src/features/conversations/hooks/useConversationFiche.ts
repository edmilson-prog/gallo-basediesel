import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gallo-conversation-fiche-open";

/**
 * Persistent toggle for the customer fiche column.
 *
 * Lives next to the conversation viewer because the layout (`ConversationLayout`)
 * still owns its own internal toggle, while the header inside the viewer needs
 * a parallel control mirrored through localStorage so the user's preference
 * survives navigation between conversations.
 *
 * The actual fiche column is delivered by PRD-012; for now the toggle just
 * records intent and lets the header reflect the current state.
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
