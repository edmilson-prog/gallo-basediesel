export type TourKey = string;
export type TourSide = "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** data-tour id of the target element; absent => centered step. */
  target?: string;
  /** Iconify name (mdi:*). */
  icon: string;
  title: string;
  body: string;
  /** Preferred side for the popover relative to the target. Default "auto" (bottom-first). */
  placement?: TourSide;
}

export interface TourDef {
  key: TourKey;
  kind: "rich" | "welcome";
  /** Display name in the tours settings hub. */
  label: string;
  /** Exact pathname that auto-starts this tour (welcome + inbox). */
  route?: string;
  /** Prefix match for dynamic routes (e.g. "/app/atendimento/"). Checked after exact. */
  matchPrefix?: string;
  /** welcome => exactly one step. */
  steps: TourStep[];
}
