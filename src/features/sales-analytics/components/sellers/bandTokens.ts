import type { AttainmentBand } from "../../utils/sellerLeaderboard";

/** Tailwind background classes for a progress bar, keyed by attainment band. */
export const BAND_BAR: Record<AttainmentBand, string> = {
  success: "bg-success",
  warning: "bg-warning",
  below: "bg-destructive",
  none: "bg-muted-foreground/40",
};

/** Tailwind text-color classes keyed by attainment band. */
export const BAND_TEXT: Record<AttainmentBand, string> = {
  success: "text-success",
  warning: "text-warning",
  below: "text-destructive",
  none: "text-muted-foreground",
};
