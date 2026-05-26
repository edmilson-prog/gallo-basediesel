import { SdrKpiCard } from "../SdrKpiCard";
import { SdrVolumeChart } from "../SdrVolumeChart";
import { SdrFinishReasonPie } from "../SdrFinishReasonPie";
import type { ISdrDashboardData } from "../../hooks/useSdrDashboardData";

export interface ISdrOverviewTabProps {
  data: ISdrDashboardData;
}

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

export function SdrOverviewTab({ data }: ISdrOverviewTabProps) {
  return (
    <div className="space-y-6">
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Indicadores principais do SDR"
      >
        <SdrKpiCard
          label="Sessões atendidas"
          helpText="Total de sessões do SDR no período."
          icon="mdi:robot-happy-outline"
          value={data.totalSessions.current}
          changePct={data.totalSessions.changePct}
          lowerIsBetter={false}
          isLoading={data.loading}
        />
        <SdrKpiCard
          label="Taxa de escalação"
          helpText="% de sessões transferidas para vendedores humanos."
          icon="mdi:account-arrow-right-outline"
          value={data.escalationRate.current}
          formatValue={formatPercent}
          changePct={data.escalationRate.changePct}
          lowerIsBetter
          isLoading={data.loading}
        />
        <SdrKpiCard
          label="Aceite de orçamento"
          helpText="% de orçamentos gerados pelo SDR que foram aceitos."
          icon="mdi:check-decagram-outline"
          value={data.acceptanceRate.current}
          formatValue={formatPercent}
          changePct={data.acceptanceRate.changePct}
          isLoading={data.loading}
        />
        <SdrKpiCard
          label="TTFR médio"
          helpText="Tempo médio até a primeira resposta humana após escalação."
          icon="mdi:timer-outline"
          value={data.ttfrSeconds.current}
          formatValue={formatSeconds}
          changePct={data.ttfrSeconds.changePct}
          lowerIsBetter
          isLoading={data.loading}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Volume e desfechos">
        <SdrVolumeChart data={data.dailyVolume} isLoading={data.loading} />
        <SdrFinishReasonPie data={data.finishReasonBreakdown} isLoading={data.loading} />
      </section>
    </div>
  );
}
