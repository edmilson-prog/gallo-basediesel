import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useManagerDashboardProvider,
  type IManagerDashboardSnapshot,
  type IManagerDashboardSnapshotParams,
} from "@/providers/data";
import type { ID } from "@/shared/types";
import type { IDashboardFiltersState, IDashboardWindow } from "./useDashboardFilters";

/** Trailing-debounce window for realtime-tick refetches — coalesces bursts of
 *  Realtime events (each bumps `refreshKey`) into a single dashboard refetch. */
const REFRESH_DEBOUNCE_MS = 1500;

const EMPTY_SNAPSHOT: IManagerDashboardSnapshot = {
  openConversations: [],
  sellers: [],
  customers: [],
  conversationsInPeriod: [],
  messagesInPeriod: [],
  conversationsInPrev: [],
  messagesInPrev: [],
};

export interface IDashboardSnapshotState {
  snapshot: IManagerDashboardSnapshot;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Build the snapshot params from filter state, resolving the active store
 * scope and translating the "all" sentinel into `undefined` so the provider
 * sees a clean call site.
 */
function buildParams(
  filters: IDashboardFiltersState,
  window: IDashboardWindow,
  prev: IDashboardWindow,
  ctx: { fallbackStoreId: ID | null },
): IManagerDashboardSnapshotParams {
  return {
    storeId: filters.store === "all" ? (ctx.fallbackStoreId ?? undefined) : filters.store,
    sellerId: filters.seller === "all" ? undefined : filters.seller,
    channel: filters.channel === "all" ? undefined : filters.channel,
    fromIso: window.fromIso,
    toIso: window.toIso,
    prevFromIso: prev.fromIso,
    prevToIso: prev.toIso,
  };
}

export interface IUseDashboardSnapshotOptions {
  /** When `null`/`undefined`, no store fallback is applied. */
  fallbackStoreId: ID | null;
  /** Bump key — when it changes, the snapshot refetches without a loading flash. */
  refreshKey?: number;
  /** Pause queries — used while role hydration finishes. */
  enabled?: boolean;
}

/**
 * Fetch the operational snapshot whenever filters or `refreshKey` change.
 *
 * Behaviour:
 * - First fetch shows `isLoading=true`; subsequent ones show `isRefreshing=true`
 *   so the cards don't flash a skeleton on every real-time tick.
 * - Errors are non-fatal — the cached snapshot survives so transient failures
 *   don't blank out the UI.
 */
export function useDashboardSnapshot(
  filters: IDashboardFiltersState,
  window: IDashboardWindow,
  prev: IDashboardWindow,
  options: IUseDashboardSnapshotOptions,
): IDashboardSnapshotState {
  const provider = useManagerDashboardProvider();
  const [snapshot, setSnapshot] = useState<IManagerDashboardSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const enabled = options.enabled ?? true;
  const params = useMemo(
    () => buildParams(filters, window, prev, { fallbackStoreId: options.fallbackStoreId }),
    [filters, window, prev, options.fallbackStoreId],
  );
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const refreshKey = options.refreshKey ?? 0;

  const fetchSnapshot = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const next = await provider.snapshot(params);
        setSnapshot(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (mode === "initial") setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, paramsKey],
  );

  // Always-fresh handle to fetchSnapshot so a debounced refresh that fires after
  // a filter change still runs with the current params (no stale-closure refetch).
  const fetchRef = useRef(fetchSnapshot);
  fetchRef.current = fetchSnapshot;
  // Mirror `enabled` into a ref so the debounce effect can gate on it without
  // making `enabled` an effect dependency — otherwise flipping it true would
  // schedule a ghost refetch for a tick the dashboard already consumed.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset to initial fetch whenever filters change (or `enabled` flips). A fresh
  // initial fetch supersedes any pending debounced refresh, so cancel the stray
  // timer first — the debounce effect is keyed on [refreshKey] only, so neither a
  // filter change nor an enable flip would otherwise clear an armed timer, and it
  // would fire a redundant "refresh" ~1.5s later on top of this load.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!enabled) return;
    void fetchSnapshot("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, enabled]);

  // Background refresh on a real realtime tick (refreshKey bump) — trailing-
  // debounced so a burst coalesces into a single refetch, always with fresh
  // params. Depends ONLY on refreshKey; `enabled` is read via enabledRef (and
  // re-checked when the timer fires) so flipping enabled true never schedules a
  // refetch for an already-consumed tick — the initial-fetch effect handles the
  // load on enable.
  useEffect(() => {
    if (refreshKey === 0) return;
    if (!enabledRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (enabledRef.current) void fetchRef.current("refresh");
    }, REFRESH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Manual refetch fires immediately and cancels any pending debounced tick so a
  // burst already in flight doesn't double-fetch right after the manual one.
  const refetch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void fetchSnapshot("refresh");
  }, [fetchSnapshot]);

  return { snapshot, isLoading, isRefreshing, error, refetch };
}
