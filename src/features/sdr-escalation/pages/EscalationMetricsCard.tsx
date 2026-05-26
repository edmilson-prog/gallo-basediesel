import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useEscalationMetrics,
  type IEscalationMetricsFilters,
} from "../hooks/useEscalationMetrics";

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0%";
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

interface IEscalationMetricsCardProps {
  filters?: IEscalationMetricsFilters;
  className?: string;
}

/**
 * Self-contained card that surfaces the four core escalation metrics (PRD-023
 * RF-021). Designed to be composed into PRD-014 (Painel Gestor) and PRD-024
 * (Painel SDR) once those routes ship; usable on its own for early visibility.
 */
export function EscalationMetricsCard({ filters, className }: IEscalationMetricsCardProps) {
  const metrics = useEscalationMetrics(filters);
  const items = useMemo(
    () => [
      {
        label: "Total de escalações",
        value: metrics.total.toString(),
        icon: "mdi:counter",
      },
      {
        label: "TTFR médio",
        value: formatSeconds(metrics.averageTimeToFirstResponseSeconds),
        icon: "mdi:timer-outline",
      },
      {
        label: "Taxa de resposta",
        value: formatPercent(metrics.answerRate),
        icon: "mdi:account-check-outline",
      },
      {
        label: "Taxa de abandono",
        value: formatPercent(metrics.abandonRate),
        icon: "mdi:account-off-outline",
      },
      {
        label: "Acerto de especialidade",
        value: formatPercent(metrics.specialtyHitRate),
        icon: "mdi:target",
      },
      {
        label: "Modo urgente",
        value: metrics.byMode.urgent.toString(),
        icon: "mdi:alert-octagon",
      },
    ],
    [metrics],
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Escalações SDR → Humano</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            <Icon icon={item.icon} size={20} className="mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-lg font-semibold text-foreground">{item.value}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
