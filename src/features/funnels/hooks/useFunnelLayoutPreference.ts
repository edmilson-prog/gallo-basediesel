import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_FUNNEL_LAYOUT, FUNNEL_LAYOUTS, type FunnelLayout } from "../engine/resolveLayout";

const STORAGE_KEY = "gallo-leads-funnel-layout";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeFunnelLayout(raw: string | null | undefined): FunnelLayout {
  return FUNNEL_LAYOUTS.includes(raw as FunnelLayout)
    ? (raw as FunnelLayout)
    : DEFAULT_FUNNEL_LAYOUT;
}

function readStorage(): FunnelLayout {
  if (typeof window === "undefined") return DEFAULT_FUNNEL_LAYOUT;
  try {
    return normalizeFunnelLayout(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_FUNNEL_LAYOUT;
  }
}

/**
 * Module-level store rather than per-hook useState.
 *
 * The page mounts one FunnelNav per slot (rail, header, tabs) and exactly one
 * of them renders. With independent useState, the slot that writes the new
 * preference was the only one to re-render: it stopped matching its own slot
 * and unmounted, while the incoming slot still held the old value and never
 * appeared. The page ended up with no funnel navigation at all until a reload
 * re-read localStorage in every instance.
 *
 * A shared snapshot plus subscribers keeps every instance in agreement within
 * the same tick.
 */
let current: FunnelLayout = readStorage();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab changing the preference should land here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const next = normalizeFunnelLayout(e.newValue);
    if (next === current) return;
    current = next;
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): FunnelLayout => current;
const getServerSnapshot = (): FunnelLayout => DEFAULT_FUNNEL_LAYOUT;

function write(next: FunnelLayout): void {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode or a full quota: the session still works, unpersisted.
  }
  emit();
}

/**
 * The user's chosen navigation pattern.
 *
 * Stores the RAW preference, never the layout `resolveLayout` derived from it:
 * a narrow window must not permanently rewrite the choice. Not scoped per
 * store — this is a personal display habit, not store configuration.
 */
export function useFunnelLayoutPreference(): [FunnelLayout, (l: FunnelLayout) => void] {
  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((next: FunnelLayout) => write(next), []);
  return [layout, set];
}
