import { useCallback, useState } from "react";
import type { KitUxMode } from "../types";

const STORAGE_KEY = "gallo-kit-ux";
const MODES: KitUxMode[] = ["page", "dialog", "drawer"];
const DEFAULT_MODE: KitUxMode = "page";

function readMode(): KitUxMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return MODES.includes(raw as KitUxMode) ? (raw as KitUxMode) : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export interface IUseServiceKitFormPrefs {
  uxMode: KitUxMode;
  setUxMode: (mode: KitUxMode) => void;
}

/** Persisted choice of which UX shell hosts the kit form (page/dialog/drawer). */
export function useServiceKitFormPrefs(): IUseServiceKitFormPrefs {
  const [uxMode, setMode] = useState<KitUxMode>(readMode);
  const setUxMode = useCallback((mode: KitUxMode) => {
    setMode(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage indisponível — preferência só em memória nesta sessão.
    }
  }, []);
  return { uxMode, setUxMode };
}
