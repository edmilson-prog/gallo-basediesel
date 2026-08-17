import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/** Which queue is on screen. */
export type TriageTab = "soltos" | "duplicados" | "ignorados";

export interface ITriageHeaderProps {
  tab: TriageTab;
  onTabChange: (tab: TriageTab) => void;
  counts: Record<TriageTab, number>;
  /** Verdicts reached in this session — the "triados hoje" progress. */
  resolved: number;
}

const TABS: { id: TriageTab; label: string }[] = [
  { id: "soltos", label: "Sem cliente" },
  { id: "duplicados", label: "Duplicados" },
  { id: "ignorados", label: "Ignorados" },
];

/**
 * Glass header for triage (ux-guidelines §1), with the queue tabs and a
 * progress bar.
 *
 * The bar measures this session's decisions against what was pending when it
 * started, so it fills as the attendant works instead of reporting an
 * all-time ratio that never visibly moves against thousands of contacts.
 */
export function TriageHeader({ tab, onTabChange, counts, resolved }: ITriageHeaderProps) {
  const pending = counts.soltos;
  const total = resolved + pending;
  const percent = total === 0 ? 100 : Math.round((resolved / total) * 100);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
      <Button variant="outline" size="sm" asChild className="shrink-0">
        <Link to="/app/agenda">
          <Icon icon="mdi:arrow-left" size={16} />
          Agenda
        </Link>
      </Button>

      <div className="flex min-w-0 shrink-0 items-baseline gap-2">
        <h1 className="text-base font-semibold text-foreground">Triagem</h1>
        <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
          {pending.toLocaleString("pt-BR")} na fila
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
        {TABS.map((option) => {
          const active = tab === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onTabChange(option.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
                active
                  ? "bg-primary/15 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option.label}
              <span
                className={cn(
                  "font-mono text-[11px]",
                  active ? "text-primary" : "text-muted-foreground/70",
                )}
              >
                {counts[option.id].toLocaleString("pt-BR")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex min-w-[190px] shrink-0 items-center gap-2">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da triagem nesta sessão"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {resolved} triados
        </span>
      </div>
    </div>
  );
}
