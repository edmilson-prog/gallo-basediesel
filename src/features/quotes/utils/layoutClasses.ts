// src/features/quotes/utils/layoutClasses.ts
import type { QuoteLayout } from "../types/editor";

export interface IQuoteLayoutClasses {
  /** Outer container. */
  root: string;
  /** Wrapper holding body + summary. */
  grid: string;
  /** Main body column. */
  body: string;
  /** Summary container. */
  summary: string;
  /** When true, the summary should render as a sticky bottom bar (footerBar / mobile). */
  summaryAsFooterBar: boolean;
}

/**
 * Tailwind classes per layout. All use full available width (no max-w-5xl).
 * - twoCol: body (2fr) + sticky summary rail (1fr) on lg+; stacks below lg.
 * - full: single column, summary inline at the end.
 * - footerBar: single column body, summary rendered as sticky footer bar.
 */
export function quoteLayoutClasses(layout: QuoteLayout): IQuoteLayoutClasses {
  switch (layout) {
    case "twoCol":
      return {
        root: "w-full p-4 md:p-6",
        grid: "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]",
        body: "min-w-0 space-y-6",
        summary: "lg:sticky lg:top-20 lg:self-start",
        summaryAsFooterBar: false,
      };
    case "full":
      return {
        root: "w-full p-4 md:p-6",
        grid: "grid grid-cols-1 gap-6",
        body: "min-w-0 space-y-6",
        summary: "",
        summaryAsFooterBar: false,
      };
    case "footerBar":
      return {
        root: "w-full p-4 pb-24 md:p-6 md:pb-24",
        grid: "grid grid-cols-1 gap-6",
        body: "min-w-0 space-y-6",
        summary:
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur",
        summaryAsFooterBar: true,
      };
    default:
      return quoteLayoutClasses("twoCol");
  }
}
