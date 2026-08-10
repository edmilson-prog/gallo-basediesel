// src/features/quotes/types/editor.ts
/** Layout composition of the quote editor page. */
export type QuoteLayout = "twoCol" | "full" | "footerBar";

/** Item-adding interaction mode. */
export type QuoteAddMode = "continuous" | "catalog" | "quick";

/** Table row density of the quote editor. */
export type QuoteDensity = "comfortable" | "compact";

/** Persisted per-seller editor preferences. */
export interface IQuoteEditorPrefs {
  layout: QuoteLayout;
  addMode: QuoteAddMode;
  density: QuoteDensity;
}

export const DEFAULT_QUOTE_EDITOR_PREFS: IQuoteEditorPrefs = {
  layout: "twoCol",
  addMode: "continuous",
  density: "comfortable",
};

export const QUOTE_LAYOUT_OPTIONS: ReadonlyArray<{
  value: QuoteLayout;
  label: string;
  icon: string;
  /** One-line description shown under the label in the display menu. */
  hint: string;
}> = [
  {
    value: "twoCol",
    label: "Duas colunas",
    icon: "mdi:view-split-vertical",
    hint: "resumo no trilho à direita",
  },
  {
    value: "full",
    label: "Largura cheia",
    icon: "mdi:view-sequential",
    hint: "resumo ao final da página",
  },
  {
    value: "footerBar",
    label: "Barra no rodapé",
    icon: "mdi:dock-bottom",
    hint: "resumo fixo embaixo",
  },
];

export const QUOTE_ADD_MODE_OPTIONS: ReadonlyArray<{
  value: QuoteAddMode;
  label: string;
  icon: string;
}> = [
  { value: "continuous", label: "Contínuo", icon: "mdi:playlist-plus" },
  { value: "catalog", label: "Catálogo", icon: "mdi:view-grid-plus-outline" },
  { value: "quick", label: "Rápido", icon: "mdi:keyboard-outline" },
];

export const QUOTE_DENSITY_OPTIONS: ReadonlyArray<{
  value: QuoteDensity;
  label: string;
  icon: string;
}> = [
  { value: "comfortable", label: "Conforto", icon: "mdi:format-line-spacing" },
  { value: "compact", label: "Compacto", icon: "mdi:view-headline" },
];
