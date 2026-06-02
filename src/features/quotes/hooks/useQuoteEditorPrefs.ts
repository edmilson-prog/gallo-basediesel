// src/features/quotes/hooks/useQuoteEditorPrefs.ts
import { useCallback, useState } from "react";
import {
  DEFAULT_QUOTE_EDITOR_PREFS,
  type IQuoteEditorPrefs,
  type QuoteAddMode,
  type QuoteLayout,
} from "../types/editor";

const STORAGE_KEY = "gallo-quote-editor-prefs";
const LAYOUTS: QuoteLayout[] = ["twoCol", "full", "footerBar"];
const ADD_MODES: QuoteAddMode[] = ["continuous", "catalog", "quick"];

function readPrefs(): IQuoteEditorPrefs {
  if (typeof window === "undefined") return DEFAULT_QUOTE_EDITOR_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUOTE_EDITOR_PREFS;
    const parsed = JSON.parse(raw) as Partial<IQuoteEditorPrefs>;
    return {
      layout: LAYOUTS.includes(parsed.layout as QuoteLayout)
        ? (parsed.layout as QuoteLayout)
        : DEFAULT_QUOTE_EDITOR_PREFS.layout,
      addMode: ADD_MODES.includes(parsed.addMode as QuoteAddMode)
        ? (parsed.addMode as QuoteAddMode)
        : DEFAULT_QUOTE_EDITOR_PREFS.addMode,
    };
  } catch {
    return DEFAULT_QUOTE_EDITOR_PREFS;
  }
}

export interface IUseQuoteEditorPrefs extends IQuoteEditorPrefs {
  setLayout: (layout: QuoteLayout) => void;
  setAddMode: (addMode: QuoteAddMode) => void;
}

/** Persisted quote-editor preferences (layout + add mode) for the current seller. */
export function useQuoteEditorPrefs(): IUseQuoteEditorPrefs {
  const [prefs, setPrefs] = useState<IQuoteEditorPrefs>(readPrefs);

  const persist = useCallback((next: IQuoteEditorPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage indisponível — preferência só em memória nesta sessão.
    }
  }, []);

  const setLayout = useCallback(
    (layout: QuoteLayout) => persist({ ...readPrefs(), layout }),
    [persist],
  );
  const setAddMode = useCallback(
    (addMode: QuoteAddMode) => persist({ ...readPrefs(), addMode }),
    [persist],
  );

  return { ...prefs, setLayout, setAddMode };
}
