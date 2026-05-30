import { useCallback, useRef, useState } from "react";
import {
  MIN_COLUMN_WIDTH,
  readColumnWidths,
  writeColumnWidths,
  type ColumnId,
} from "../utils/columns";

/**
 * Manages resizable column widths for the vehicles table.
 *
 * Widths update in memory during a drag (cheap re-renders) and are persisted
 * to localStorage only when the drag commits, avoiding a write per mouse move.
 */
export function useVehiclesColumnWidths() {
  const [widths, setWidths] = useState<Record<ColumnId, number>>(() => readColumnWidths());
  const latest = useRef(widths);
  latest.current = widths;

  const setWidth = useCallback((id: ColumnId, width: number) => {
    setWidths((prev) => ({ ...prev, [id]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) }));
  }, []);

  const commit = useCallback(() => {
    writeColumnWidths(latest.current);
  }, []);

  return { widths, setWidth, commit };
}
