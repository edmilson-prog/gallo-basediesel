import type { ISO8601 } from "@/shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Urgency tier of an approaching source-URL expiry. */
export type ExpiryUrgency = "none" | "soft" | "strong" | "critical";

/** Default Meta-style source URL lifetime (days) when simulating expiry. */
export const DEFAULT_SOURCE_TTL_DAYS = 30;

/** Add `ttlDays` to an ISO createdAt and return the ISO expiry. */
export function computeSourceExpiresAt(
  createdAt: ISO8601,
  ttlDays: number = DEFAULT_SOURCE_TTL_DAYS,
): ISO8601 {
  return new Date(new Date(createdAt).getTime() + ttlDays * DAY_MS).toISOString();
}

/**
 * Whole days from `now` until `expiresAt` (ceil — a partial day still counts).
 * Negative/zero ⇒ already expired. Null when there is no expiry.
 */
export function daysUntilExpiry(expiresAt: ISO8601 | undefined, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - now.getTime();
  return Math.ceil(diff / DAY_MS);
}

/** Human label: "expira em Nd" / "expirada" / null. */
export function expiryLabel(expiresAt: ISO8601 | undefined, now: Date = new Date()): string | null {
  const days = daysUntilExpiry(expiresAt, now);
  if (days === null) return null;
  if (days <= 0) return "expirada";
  return `expira em ${days}d`;
}

/** Tier per spec §5.6/D-13: >14d soft, <=7d strong, <=2d critical. */
export function expiryUrgency(expiresAt: ISO8601 | undefined, now: Date = new Date()): ExpiryUrgency {
  const days = daysUntilExpiry(expiresAt, now);
  if (days === null) return "none";
  if (days <= 2) return "critical";
  if (days <= 7) return "strong";
  return "soft";
}

/** Tier word for an asset with a source expiry (never "none" — see {@link sourceExpiry}). */
export type SourceExpiryTier = "soft" | "strong" | "critical";

/** Convenience view-model for an asset's source-URL expiry. */
export interface ISourceExpiryView {
  daysLeft: number;
  label: string;
  tier: SourceExpiryTier;
}

/**
 * Convenience aggregator over the primitives above, consumed by Plan B's UI.
 * Reads `asset.sourceExpiresAt`; when absent, returns a benign `soft`/0/""
 * shape so callers can render unconditionally. The tier word is **"strong"**
 * (never "solid"). Built on {@link daysUntilExpiry}, {@link expiryLabel} and
 * {@link expiryUrgency}.
 */
export function sourceExpiry(
  asset: { sourceExpiresAt?: ISO8601 },
  now: Date = new Date(),
): ISourceExpiryView {
  const daysLeft = daysUntilExpiry(asset.sourceExpiresAt, now) ?? 0;
  const label = expiryLabel(asset.sourceExpiresAt, now) ?? "";
  const urgency = expiryUrgency(asset.sourceExpiresAt, now);
  // urgency is "none" only when there is no expiry → present it as the
  // lowest non-escalated tier so the return type stays {soft|strong|critical}.
  const tier: SourceExpiryTier = urgency === "none" ? "soft" : urgency;
  return { daysLeft, label, tier };
}
