import { useEffect, useMemo, useState } from "react";
import type { IRelease } from "@/shared/types/about";
import { Button } from "@/components/ui/button";
import { ReleaseItem } from "./ReleaseItem";
import { ReleaseToolbar } from "./ReleaseToolbar";
import { applyFilters, useReleaseFilters } from "../hooks/useReleaseFilters";
import { ABOUT_I18N } from "../i18n/pt-BR";

interface IProps {
  releases: IRelease[];
}

/**
 * Owns the open/closed state of release rows and the active filters.
 *
 * Initially the most recent release is expanded. When the user changes the
 * search box, releases that match the search inside their bullet items are
 * auto-expanded so the matched content is visible.
 */
export function ReleaseHistorySection({ releases }: IProps) {
  const { filters, setSearch, setKind, setPeriod, reset, isFiltered } =
    useReleaseFilters();

  const filtered = useMemo(() => applyFilters(releases, filters), [releases, filters]);

  const [openVersions, setOpenVersions] = useState<Set<string>>(() => {
    const first = releases[0]?.version;
    return new Set(first ? [first] : []);
  });

  // When search yields hits inside category items, auto-expand those releases.
  useEffect(() => {
    if (filters.search.trim().length === 0) return;
    const toOpen = new Set(openVersions);
    for (const r of filtered) toOpen.add(r.version);
    setOpenVersions(toOpen);
    // intentional: we only want to react to search changes, not to openVersions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filtered]);

  const toggle = (version: string) => {
    setOpenVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  return (
    <section>
      <header className="mb-3 mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {ABOUT_I18N.history.title}
        </h2>
        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
          {releases.length} {ABOUT_I18N.history.countSuffix}
        </span>
      </header>

      <ReleaseToolbar
        filters={filters}
        totalCount={releases.length}
        filteredCount={filtered.length}
        onSearchChange={setSearch}
        onKindChange={setKind}
        onPeriodChange={setPeriod}
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {ABOUT_I18N.history.emptyTitle}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ABOUT_I18N.history.emptyDescription}
          </p>
          {isFiltered && (
            <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
              {ABOUT_I18N.history.clearFilters}
            </Button>
          )}
        </div>
      ) : (
        <div>
          {filtered.map((release) => (
            <ReleaseItem
              key={release.version}
              release={release}
              open={openVersions.has(release.version)}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}
