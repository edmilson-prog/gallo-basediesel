/**
 * Tone lookups and the two small helpers the NPS components share.
 *
 * Kept out of `NpsKit.tsx` so that file exports components and nothing else —
 * a module that mixes the two breaks Fast Refresh, and the whole tab reloads
 * on every edit instead of the component that changed.
 *
 * Every entry is a complete class string. Tailwind scans source text, so a
 * class assembled at runtime (`text-${tone}`) is never generated and the colour
 * silently disappears in the production build — a failure that only surfaces
 * after deploy.
 */

export type INpsTone = "primary" | "success" | "critical" | "muted";

export const TEXT_TONE: Record<INpsTone, string> = {
  primary: "text-primary",
  success: "text-severity-success",
  critical: "text-severity-critical",
  muted: "text-muted-foreground",
};

export const CHIP_SOFT: Record<INpsTone, string> = {
  primary: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40",
  success:
    "bg-severity-success/15 text-severity-success ring-1 ring-inset ring-severity-success/40",
  critical:
    "bg-severity-critical/15 text-severity-critical ring-1 ring-inset ring-severity-critical/40",
  muted: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

export const BOX_TONE: Record<INpsTone, string> = {
  primary: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/45",
  success:
    "bg-severity-success/15 text-severity-success ring-1 ring-inset ring-severity-success/45",
  critical:
    "bg-severity-critical/15 text-severity-critical ring-1 ring-inset ring-severity-critical/45",
  muted: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

export const BAR_TONE: Record<INpsTone, string> = {
  primary: "bg-primary",
  success: "bg-severity-success",
  critical: "bg-severity-critical",
  muted: "bg-muted-foreground/40",
};

/** Tone of a raw 0–10 answer. The single place that maps a score to a colour. */
export function scoreTone(score: number): INpsTone {
  if (score >= 9) return "success";
  if (score >= 7) return "muted";
  return "critical";
}

/** First letters of a name, at most two — for the avatar bubble. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}
