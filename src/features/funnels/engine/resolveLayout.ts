/**
 * Viewport- and count-driven degradation of the funnel navigation pattern.
 *
 * This is a READ-TIME projection. It never writes back to the stored
 * preference: overwriting someone's choice because they rotated a tablet is
 * how you lose their trust in configuring anything at all. The preference
 * returns on its own when the window grows again.
 */
export const FUNNEL_LAYOUTS = ["rail", "header", "tabs"] as const;
export type FunnelLayout = (typeof FUNNEL_LAYOUTS)[number];

/** Only pattern that works at every width and every funnel count. */
export const DEFAULT_FUNNEL_LAYOUT: FunnelLayout = "header";

/** Below this the rail does not fit, and tabs would nest two horizontal scrolls. */
const RAIL_MIN_WIDTH = 1024;
/** Below this the rail fits only collapsed: 208px beside 288px columns is dear. */
const RAIL_EXPANDED_MIN_WIDTH = 1280;
/** At this many funnels the strip scrolls horizontally, stacked on the board's own scroll. */
const TABS_MAX_FUNNELS = 9;

export interface IResolveLayoutInput {
  preferred: FunnelLayout;
  width: number;
  funnelCount: number;
}

export interface IResolvedLayout {
  layout: FunnelLayout;
  /** Rail at 56px instead of 208px. Always false unless `layout === "rail"`. */
  railCollapsed: boolean;
  /** One funnel: the selector is a static label — a lone tab is noise. */
  staticLabel: boolean;
  /** No reachable funnel. Only possible for non-staff, and impossible in v1. */
  isEmpty: boolean;
}

export function resolveLayout({
  preferred,
  width,
  funnelCount,
}: IResolveLayoutInput): IResolvedLayout {
  const staticLabel = funnelCount === 1;
  const isEmpty = funnelCount === 0;

  if (width < RAIL_MIN_WIDTH) {
    return { layout: "header", railCollapsed: false, staticLabel, isEmpty };
  }

  // Only the tab strip degrades on count: it is the one pattern laid out along
  // the same axis the board already scrolls. The rail stacks vertically and
  // takes as many funnels as you like.
  if (preferred === "tabs" && funnelCount >= TABS_MAX_FUNNELS) {
    return { layout: "header", railCollapsed: false, staticLabel, isEmpty };
  }

  if (preferred === "rail") {
    return {
      layout: "rail",
      railCollapsed: width < RAIL_EXPANDED_MIN_WIDTH,
      staticLabel,
      isEmpty,
    };
  }

  return { layout: preferred, railCollapsed: false, staticLabel, isEmpty };
}
