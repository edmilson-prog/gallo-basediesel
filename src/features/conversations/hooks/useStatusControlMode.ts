import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_STATUS_CONTROL_MODE,
  normalizeStatusControlMode,
  type StatusControlMode,
} from "../engine/statusControlMode";

/** Per-device preference, like the inbox column widths / environment override. */
const STORAGE_KEY = "gallo-conversation-status-control-mode";

function readStored(): StatusControlMode {
  if (typeof window === "undefined") return DEFAULT_STATUS_CONTROL_MODE;
  try {
    return normalizeStatusControlMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_STATUS_CONTROL_MODE;
  }
}

export function useStatusControlMode(): {
  mode: StatusControlMode;
  setMode: (mode: StatusControlMode) => void;
} {
  const [mode, setModeState] = useState<StatusControlMode>(readStored);

  // Re-read once on mount in case SSR/first paint used the default.
  useEffect(() => {
    setModeState(readStored());
  }, []);

  const setMode = useCallback((next: StatusControlMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode) — keep in-memory value */
    }
  }, []);

  return { mode, setMode };
}
