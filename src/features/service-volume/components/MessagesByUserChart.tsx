import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IMessagesByUserResult, MetricAudience } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

const TABS: { value: MetricAudience; label: string }[] = [
  { value: "human", label: S.audienceHuman },
  { value: "automation", label: S.audienceAuto },
  { value: "all", label: S.audienceAll },
];

export interface IMessagesByUserChartProps {
  data?: IMessagesByUserResult;
  audience: MetricAudience;
  onAudience: (a: MetricAudience) => void;
}

export function MessagesByUserChart({ data, audience, onAudience }: IMessagesByUserChartProps) {
  const empty = !data || data.rows.length === 0;
  const chart = (data?.rows ?? []).map((r) => ({ name: r.name, count: r.count }));
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.byUserTitle}</h2>
        <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onAudience(t.value)}
              className={cn("cursor-pointer px-2.5 py-1 transition-colors", audience === t.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="w-full" style={{ height: Math.max(160, chart.length * 40 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
              <Bar dataKey="count" fill="var(--gallo-parts-green, #337648)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
