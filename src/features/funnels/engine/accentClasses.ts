import type { FunnelAccent } from "@/shared/types";

export interface IFunnelAccentClasses {
  /** Solid 8px dot — non-textual, needs 3:1. */
  dot: string;
  /** Soft background for a chip whose TEXT is `text-foreground`, never the accent. */
  chip: string;
  /** 1–3px border / indicator bar. */
  border: string;
  /** Vertical or horizontal indicator bar (active item in nav). */
  bar: string;
  /**
   * Decorative icon glyph colour ONLY (`currentColor` on an icon ≥16px,
   * `aria-hidden`, always paired with a `text-foreground` label alongside it).
   * Never apply this to real text — icon glyphs are non-text content under
   * WCAG 1.4.11 (3:1 is sufficient), while text requires 4.5:1 (WCAG 1.4.3),
   * a bar this token does not guarantee.
   */
  icon: string;
}

export const FUNNEL_ACCENT_SLOTS: readonly FunnelAccent[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Literal class map. Tailwind v4 scans source for complete class names, so a
 * template-string class (`bg-funnel-${n}`) yields no CSS at all.
 */
const FUNNEL_CLASSES: Record<FunnelAccent, IFunnelAccentClasses> = {
  0: {
    dot: "bg-funnel-0",
    chip: "bg-muted",
    border: "border-funnel-0",
    bar: "bg-funnel-0",
    icon: "text-funnel-0",
  },
  1: {
    dot: "bg-funnel-1",
    chip: "bg-funnel-1/12",
    border: "border-funnel-1",
    bar: "bg-funnel-1",
    icon: "text-funnel-1",
  },
  2: {
    dot: "bg-funnel-2",
    chip: "bg-funnel-2/12",
    border: "border-funnel-2",
    bar: "bg-funnel-2",
    icon: "text-funnel-2",
  },
  3: {
    dot: "bg-funnel-3",
    chip: "bg-funnel-3/12",
    border: "border-funnel-3",
    bar: "bg-funnel-3",
    icon: "text-funnel-3",
  },
  4: {
    dot: "bg-funnel-4",
    chip: "bg-funnel-4/12",
    border: "border-funnel-4",
    bar: "bg-funnel-4",
    icon: "text-funnel-4",
  },
  5: {
    dot: "bg-funnel-5",
    chip: "bg-funnel-5/12",
    border: "border-funnel-5",
    bar: "bg-funnel-5",
    icon: "text-funnel-5",
  },
  6: {
    dot: "bg-funnel-6",
    chip: "bg-funnel-6/12",
    border: "border-funnel-6",
    bar: "bg-funnel-6",
    icon: "text-funnel-6",
  },
  7: {
    dot: "bg-funnel-7",
    chip: "bg-funnel-7/12",
    border: "border-funnel-7",
    bar: "bg-funnel-7",
    icon: "text-funnel-7",
  },
  8: {
    dot: "bg-funnel-8",
    chip: "bg-funnel-8/12",
    border: "border-funnel-8",
    bar: "bg-funnel-8",
    icon: "text-funnel-8",
  },
};

/**
 * Null-safe slot lookup. `accent` arrives from the database, from migrations and
 * from import scripts that this build's type system cannot police — an unknown
 * value must degrade to neutral, never render `undefined` into `cn()`.
 */
export function getAccentClasses(accent: number): IFunnelAccentClasses {
  return FUNNEL_CLASSES[accent as FunnelAccent] ?? FUNNEL_CLASSES[0];
}
