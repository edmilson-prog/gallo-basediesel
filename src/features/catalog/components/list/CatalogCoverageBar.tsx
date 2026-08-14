/**
 * Completeness strip — the design kit's "faixa que faltava".
 *
 * The catalog is not a finished reference: the DINTEC import left most of it
 * half-filled. This strip states the size of that backlog in absolute numbers
 * over the *whole* base (not the current page), and every number is a filter,
 * so reading the problem and starting on it are the same gesture.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import {
  COVERAGE_BUCKETS,
  DEFAULT_COVERAGE,
  type CoverageBucket,
  type CoverageTone,
} from "../../utils/completeness";

const COPY = CATALOG_STRINGS.coverage;

const TONE_TEXT: Record<CoverageTone, string> = {
  neutral: "text-foreground/70",
  success: "text-severity-success",
  critical: "text-severity-critical",
  warning: "text-severity-warning",
};

const TONE_ACTIVE: Record<CoverageTone, string> = {
  neutral: "border-foreground/30 bg-foreground/10",
  success: "border-severity-success/45 bg-severity-success/15",
  critical: "border-severity-critical/45 bg-severity-critical/15",
  warning: "border-severity-warning/45 bg-severity-warning/15",
};

export interface ICatalogCoverageBarProps {
  /** Bucket counts over the entire catalog. */
  counts: Record<CoverageBucket, number> | null;
  active: CoverageBucket;
  onChange: (bucket: CoverageBucket) => void;
  isLoading: boolean;
}

export function CatalogCoverageBar({
  counts,
  active,
  onChange,
  isLoading,
}: ICatalogCoverageBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2 md:px-6">
      <span className="mr-0.5 shrink-0 text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
        {COPY.label}
      </span>

      {isLoading && !counts
        ? COVERAGE_BUCKETS.map((bucket) => (
            <Skeleton key={bucket.id} className="h-[26px] w-28 rounded-full" />
          ))
        : COVERAGE_BUCKETS.map((bucket) => {
            const isActive = active === bucket.id;
            const count = counts?.[bucket.id] ?? 0;
            return (
              <button
                key={bucket.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange(isActive ? DEFAULT_COVERAGE : bucket.id)}
                className={cn(
                  "inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
                  isActive
                    ? TONE_ACTIVE[bucket.tone]
                    : "border-border bg-transparent hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "font-display text-sm font-bold leading-none tabular-nums",
                    TONE_TEXT[bucket.tone],
                  )}
                >
                  {count.toLocaleString("pt-BR")}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold tracking-[0.03em]",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {bucket.label}
                </span>
              </button>
            );
          })}

      <span className="ml-auto hidden shrink-0 text-[11px] text-muted-foreground/70 lg:inline">
        {isLoading && !counts ? COPY.loading : COPY.hint}
      </span>
    </div>
  );
}
