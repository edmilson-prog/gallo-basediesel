import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { ID, IIndicatorContributor, IndicatorMetric } from "@/shared/types";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { formatByMetric } from "../utils/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IContributionRankingProps {
  contributors: IIndicatorContributor[]; // already sorted desc by value (from the engine)
  metric: IndicatorMetric;
  /** Resolve a sellerId to a display name. */
  sellerName: (sellerId: ID) => string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContributionRanking({
  contributors,
  metric,
  sellerName,
}: IContributionRankingProps) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.contribution}
          </h2>
          <p className="text-xs text-muted-foreground">
            Participação de cada vendedor no resultado do indicador.
          </p>
        </div>
        <Icon icon="mdi:podium-gold" size={20} className="text-muted-foreground" />
      </header>

      {contributors.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.noContributions}</p>
      ) : (
        <>
          {/* Accessible hidden table for screen readers */}
          <table className="sr-only" aria-label={S.contribution}>
            <thead>
              <tr>
                <th scope="col">Vendedor</th>
                <th scope="col">Valor</th>
                <th scope="col">Participação</th>
              </tr>
            </thead>
            <tbody>
              {contributors.map((c) => {
                const name = sellerName(c.sellerId);
                const formattedValue = formatByMetric(metric, c.value, "full");
                const pct = Math.round(c.share * 100);
                return (
                  <tr key={c.sellerId}>
                    <td>{name}</td>
                    <td>{formattedValue}</td>
                    <td>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Visual ranking bars */}
          <ol className="flex flex-col gap-3" aria-hidden="true">
            {contributors.map((c, idx) => {
              const name = sellerName(c.sellerId);
              const formattedValue = formatByMetric(metric, c.value, "compact");
              const pct = Math.round(c.share * 100);
              const barWidth = `${Math.max(c.share * 100, 2)}%`;
              const ariaLabel = `${name}: ${formatByMetric(metric, c.value, "full")} (${pct}%)`;

              return (
                <li key={c.sellerId} className="flex flex-col gap-1" aria-label={ariaLabel}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    {/* Rank badge + seller name */}
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium text-foreground">{name}</span>
                    </div>

                    {/* Value + share */}
                    <div className="flex shrink-0 items-center gap-2 text-right">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formattedValue}
                      </span>
                      <span className="min-w-[2.75rem] text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </div>

                  {/* Horizontal progress bar */}
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="presentation"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: barWidth }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Card>
  );
}
