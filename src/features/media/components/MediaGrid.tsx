// src/features/media/components/MediaGrid.tsx
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { IMediaAsset } from "@/shared/types";
import type { IMockUserProfile } from "@/features/auth/mock-users";
import { cn } from "@/lib/utils";
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

export function MediaGrid({
  assets, columns, viewer, onOpen, onRetry, isLocked, renderLockedOverlay, className,
}: IMediaGridProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0); // roving tabindex anchor (flat cell index)

  const focusCell = useCallback((idx: number) => {
    const cell = parentRef.current?.querySelectorAll<HTMLElement>("[data-cell]")[idx];
    cell?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = active;
      if (e.key === "ArrowRight") next = Math.min(active + 1, assets.length - 1);
      else if (e.key === "ArrowLeft") next = Math.max(active - 1, 0);
      else if (e.key === "ArrowDown") next = Math.min(active + columns, assets.length - 1);
      else if (e.key === "ArrowUp") next = Math.max(active - columns, 0);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = assets.length - 1;
      else return;
      e.preventDefault();
      setActive(next);
      focusCell(next);
    },
    [active, assets.length, columns, focusCell],
  );

  // A single gridcell. tabIndex roves so Tab enters the grid exactly once.
  const cell = (asset: IMediaAsset, idx: number) => (
    <div
      key={asset.id}
      data-cell
      role="gridcell"
      tabIndex={idx === active ? 0 : -1}
    >
      <MediaTile
        asset={asset}
        viewer={viewer}
        onOpen={() => { setActive(idx); onOpen(asset); }}
        onRetry={onRetry ? () => onRetry(asset) : undefined}
        lockedOverlay={isLocked(asset) ? renderLockedOverlay(asset) : undefined}
      />
    </div>
  );

  // A real grid row of up to `columns` cells.
  const rowStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  const rowCount = Math.ceil(assets.length / columns);
  const renderRow = (rowIndex: number) => {
    const start = rowIndex * columns;
    const rowAssets = assets.slice(start, start + columns);
    return (
      <div role="row" className="grid gap-2" style={rowStyle}>
        {rowAssets.map((a, j) => cell(a, start + j))}
      </div>
    );
  };

  if (assets.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div
        ref={parentRef}
        role="grid"
        aria-label="Mídias"
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
      aria-label="Mídias"
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
    estimateSize: () => 0, // measured via measureElement; height comes from aspect-square cells
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
