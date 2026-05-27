import { Link } from "@tanstack/react-router";
import type { IDREPeriod } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { DRE_STRINGS as S } from "../i18n/pt-BR";

export interface IDRECoverageCardProps {
  dre: IDREPeriod;
}

export function DRECoverageCard({ dre }: IDRECoverageCardProps) {
  const pct = dre.cmvCoverage * 100;
  const trackColor = pct >= 90 ? "bg-success" : pct >= 70 ? "bg-warning" : "bg-destructive";

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{S.coverageLabel}</h2>
          <p className="text-xs text-muted-foreground">
            {S.coverageHint(pct, dre.cmvMissingItemsCount)}
          </p>
        </div>
        <Icon icon="mdi:database-search-outline" size={20} className="text-muted-foreground" />
      </header>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-semibold tabular-nums text-foreground">
          {pct.toFixed(0)}%
        </span>
        <span className="pb-1.5 text-xs text-muted-foreground">
          {dre.cmvMissingPartsCount} peças sem custo
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", trackColor)}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
          aria-hidden="true"
        />
      </div>
      {dre.cmvMissingPartsCount > 0 && (
        <Link
          to="/app/catalogo"
          className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Icon icon="mdi:format-list-bulleted" size={12} />
          {S.coverageCtaParts}
        </Link>
      )}
    </Card>
  );
}
