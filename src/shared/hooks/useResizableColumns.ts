import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";

interface IResizableColumn<TId extends string> {
  id: TId;
  defaultWidth: number;
}

export interface IResizableColumns<TId extends string> {
  widths: Record<TId, number>;
  totalWidth: number;
  startResize: (id: TId, event: ReactPointerEvent) => void;
}

/**
 * Column-width state for a resizable table. Widths are persisted to
 * `localStorage` under `storageKey`; dragging a column's right edge updates the
 * width live and saves it on release.
 */
export function useResizableColumns<TId extends string>(
  columns: readonly IResizableColumn<TId>[],
  storageKey: string,
  minWidth = 64,
): IResizableColumns<TId> {
  const defaults = useMemo(() => {
    const map = {} as Record<TId, number>;
    for (const col of columns) map[col.id] = col.defaultWidth;
    return map;
  }, [columns]);

  const [widths, setWidths] = useState<Record<TId, number>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const merged = { ...defaults };
      for (const col of columns) {
        const value = parsed[col.id];
        if (typeof value === "number" && Number.isFinite(value) && value >= minWidth) {
          merged[col.id] = value;
        }
      }
      return merged;
    } catch {
      return defaults;
    }
  });

  const persist = useCallback(
    (next: Record<TId, number>) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // localStorage indisponível — preferência apenas em memória nesta sessão.
      }
    },
    [storageKey],
  );

  const startResize = useCallback(
    (id: TId, event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = widths[id];

      const onMove = (move: PointerEvent) => {
        const next = Math.max(minWidth, startWidth + (move.clientX - startX));
        setWidths((prev) => ({ ...prev, [id]: next }));
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        setWidths((prev) => {
          persist(prev);
          return prev;
        });
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.body.style.userSelect = "none";
    },
    [widths, minWidth, persist],
  );

  const totalWidth = useMemo(
    () => Object.values<number>(widths).reduce((sum, w) => sum + w, 0),
    [widths],
  );

  return { widths, totalWidth, startResize };
}
