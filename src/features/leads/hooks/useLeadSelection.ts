import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ID } from "@/shared/types";

export interface IUseLeadSelectionResult {
  selected: Set<ID>;
  toggle: (id: ID, index: number, withShift: boolean) => void;
  selectAllVisible: () => void;
  clear: () => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
}

/**
 * Which leads the list has selected.
 *
 * Plain component state, not a module store: there is one list, and a selection
 * that outlived the screen would be a way to act on rows somebody last saw a
 * navigation ago.
 *
 * Shift-click extends from the previous click. Triage is ticking twenty
 * consecutive rows; without a range that is twenty clicks, and people stop.
 */
export function useLeadSelection(visibleIds: ID[]): IUseLeadSelectionResult {
  const [selected, setSelected] = useState<Set<ID>>(() => new Set());
  const lastIndexRef = useRef<number | null>(null);

  // The visible set changed — funnel, filter, search. Drop the selection
  // instead of carrying ids the user can no longer see: applying a bulk action
  // to somebody who scrolled out of view is how a batch hits the wrong people.
  const visibleKey = visibleIds.join(",");
  useEffect(() => {
    setSelected(new Set());
    lastIndexRef.current = null;
  }, [visibleKey]);

  const toggle = useCallback(
    (id: ID, index: number, withShift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const anchor = lastIndexRef.current;

        if (withShift && anchor !== null) {
          const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
          // The range takes the state of the row being clicked, so a shift-click
          // can clear a stretch as well as fill one.
          const turningOn = !prev.has(id);
          for (let i = from; i <= to; i += 1) {
            const rangeId = visibleIds[i];
            if (!rangeId) continue;
            if (turningOn) next.add(rangeId);
            else next.delete(rangeId);
          }
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      });
      lastIndexRef.current = index;
    },
    [visibleIds],
  );

  const selectAllVisible = useCallback(() => {
    setSelected((prev) => (prev.size === visibleIds.length ? new Set() : new Set(visibleIds)));
  }, [visibleIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
    lastIndexRef.current = null;
  }, []);

  const allVisibleSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selected.has(id)),
    [visibleIds, selected],
  );

  return {
    selected,
    toggle,
    selectAllVisible,
    clear,
    allVisibleSelected,
    someVisibleSelected: selected.size > 0 && !allVisibleSelected,
  };
}
