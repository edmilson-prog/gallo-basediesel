import { useCallback, useSyncExternalStore } from "react";
import type { ID } from "@/shared/types";
import { BOARD_SORT_MODES, type BoardSortMode } from "@/features/funnels/engine/boardSort";

const SORT_KEY = "gallo-leads-column-sort";
const COLLAPSED_KEY = "gallo-leads-collapsed-columns";

export interface IColumnPreferences {
  sortByStage: Record<ID, BoardSortMode>;
  collapsedByStage: Record<ID, boolean>;
}

export interface IUseColumnPreferencesResult extends IColumnPreferences {
  setSort: (stageId: ID, mode: BoardSortMode) => void;
  toggleCollapsed: (stageId: ID) => void;
}

function isSortMode(v: unknown): v is BoardSortMode {
  return typeof v === "string" && (BOARD_SORT_MODES as readonly string[]).includes(v);
}

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Total by construction: a corrupted map becomes an empty one, never a throw. */
function readMap<T>(key: string, guard: (v: unknown) => v is T): Record<ID, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<ID, T> = {};
    for (const [k, v] of Object.entries(parsed)) if (guard(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/**
 * Sorting and collapse, keyed BY STAGE and shared across every column.
 *
 * Two decisions, both learned the hard way:
 *
 * Keyed by stageId, not one key for the board — with N funnels a single key
 * would have each board overwriting the others' preferences, and the user
 * would watch their choice change for no reason they could see.
 *
 * A module-level store rather than `useState` per column, because every column
 * mounts this hook and they must agree within the same tick. Independent
 * copies is exactly the defect v0.159.1 fixed in the layout preference: the
 * writer re-rendered alone, and the next write clobbered what a sibling had
 * just persisted.
 */
let current: IColumnPreferences = {
  sortByStage: readMap(SORT_KEY, isSortMode),
  collapsedByStage: readMap(COLLAPSED_KEY, isBool),
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab reorganising its board should land here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SORT_KEY && e.key !== COLLAPSED_KEY) return;
    current = {
      sortByStage: readMap(SORT_KEY, isSortMode),
      collapsedByStage: readMap(COLLAPSED_KEY, isBool),
    };
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): IColumnPreferences => current;
const getServerSnapshot = (): IColumnPreferences => ({ sortByStage: {}, collapsedByStage: {} });

function persist(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the session still works, unpersisted.
  }
}

export function useColumnPreferences(): IUseColumnPreferencesResult {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSort = useCallback((stageId: ID, mode: BoardSortMode) => {
    if (current.sortByStage[stageId] === mode) return;
    const next = { ...current.sortByStage, [stageId]: mode };
    current = { ...current, sortByStage: next };
    persist(SORT_KEY, next);
    emit();
  }, []);

  const toggleCollapsed = useCallback((stageId: ID) => {
    const next = { ...current.collapsedByStage, [stageId]: !current.collapsedByStage[stageId] };
    current = { ...current, collapsedByStage: next };
    persist(COLLAPSED_KEY, next);
    emit();
  }, []);

  return { ...prefs, setSort, toggleCollapsed };
}
