import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { IDREPeriod } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { DRE_STRINGS as S } from "../i18n/pt-BR";

const COLORS: Record<string, string> = {
  commissions: "var(--gallo-parts-green, #337648)",
  payroll: "var(--primary)",
  rentInfra: "var(--gallo-industrial-yellow, #C79C2C)",
  other: "var(--gallo-service-red, #C4151C)",
};

const LABELS: Record<string, string> = {
  commissions: S.chartExpensesLegendCommissions,
  payroll: S.chartExpensesLegendPayroll,
  rentInfra: S.chartExpensesLegendRent,
  other: S.chartExpensesLegendOther,
};

export interface IDREExpensesChartProps {
  dre: IDREPeriod;
}

export function DREExpensesChart({ dre }: IDREExpensesChartProps) {
  const data = useMemo(() => {
    const total = dre.totalOperatingExpenses || 1;
    const points = [
      { key: "commissions", value: dre.commissions },
      { key: "payroll", value: dre.payroll },
      { key: "rentInfra", value: dre.rentInfra },
      { key: "other", value: dre.otherExpenses },
    ];
    return points
      .filter((p) => p.value > 0)
      .map((p) => ({
        ...p,
        label: LABELS[p.key],
        share: p.value / total,
      }));
  }, [dre]);

  const empty = data.length === 0;

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartExpensesTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartExpensesHelp}</p>
        </div>
        <Icon icon="mdi:chart-donut" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartExpensesEmpty}</p>
      ) : (
        <div className="flex h-64 flex-col items-center gap-4 sm:flex-row">
          <ResponsiveContainer width="55%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number, _name, props) => [
                  `${formatBRL(value)} (${formatPercent(props.payload.share)})`,
                  props.payload.label,
                ]}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={COLORS[entry.key] ?? "var(--primary)"} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <ul className="flex flex-1 flex-col gap-2 text-xs">
            {data.map((entry) => (
              <li key={entry.key} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: COLORS[entry.key] ?? "var(--primary)" }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-foreground">{entry.label}</span>
                <span className="font-medium text-muted-foreground">
                  {formatPercent(entry.share)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
