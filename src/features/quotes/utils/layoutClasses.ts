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
  /** When true, the summary should render as a sticky bottom bar (footerBar). */
  summaryAsFooterBar: boolean;
  /** When true, the summary lives in the full-height right rail with its own send bar. */
  summaryAsRail: boolean;
  /** When true, the items table takes the remaining height and scrolls internally. */
  itemsGrow: boolean;
}

/**
 * Tailwind classes per layout. All use the full available width.
 *
 * - twoCol: on lg+ the page height is pinned to the viewport — the items table
 *   scrolls inside itself and the summary rail owns its own scroll + send bar.
 *   Below lg the height is released and everything stacks in normal flow.
 * - full: single column, summary inline at the end, page scrolls.
 * - footerBar: single column body, summary rendered as a fixed footer bar.
 */
export function quoteLayoutClasses(layout: QuoteLayout): IQuoteLayoutClasses {
  switch (layout) {
    case "twoCol":
      return {
        root: "flex min-h-0 flex-col bg-background lg:h-[calc(100vh-6rem-var(--shell-banner-offset,0px))] lg:overflow-hidden",
        grid: "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_364px]",
        body: "flex min-h-0 min-w-0 flex-col gap-3 p-3 md:p-4 lg:overflow-hidden",
        summary:
          "flex min-h-0 flex-col border-t border-border bg-card/40 lg:border-l lg:border-t-0",
        summaryAsFooterBar: false,
        summaryAsRail: true,
        itemsGrow: true,
      };
    case "full":
      return {
        root: "flex flex-col bg-background",
        grid: "grid grid-cols-1",
        body: "flex min-w-0 flex-col gap-3 p-3 md:p-4",
        summary: "",
        summaryAsFooterBar: false,
        summaryAsRail: false,
        itemsGrow: false,
      };
    case "footerBar":
      return {
        root: "flex flex-col bg-background",
        grid: "grid grid-cols-1",
        body: "flex min-w-0 flex-col gap-3 p-3 pb-40 md:p-4 md:pb-36",
        summary:
          "fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:bottom-8",
        summaryAsFooterBar: true,
        summaryAsRail: false,
        itemsGrow: false,
      };
    default:
      return quoteLayoutClasses("twoCol");
  }
}
