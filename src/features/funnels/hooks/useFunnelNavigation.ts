import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILeadFunnel } from "@/shared/types";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useLeadsUrlState } from "@/features/leads/hooks/useLeadsUrlState";
import { resolveLayout, type FunnelLayout, type IResolvedLayout } from "../engine/resolveLayout";
import { ALL_FUNNELS, resolveInitialFunnel } from "../engine/resolveInitialFunnel";
import { COPY } from "../i18n/pt-BR";
import { useFunnelLayoutPreference } from "./useFunnelLayoutPreference";

/** Scoped per store: a shared key would drop you into another store's funnel. */
const lastFunnelKey = (storeId: ID | null | undefined) => `gallo-leads-last-funnel:${storeId ?? ""}`;

/** SSR-safe default; the effect corrects it on mount. */
const FALLBACK_WIDTH = 1440;

const EMPTY_FUNNELS: ILeadFunnel[] = [];
const EMPTY_COUNTS: Record<ID, number> = {};

export interface IUseFunnelNavigationResult {
  funnels: ILeadFunnel[];
  countsByFunnel: Record<ID, number>;
  activeFunnelId: ID | typeof ALL_FUNNELS | null;
  setActiveFunnel: (id: ID | typeof ALL_FUNNELS) => void;
  preferredLayout: FunnelLayout;
  setPreferredLayout: (l: FunnelLayout) => void;
  resolved: IResolvedLayout;
  isLoading: boolean;
}

function readLastFunnel(storeId: ID | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lastFunnelKey(storeId));
  } catch {
    return null;
  }
}

function writeLastFunnel(storeId: ID | null | undefined, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(lastFunnelKey(storeId));
    else window.localStorage.setItem(lastFunnelKey(storeId), value);
  } catch {
    // Unpersisted is survivable; the URL still carries the selection.
  }
}

/**
 * The single navigation state behind the three projections.
 *
 * Everything that is not presentation lives here — which funnels exist, which
 * one is active, how it is chosen and how the pattern degrades — so that
 * FunnelRail, FunnelSwitcher and FunnelTabs stay pure views and cannot drift
 * into offering different features (spec 6.2).
 */
export function useFunnelNavigation(): IUseFunnelNavigationResult {
  const { currentStoreId } = useCurrentStore();
  const provider = useLeadFunnelsProvider();
  const url = useLeadsUrlState();
  const [preferredLayout, setPreferredLayout] = useFunnelLayoutPreference();

  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? FALLBACK_WIDTH : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    // Correct the SSR-safe default on mount, before the first resize.
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const funnelsQuery = useQuery({
    queryKey: ["lead-funnels", currentStoreId] as const,
    queryFn: async () => {
      if (!currentStoreId) return EMPTY_FUNNELS;
      const [all, accessibleIds] = await Promise.all([
        provider.listFunnels(currentStoreId),
        provider.listAccessibleFunnelIds(currentStoreId),
      ]);
      const reach = new Set(accessibleIds);
      return all
        .filter((f) => !f.archivedAt && reach.has(f.id))
        .sort((a, b) => a.position - b.position);
    },
    enabled: Boolean(currentStoreId),
    staleTime: 60_000,
  });

  const countsQuery = useQuery({
    queryKey: ["lead-funnel-counts", currentStoreId] as const,
    queryFn: () => (currentStoreId ? provider.countLeadsByFunnel(currentStoreId) : EMPTY_COUNTS),
    enabled: Boolean(currentStoreId),
    staleTime: 30_000,
  });

  const funnels = funnelsQuery.data ?? EMPTY_FUNNELS;
  const countsByFunnel = countsQuery.data ?? EMPTY_COUNTS;

  const resolution = useMemo(
    () =>
      resolveInitialFunnel({
        urlFunnelId: url.funnelId,
        lastFunnelId: readLastFunnel(currentStoreId),
        accessible: funnels,
      }),
    [url.funnelId, currentStoreId, funnels],
  );

  const setActiveFunnel = useCallback(
    (id: ID | typeof ALL_FUNNELS) => {
      url.setFunnel(id);
      // The consolidated view is not a funnel and must not become "last funnel"
      // — otherwise the next visit opens in list mode with no way to tell why.
      if (id !== ALL_FUNNELS) writeLastFunnel(currentStoreId, id);
    },
    [url, currentStoreId],
  );

  // Once funnels are known, write the resolved funnel into the URL so the board
  // is shareable from the very first visit rather than only after a click.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (funnelsQuery.isLoading || funnels.length === 0) return;
    if (url.funnelId !== undefined) return;
    if (syncedRef.current) return;
    if (resolution.funnelId === null) return;
    syncedRef.current = true;
    url.setFunnel(resolution.funnelId);
  }, [funnelsQuery.isLoading, funnels.length, url, resolution.funnelId]);

  // Tell the user once when a shared link pointed somewhere they cannot open.
  const warnedRef = useRef(false);
  useEffect(() => {
    if (!resolution.invalidLink || warnedRef.current) return;
    if (funnelsQuery.isLoading) return;
    const landed = funnels.find((f) => f.id === resolution.funnelId);
    if (!landed) return;
    warnedRef.current = true;
    toast.error(COPY.invalidLink(landed.name));
  }, [resolution.invalidLink, resolution.funnelId, funnels, funnelsQuery.isLoading]);

  // A stale local key is not worth telling anyone about — just drop it.
  useEffect(() => {
    if (resolution.clearLastFunnel) writeLastFunnel(currentStoreId, null);
  }, [resolution.clearLastFunnel, currentStoreId]);

  const resolved = useMemo(
    () => resolveLayout({ preferred: preferredLayout, width, funnelCount: funnels.length }),
    [preferredLayout, width, funnels.length],
  );

  return {
    funnels,
    countsByFunnel,
    activeFunnelId: resolution.funnelId,
    setActiveFunnel,
    preferredLayout,
    setPreferredLayout,
    resolved,
    isLoading: funnelsQuery.isLoading,
  };
}
