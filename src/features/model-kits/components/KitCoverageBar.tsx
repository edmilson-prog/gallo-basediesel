import { cn } from "@/lib/utils";
import type { IKitCoverage, ModelCoverageStatus } from "../engine";

export type CoverageFilter = ModelCoverageStatus | "todos";

interface ISegment {
  id: ModelCoverageStatus;
  count: number;
  label: string;
  dot: string;
  fill: string;
}

export interface IKitCoverageBarProps {
  coverage: IKitCoverage;
  value: CoverageFilter;
  onChange: (next: CoverageFilter) => void;
}

/**
 * The headline of the model list: how much of the catalog is actually curated,
 * in three numbers that also filter. Each carries a bar of one tick per model,
 * so the size of the gap reads without counting rows — and `sem kit nenhum` is
 * the work queue the screen exists to shrink.
 */
export function KitCoverageBar({ coverage, value, onChange }: IKitCoverageBarProps) {
  const segments: ISegment[] = [
    {
      id: "oficial",
      count: coverage.official,
      label: coverage.official === 1 ? "modelo com kit oficial" : "modelos com kit oficial",
      dot: "bg-severity-success",
      fill: "bg-severity-success",
    },
    {
      id: "rascunho",
      count: coverage.draft,
      label: coverage.draft === 1 ? "rascunho pendente" : "rascunhos pendentes",
      dot: "bg-severity-warning",
      fill: "bg-severity-warning",
    },
    {
      id: "sem",
      count: coverage.none,
      label: "sem kit nenhum",
      dot: "bg-severity-critical",
      fill: "bg-severity-critical",
    },
  ];

  return (
    <div
      role="group"
      aria-label="Cobertura de kit no catálogo"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 sm:flex-row sm:items-stretch"
    >
      {segments.map((segment) => {
        const active = value === segment.id;
        return (
          <button
            key={segment.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? "todos" : segment.id)}
            className={cn(
              "flex flex-1 flex-col gap-1.5 rounded-lg px-3 py-2 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-muted ring-1 ring-border" : "hover:bg-muted/50",
            )}
          >
            <span className="flex items-center gap-2">
              <span className={cn("size-1.5 shrink-0 rounded-full", segment.dot)} />
              <span className="text-2xl font-bold leading-none tabular-nums text-foreground">
                {segment.count}
              </span>
              <span className="text-sm text-muted-foreground">{segment.label}</span>
            </span>

            {/* One tick per model — the gap is meant to be seen, not counted. */}
            <span aria-hidden="true" className="flex gap-0.5">
              {Array.from({ length: coverage.total }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-[3px] flex-1 rounded-sm",
                    i < segment.count ? segment.fill : "bg-muted-foreground/20",
                  )}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
