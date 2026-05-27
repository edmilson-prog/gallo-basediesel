import { KpiCard } from "@/features/manager-dashboard/components/KpiCard";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import type { IGoalsStatistics } from "../hooks/useGoalsStatistics";

export interface IGoalKpiRowProps {
  stats: IGoalsStatistics;
}

export function GoalKpiRow({ stats }: IGoalKpiRowProps) {
  return (
    <section
      aria-label="Indicadores de metas"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <KpiCard
        label={S.kpiTotalActive}
        shortLabel={S.kpiTotalActive}
        icon="mdi:target"
        value={stats.totalActive}
        helpText={S.kpiTotalActiveHelp}
        isLoading={stats.isLoading}
      />
      <KpiCard
        label={S.kpiAveragePct}
        shortLabel="% média"
        icon="mdi:percent-outline"
        value={stats.averagePercentage}
        formatValue={(v) => `${v}%`}
        helpText={S.kpiAveragePctHelp}
        isLoading={stats.isLoading}
      />
      <KpiCard
        label={S.kpiHeroes}
        shortLabel="Heroes"
        icon="mdi:trophy-outline"
        value={stats.heroesCount}
        helpText={S.kpiHeroesHelp}
        isLoading={stats.isLoading}
      />
      <KpiCard
        label={S.kpiAttention}
        shortLabel="Atenção"
        icon="mdi:alert-circle-outline"
        value={stats.attentionCount}
        helpText={S.kpiAttentionHelp}
        isLoading={stats.isLoading}
      />
    </section>
  );
}
