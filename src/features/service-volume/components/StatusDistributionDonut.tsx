import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ConversationStatus, IStatusDistributionResult } from "@/shared/types";
import { INBOX_STRINGS } from "@/features/conversations/i18n/pt-BR";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

const STATUS_COLOR: Record<ConversationStatus, string> = {
  aguardando: "var(--color-severity-warning)",
  em_andamento: "var(--primary)",
  aguardando_cliente: "var(--color-severity-info)",
  resolvida: "var(--color-severity-success)",
  arquivada: "var(--muted-foreground)",
};

export interface IStatusDistributionDonutProps {
  data?: IStatusDistributionResult;
  compact?: boolean;
}

export function StatusDistributionDonut({ data, compact = false }: IStatusDistributionDonutProps) {
  const navigate = useNavigate();
  const empty = !data || data.total === 0;
  const slices = data?.slices ?? [];

  const onSlice = (status: ConversationStatus) => {
    void navigate({ to: "/app/atendimento", search: { status } as never });
  };

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="status"
          innerRadius={compact ? 28 : 44}
          outerRadius={compact ? 44 : 70}
          paddingAngle={2}
        >
          {slices.map((s) => (
            <Cell
              key={s.status}
              fill={STATUS_COLOR[s.status]}
              className="cursor-pointer"
              onClick={() => onSlice(s.status)}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            fontSize: 12,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );

  const legend = (
    <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {slices.map((s) => (
        <li key={s.status}>
          <button
            type="button"
            onClick={() => onSlice(s.status)}
            className={cn(
              "flex cursor-pointer items-center gap-2",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm",
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: STATUS_COLOR[s.status] }}
            />
            {INBOX_STRINGS.statusOptions[s.status]} · {s.count} ·{" "}
            {data ? Math.round((s.count / data.total) * 100) : 0}%
          </button>
        </li>
      ))}
    </ul>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-24 w-24 shrink-0">{empty ? null : chart}</div>
        {empty ? <p className="text-xs text-muted-foreground">{S.empty}</p> : legend}
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.statusTitle}</h2>
        <Icon icon="mdi:chart-donut" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="h-40 w-40 shrink-0">{chart}</div>
          {legend}
        </div>
      )}
    </Card>
  );
}
