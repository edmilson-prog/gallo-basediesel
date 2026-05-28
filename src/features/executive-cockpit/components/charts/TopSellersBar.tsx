import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import type { ITopSellerRow } from "../../hooks/useCockpitMetrics";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../../i18n/pt-BR";

export interface ITopSellersBarProps {
  rows: ITopSellerRow[];
  isLoading?: boolean;
  onClick?: () => void;
}

export function TopSellersBar({ rows, isLoading, onClick }: ITopSellersBarProps) {
  const empty = !isLoading && rows.length === 0;
  const interactive = Boolean(onClick);
  return (
    <Card
      className={
        interactive
          ? "flex h-full cursor-pointer flex-col gap-4 p-5 transition-colors hover:border-primary/50 hover:shadow-md"
          : "flex h-full flex-col gap-4 p-5"
      }
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartTopSellers}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartTopSellersHelp}</p>
        </div>
        <Icon icon="mdi:trophy-outline" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatBRLCompact(v)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={110}
              />
              <Tooltip
                cursor={false}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number, _name, props) => [
                  `${formatBRL(value)} • ${props.payload.orderCount} pedidos`,
                  props.payload.name,
                ]}
              />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
