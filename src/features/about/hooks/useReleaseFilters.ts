import { useCallback, useMemo, useState } from "react";
import type { IRelease, ReleaseKind } from "@/shared/types/about";

export type ReleasePeriod = "all" | "thisMonth" | "last3Months" | "thisYear";
export type ReleaseKindFilter = "all" | ReleaseKind;

export interface IReleaseFilters {
  search: string;
  kind: ReleaseKindFilter;
  period: ReleasePeriod;
}

const INITIAL: IReleaseFilters = { search: "", kind: "all", period: "all" };

export function useReleaseFilters() {
  const [filters, setFilters] = useState<IReleaseFilters>(INITIAL);

  const setSearch = useCallback((search: string) => setFilters((f) => ({ ...f, search })), []);
  const setKind = useCallback((kind: ReleaseKindFilter) => setFilters((f) => ({ ...f, kind })), []);
  const setPeriod = useCallback(
    (period: ReleasePeriod) => setFilters((f) => ({ ...f, period })),
    [],
  );
  const reset = useCallback(() => setFilters(INITIAL), []);

  const isFiltered = useMemo(
    () => filters.search.trim().length > 0 || filters.kind !== "all" || filters.period !== "all",
    [filters],
  );

  return { filters, setSearch, setKind, setPeriod, reset, isFiltered };
}

/**
 * Pure filter applied client-side over the in-memory IRelease[].
 *
 * Search is case- and accent-insensitive, matches across version, codename,
 * summary and every category item. When the match is inside category items,
 * the caller should ensure the release is auto-expanded (handled by
 * ReleaseHistorySection).
 */
export function applyFilters(releases: IRelease[], filters: IReleaseFilters): IRelease[] {
  const normalized = normalize(filters.search);
  const now = new Date();

  return releases.filter((r) => {
    if (filters.kind !== "all" && r.kind !== filters.kind) return false;
    if (!matchesPeriod(r.date, filters.period, now)) return false;
    if (normalized.length === 0) return true;

    if (normalize(r.version).includes(normalized)) return true;
    if (r.codename && normalize(r.codename).includes(normalized)) return true;
    if (normalize(r.summary).includes(normalized)) return true;
    for (const c of r.categories) {
      for (const item of c.items) {
        if (normalize(item).includes(normalized)) return true;
      }
    }
    return false;
  });
}

/**
 * Returns true when `releaseDateIso` should be visible under `period`.
 * `now` is injected for testability.
 */
function matchesPeriod(releaseDateIso: string, period: ReleasePeriod, now: Date): boolean {
  if (period === "all") return true;
  const [yStr, mStr, dStr] = releaseDateIso.split("-");
  const rDate = new Date(Number(yStr), Number(mStr) - 1, Number(dStr));
  if (Number.isNaN(rDate.getTime())) return true;

  switch (period) {
    case "thisMonth":
      return rDate.getFullYear() === now.getFullYear() && rDate.getMonth() === now.getMonth();
    case "last3Months": {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 3);
      return rDate >= cutoff;
    }
    case "thisYear":
      return rDate.getFullYear() === now.getFullYear();
  }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
