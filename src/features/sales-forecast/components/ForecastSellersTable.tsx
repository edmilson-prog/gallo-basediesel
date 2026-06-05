import type { ForecastMetric, IForecastScenario } from "@/shared/types/forecast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";
import { formatGoalValue } from "@/features/goals/utils/formatGoalValue";
import type { ISellerForecast } from "../hooks/useStoreForecast";

export interface IForecastSellersTableProps {
  rows: ISellerForecast[];
  metric: ForecastMetric;
}

/** The provável scenario is the canonical one shown in the drill-down. */
function provavelScenario(rows: ISellerForecast["forecast"]): IForecastScenario | undefined {
  return rows.scenarios.find((scenario) => scenario.type === "provavel");
}

/** Short, color-independent gap text for the provável scenario. */
function gapText(metric: ForecastMetric, scenario: IForecastScenario | undefined): string {
  if (!scenario || scenario.gapToTarget === undefined) {
    return "Sem meta";
  }
  const gap = scenario.gapToTarget;
  return gap > 0
    ? `Faltam ${formatGoalValue(metric, gap, "compact")}`
    : `${formatGoalValue(metric, -gap, "compact")} acima`;
}

/**
 * Per-seller forecast drill-down (PRD-056). Rows arrive already sorted by the
 * largest provável gap (sellers pulling the store down first). The wide table is
 * shown on `md+`; on mobile it reflows into a stacked card list reusing the same
 * data. The traffic-light badge plus textual gap keep it WCAG-compliant without
 * relying on color alone.
 */
export function ForecastSellersTable({ rows, metric }: IForecastSellersTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Sem vendedores com dados no período.
      </p>
    );
  }

  return (
    <>
      {/* Wide table (md and up). */}
      <Table className="hidden md:table">
        <caption className="sr-only">Forecast por vendedor</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Vendedor</TableHead>
            <TableHead scope="col" className="text-right">
              Realizado
            </TableHead>
            <TableHead scope="col" className="text-right">
              Provável
            </TableHead>
            <TableHead scope="col">Gap</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const scenario = provavelScenario(row.forecast);
            return (
              <TableRow key={row.sellerId}>
                <TableCell className="font-medium text-foreground">{row.sellerName}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {formatGoalValue(metric, row.forecast.realizedValue)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {scenario ? formatGoalValue(metric, scenario.projectedValue) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {scenario && (
                      <GoalStatusBadge mode="progress" value={scenario.status} size="sm" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {gapText(metric, scenario)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Stacked cards (mobile). */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const scenario = provavelScenario(row.forecast);
          return (
            <li
              key={row.sellerId}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{row.sellerName}</span>
                {scenario && <GoalStatusBadge mode="progress" value={scenario.status} size="sm" />}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">Realizado</dt>
                  <dd className="tabular-nums text-foreground">
                    {formatGoalValue(metric, row.forecast.realizedValue)}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">Provável</dt>
                  <dd className="tabular-nums text-foreground">
                    {scenario ? formatGoalValue(metric, scenario.projectedValue) : "—"}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">{gapText(metric, scenario)}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
