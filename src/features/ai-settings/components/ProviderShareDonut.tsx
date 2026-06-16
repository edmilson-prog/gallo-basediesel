import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AI_PROVIDER_LABELS, type IAiUsageSummary } from "@/shared/types";

// Brand-derived chart tokens (see styles.css --chart-1..5). Never hardcode hex.
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export function ProviderShareDonut({ byProvider }: { byProvider: IAiUsageSummary["byProvider"] }) {
  const data = byProvider.map((p) => ({
    name: AI_PROVIDER_LABELS[p.providerId],
    value: p.costBRL,
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={48}
          outerRadius={78}
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={COLORS[i % COLORS.length] ?? "var(--primary)"} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--popover)",
            fontSize: 12,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
