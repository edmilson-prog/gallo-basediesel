import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { Granularity, ID } from "@/shared/types";

export type VolumePeriod = "24h" | "7d" | "30d" | "custom";
export type DashboardTab = "operacao" | "atendimento";

export interface IServiceVolumeState {
  tab: DashboardTab;
  granularity: Granularity;
  period: VolumePeriod;
  fromIso: string;
  toIso: string;
  store: ID | "all";
}

const DAY = 86_400_000;

function rangeFor(period: VolumePeriod, vde?: string, vate?: string): { fromIso: string; toIso: string } {
  const now = Date.now();
  if (period === "custom" && vde && vate) {
    return { fromIso: new Date(vde).toISOString(), toIso: new Date(vate).toISOString() };
  }
  const days = period === "24h" ? 1 : period === "7d" ? 7 : 30;
  return { fromIso: new Date(now - days * DAY).toISOString(), toIso: new Date(now).toISOString() };
}

export interface IServiceVolumeFiltersCtx {
  /** Locks `store` to the Gestor's own store — `setStore` becomes a no-op. */
  gestorLockedStoreId?: ID;
}

export function useServiceVolumeFilters(ctx: IServiceVolumeFiltersCtx = {}) {
  const search = useSearch({ from: "/app/inicio" }) as Record<string, string | undefined>;
  const navigate = useNavigate({ from: "/app/inicio" });

  const state = useMemo<IServiceVolumeState>(() => {
    const period = (search.vper as VolumePeriod) ?? "30d";
    const { fromIso, toIso } = rangeFor(period, search.vde, search.vate);
    return {
      tab: (search.aba as DashboardTab) ?? "operacao",
      granularity: (search.vg as Granularity) ?? "day",
      period,
      fromIso,
      toIso,
      store: ctx.gestorLockedStoreId ?? (search.vloja as ID | undefined) ?? "all",
    };
  }, [search, ctx.gestorLockedStoreId]);

  const apply = useCallback(
    (patch: Record<string, string | undefined>) => {
      void navigate({
        search: (prev) => {
          const next = { ...(prev as Record<string, string | undefined>), ...patch };
          for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "") delete next[k];
          return next;
        },
      });
    },
    [navigate],
  );

  return {
    state,
    setTab: (tab: DashboardTab) => apply({ aba: tab === "operacao" ? undefined : tab }),
    setGranularity: (g: Granularity) => apply({ vg: g === "day" ? undefined : g }),
    setPeriod: (p: VolumePeriod) => apply({ vper: p === "30d" ? undefined : p, vde: undefined, vate: undefined }),
    setCustomRange: (from: string, to: string) => apply({ vper: "custom", vde: from, vate: to }),
    setStore: (id: ID | "all") => {
      if (ctx.gestorLockedStoreId) return;
      apply({ vloja: id === "all" ? undefined : id });
    },
  };
}
