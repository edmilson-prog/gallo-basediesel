// src/features/media/components/MediaGrid.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { IMediaAsset } from "@/shared/types";
import type { IMockUserProfile } from "@/features/auth/mock-users";
import { cn } from "@/lib/utils";
import { MEDIA_STRINGS } from "../i18n/pt-BR";
import { MediaTile } from "./MediaTile";

interface IMediaGridProps {
  assets: IMediaAsset[];
  columns: number; // 3 in drawer, responsive (2..6) for customer
  viewer: IMockUserProfile | null;
  onOpen: (asset: IMediaAsset) => void;
  onRetry?: (asset: IMediaAsset) => void;
  isLocked: (asset: IMediaAsset) => boolean;
  renderLockedOverlay: (asset: IMediaAsset) => ReactNode;
  className?: string;
}

const VIRTUALIZE_THRESHOLD = 60;

/**
 * Realistic first-frame row height estimate for the virtualizer.
 * Square cells: width ≈ containerWidth / columns. We can't know the container
 * width before mount, so we pick a safe upper-bound fallback. After mount the
 * virtualizer measures each row via measureElement and converges quickly.
 * 200 px prevents the scroll container from collapsing to 0 px on first paint.
 */
const ESTIMATED_ROW_HEIGHT = 200;

export function MediaGrid({
  assets, columns, viewer, onOpen, onRetry, isLocked, renderLockedOverlay, className,
}: IMediaGridProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // Roving tabindex anchor — flat cell index (0-based).
  const [active, setActive] = useState(0);

  // FIX: clamp `active` whenever the asset list shrinks (e.g. after a filter).
  // Guards the empty-list case (assets.length === 0) by clamping to 0.
  useEffect(() => {
    if (assets.length === 0) {
      setActive(0);
    } else if (active > assets.length - 1) {
      setActive(assets.length - 1);
    }
  }, [assets.length, active]);

  // Derived clamped value used synchronously this render before the effect runs.
  const clampedActive = assets.length === 0 ? 0 : Math.min(active, assets.length - 1);

  /**
   * focusCell targets the primary <button> inside the cell at flat index `idx`.
   * The roving tabIndex now lives on that button (not on the gridcell wrapper),
   * so focus and the visible ring land on the same element.
   */
  const focusCell = useCallback((idx: number) => {
    // Query the primary button (first button) inside the indexed [data-cell].
    const cells = parentRef.current?.querySelectorAll<HTMLElement>("[data-cell]");
    if (!cells) return;
    const cell = cells[idx];
    if (!cell) return;
    // The primary button is the first button child (the retry button is
    // tabIndex=-1 and not the intended focus target for arrow navigation).
    const btn = cell.querySelector<HTMLButtonElement>("button[data-primary]");
    btn?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = clampedActive;
      if (e.key === "ArrowRight") next = Math.min(clampedActive + 1, assets.length - 1);
      else if (e.key === "ArrowLeft") next = Math.max(clampedActive - 1, 0);
      else if (e.key === "ArrowDown") next = Math.min(clampedActive + columns, assets.length - 1);
      else if (e.key === "ArrowUp") next = Math.max(clampedActive - columns, 0);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = assets.length - 1;
      else return;
      e.preventDefault();
      setActive(next);
      focusCell(next);
    },
    [clampedActive, assets.length, columns, focusCell],
  );

  /**
   * A single gridcell.
   *
   * FIX (roving tabindex): tabIndex is now passed to MediaTile's primary
   * <button> (via the `tabIndex` prop) — NOT to this wrapper div. This means
   * exactly one <button> across the whole grid has tabIndex=0 at any time,
   * satisfying the "Tab enters/exits once" contract (spec §7 / D-7 / RNF-004).
   * The gridcell <div> itself has no tabIndex, so it is not in the tab order.
   *
   * aria-colindex is 1-based per the ARIA spec for virtualized grids.
   */
  const cell = (asset: IMediaAsset, idx: number, colIndex: number) => (
    <div
      key={asset.id}
      data-cell
      role="gridcell"
      aria-colindex={colIndex + 1}
    >
      <MediaTile
        asset={asset}
        viewer={viewer}
        tabIndex={idx === clampedActive ? 0 : -1}
        onOpen={() => { setActive(idx); onOpen(asset); }}
        onRetry={onRetry ? () => onRetry(asset) : undefined}
        lockedOverlay={isLocked(asset) ? renderLockedOverlay(asset) : undefined}
      />
    </div>
  );

  // A real grid row of up to `columns` cells.
  const rowStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  const rowCount = Math.ceil(assets.length / columns);

  /**
   * renderRow renders a single role="row" div.
   * aria-rowindex is 1-based per the ARIA spec (important for virtualized grids
   * where not all rows are in the DOM — assistive tech uses this to announce position).
   */
  const renderRow = (rowIndex: number) => {
    const start = rowIndex * columns;
    const rowAssets = assets.slice(start, start + columns);
    return (
      <div role="row" aria-rowindex={rowIndex + 1} className="grid gap-2" style={rowStyle}>
        {rowAssets.map((a, j) => cell(a, start + j, j))}
      </div>
    );
  };

  const gridLabel = MEDIA_STRINGS.grid.ariaLabel;

  if (assets.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div
        ref={parentRef}
        role="grid"
        aria-label={gridLabel}
        aria-colcount={columns}
        aria-rowcount={rowCount}
        onKeyDown={onKeyDown}
        className={cn("flex flex-col gap-2 p-3", className)}
      >
        {Array.from({ length: rowCount }, (_, r) => (
          <RowWrapper key={r}>{renderRow(r)}</RowWrapper>
        ))}
      </div>
    );
  }

  // Virtualized: each virtual item is one role="row".
  return (
    <div
      ref={parentRef}
      role="grid"
      aria-label={gridLabel}
      aria-colcount={columns}
      aria-rowcount={rowCount}
      onKeyDown={onKeyDown}
      className={cn("overflow-auto p-3", className)}
    >
      <VirtualRows parentRef={parentRef} rowCount={rowCount} renderRow={renderRow} />
    </div>
  );
}

/** Keeps the row key stable without adding extra DOM (Fragment-like wrapper). */
function RowWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function VirtualRows({
  parentRef, rowCount, renderRow,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>;
  rowCount: number;
  renderRow: (rowIndex: number) => ReactNode;
}) {
  const rv = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    // FIX: use a realistic non-zero estimate so the scroll container does not
    // collapse to 0 px on first paint. The virtualizer refines heights via
    // measureElement after mount; ESTIMATED_ROW_HEIGHT is just the pre-mount
    // reservation that prevents jank and invisible rows.
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 4,
  });
  return (
    <div style={{ height: rv.getTotalSize(), position: "relative" }}>
      {rv.getVirtualItems().map((vr) => (
        <div
          key={vr.key}
          ref={rv.measureElement}
          data-index={vr.index}
          className="pb-2"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vr.start}px)` }}
        >
          {renderRow(vr.index)}
        </div>
      ))}
    </div>
  );
}
