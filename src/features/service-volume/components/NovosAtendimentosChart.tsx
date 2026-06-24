import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { INovosAtendimentosResult } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

export function NovosAtendimentosChart({ data }: { data?: INovosAtendimentosResult }) {
  const empty = !data || data.series.length === 0;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{S.heroTitle}</h2>
          {data && (
            <p className="text-xs text-muted-foreground">
              {S.heroTotal} {data.total} · {S.heroAvg} {data.averagePerDay}/dia
            </p>
          )}
        </div>
        <Icon icon="mdi:chart-bar" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} width={40} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
              />
              <ReferenceLine y={data.averagePerDay} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              <Bar dataKey="value" fill="var(--gallo-parts-green, #337648)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
