// src/features/media/components/MediaTile.tsx
import { isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import type { IMediaAsset } from "@/shared/types";
import type { IMockUserProfile } from "@/features/auth/mock-users";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { mediaKindIcon } from "../utils/mediaDisplay";
import { statusChipPriority } from "../engine/sensitiveAccess";
import { sourceExpiry } from "../engine/sourceExpiry";
import { KIND_LABELS, MEDIA_STRINGS } from "../i18n/pt-BR";

interface IMediaTileProps {
  asset: IMediaAsset;
  /** Current viewer — drives the sensitive gate inside statusChipPriority. */
  viewer: IMockUserProfile | null;
  onOpen: () => void;
  onRetry?: () => void;
  /** Replaces the thumbnail with a blurred placeholder when locked. */
  lockedOverlay?: ReactNode;
  /**
   * Roving tabindex value for the primary button. MediaGrid sets 0 for the
   * active cell and -1 for all others so Tab enters the grid exactly once.
   * Default -1 keeps the tile inert when rendered standalone.
   */
  tabIndex?: number;
  className?: string;
}

// D-14: Tailwind severity utilities ONLY — never var(--severity-*).
// Expiry urgency tiers (D-13/§5.6): soft ⇒ muted warning, strong ⇒ solid warning, critical ⇒ critical.
const CHIP_TONE: Record<"failure" | "sensitive", string> = {
  failure: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  sensitive: "bg-severity-warning/15 text-severity-warning border-severity-warning/30",
};

const EXPIRY_TONE: Record<"soft" | "strong" | "critical", string> = {
  soft: "bg-severity-warning/10 text-severity-warning/80 border-severity-warning/20",
  strong: "bg-severity-warning/15 text-severity-warning border-severity-warning/30",
  critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
};

/** Square thumbnail tile with exactly one priority chip (D-13) + a11y label. */
export function MediaTile({ asset, viewer, onOpen, onRetry, lockedOverlay: lockedOverlayProp, tabIndex = -1, className }: IMediaTileProps) {
  // Forward tabIndex into the overlay so SensitiveLock's data-primary element participates
  // in the MediaGrid roving-tabindex pattern (focusCell queries [data-primary]).
  const lockedOverlay =
    lockedOverlayProp != null && isValidElement(lockedOverlayProp)
      ? cloneElement(lockedOverlayProp as ReactElement<{ tabIndex?: number }>, { tabIndex })
      : lockedOverlayProp;
  const chip = statusChipPriority(asset, viewer); // 'failure' | 'sensitive' | 'expiring' | 'none'
  const exp = sourceExpiry(asset);
  const c = MEDIA_STRINGS.chip;

  const isExpired = chip === "expiring" && exp.daysLeft <= 0;

  const ariaLabel = [
    asset.fileName ?? KIND_LABELS[asset.kind],
    chip === "sensitive" ? c.sensitive : null,
    chip === "failure" ? c.failure : null,
    chip === "expiring" && !isExpired ? c.expiringLabel(exp.daysLeft) : null,
    isExpired ? c.expiredLabel : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <div
      className={cn("relative aspect-square overflow-hidden rounded-md border border-border bg-muted", className)}
    >
      {/*
       * When a lockedOverlay is provided, SensitiveLock is the interactive element
       * (it renders role="button" with data-primary). Nesting it inside a <button>
       * produces invalid HTML (button-in-button) and double-fires click handlers.
       * Switch to a plain <div> wrapper so SensitiveLock owns the sole focus target.
       *
       * When there is no lockedOverlay, use a normal <button> with data-primary so
       * focusCell() in MediaGrid can locate it with `[data-primary]`.
       */}
      {lockedOverlay ? (
        <div
          aria-label={ariaLabel}
          className="group block h-full w-full"
        >
          {lockedOverlay}
          {/* type icon badge top-left */}
          <span className="absolute left-1.5 top-1.5 rounded bg-background/80 p-0.5 text-foreground shadow-sm">
            <Icon icon={mediaKindIcon(asset.kind)} size={13} aria-hidden />
          </span>
        </div>
      ) : (
        /* data-primary marks this as the roving-tabindex focus target for focusCell() in MediaGrid */
        <button
          type="button"
          data-primary
          tabIndex={tabIndex}
          onClick={onOpen}
          aria-label={ariaLabel}
          className="group block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground">
            <Icon icon={mediaKindIcon(asset.kind)} size={28} />
          </div>
          {/* type icon badge top-left */}
          <span className="absolute left-1.5 top-1.5 rounded bg-background/80 p-0.5 text-foreground shadow-sm">
            <Icon icon={mediaKindIcon(asset.kind)} size={13} aria-hidden />
          </span>
        </button>
      )}

      {/* ONE priority chip, bottom-right */}
      {chip === "sensitive" && (
        <span
          className={cn(
            "absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
            CHIP_TONE.sensitive,
          )}
        >
          <Icon icon="mdi:lock" size={11} aria-hidden />
          {c.sensitive}
        </span>
      )}
      {chip === "expiring" && (
        <span
          className={cn(
            "absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
            EXPIRY_TONE[exp.tier],
          )}
        >
          <Icon icon="mdi:clock-alert-outline" size={11} aria-hidden />
          {isExpired ? c.expired : c.expiringDays(exp.daysLeft)}
        </span>
      )}

      {/* failure chip carries a real focusable retry button (RF-008, reachable without hover).
       *
       * Roving-tabindex integration (D-7 / RNF-004): the retry button mirrors the same
       * tabIndex as the primary button so it participates in the MediaGrid roving sequence.
       * When this tile is the active cell (tabIndex=0 from MediaGrid) the retry button is
       * also reachable; when the tile is inactive (tabIndex=-1) retry is hidden from Tab.
       * This satisfies BOTH "Tab enters the grid exactly once" AND RF-008 keyboard reachability.
       *
       * Note: non-grid surfaces (MediaTypeGroups ListRow, cartões) do NOT use this component
       * for their retry affordance — they render independent sibling buttons in natural tab
       * order, which is correct because those surfaces are role="list" not role="grid".
       */}
      {chip === "failure" && (
        <span className={cn("absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", CHIP_TONE.failure)}>
          <Icon icon="mdi:alert-circle" size={11} aria-hidden />
          {c.failure}
          {onRetry && (
            <button
              type="button"
              tabIndex={tabIndex}
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              aria-label={c.retry}
              className="ml-0.5 rounded-full p-0.5 hover:bg-severity-critical/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Icon icon="mdi:refresh" size={11} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
