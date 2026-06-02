// src/features/quotes/types/editor.ts
/** Layout composition of the quote editor page. */
export type QuoteLayout = "twoCol" | "full" | "footerBar";

/** Item-adding interaction mode. */
export type QuoteAddMode = "continuous" | "catalog" | "quick";

/** Persisted per-seller editor preferences. */
export interface IQuoteEditorPrefs {
  layout: QuoteLayout;
  addMode: QuoteAddMode;
}

export const DEFAULT_QUOTE_EDITOR_PREFS: IQuoteEditorPrefs = {
  layout: "twoCol",
  addMode: "continuous",
};

export const QUOTE_LAYOUT_OPTIONS: ReadonlyArray<{ value: QuoteLayout; label: string; icon: string }> = [
  { value: "twoCol", label: "2 colunas", icon: "mdi:view-split-vertical" },
  { value: "full", label: "Largura cheia", icon: "mdi:view-sequential" },
  { value: "footerBar", label: "Barra no rodapé", icon: "mdi:dock-bottom" },
];

export const QUOTE_ADD_MODE_OPTIONS: ReadonlyArray<{ value: QuoteAddMode; label: string; icon: string }> = [
  { value: "continuous", label: "Contínuo", icon: "mdi:playlist-plus" },
  { value: "catalog", label: "Catálogo", icon: "mdi:view-grid-plus-outline" },
  { value: "quick", label: "Rápido", icon: "mdi:keyboard-outline" },
];
