import { useEffect, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

interface IUnsavedChangesState {
  /** True when an active form has unsaved edits. */
  dirty: boolean;
  /** Open if the user tried to navigate away while dirty. */
  promptOpen: boolean;
  /** Confirm discard and proceed with the pending navigation. */
  confirmDiscard: () => void;
  /** Cancel the pending navigation and stay on the current page. */
  cancel: () => void;
}

/**
 * Tracks whether the current settings sub-route has unsaved edits and blocks
 * router navigation with a confirmation modal until the user decides.
 *
 * PRD-019 RF-038 — "Você tem alterações não salvas. Continuar sem salvar?".
 */
export function useUnsavedChanges(dirty: boolean): IUnsavedChangesState {
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  // Browser beforeunload — guard hard reloads / tab close even when blocker is idle.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return {
    dirty,
    promptOpen: blocker.status === "blocked",
    confirmDiscard: () => {
      if (blocker.status === "blocked") {
        dirtyRef.current = false;
        blocker.proceed();
      }
    },
    cancel: () => {
      if (blocker.status === "blocked") blocker.reset();
    },
  };
}
