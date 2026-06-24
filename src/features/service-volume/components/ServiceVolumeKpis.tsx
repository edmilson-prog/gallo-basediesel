import { KpiCard } from "@/features/manager-dashboard/components/KpiCard";
import type { ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import { formatHandleTime } from "../engine";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";
import type {
  INovosAtendimentosResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
  IMessageVolumeResult,
} from "@/shared/types";

function trendFromDelta(deltaPct: number | null): ITrendInfo | undefined {
  if (deltaPct === null) return undefined;
  if (deltaPct === 0) return { direction: "flat", changePct: 0, isImprovement: false };
  const direction = deltaPct > 0 ? "up" : "down";
  return { direction, changePct: deltaPct, isImprovement: deltaPct > 0 };
}

export interface IServiceVolumeKpisProps {
  novos?: INovosAtendimentosResult;
  accumulated?: IAccumulatedChatsResult;
  handleTime?: IHandleTimeStatsResult;
  volume?: IMessageVolumeResult;
  isLoading: boolean;
}

export function ServiceVolumeKpis({ novos, accumulated, handleTime, volume, isLoading }: IServiceVolumeKpisProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de volume">
      <KpiCard
        label={S.kpiNovosHelp}
        shortLabel={S.kpiNovos}
        icon="mdi:message-plus-outline"
        value={novos?.total ?? null}
        helpText={S.kpiNovosHelp}
        isLoading={isLoading}
        trend={trendFromDelta(novos?.deltaPct ?? null)}
      />
      <KpiCard
        label="Total na loja"
        shortLabel={S.kpiAcumulados}
        icon="mdi:message-text-outline"
        value={accumulated?.total ?? null}
        helpText="Total de conversas acumuladas no escopo"
        isLoading={isLoading}
      />
      <KpiCard
        label={S.kpiTempoHelp}
        shortLabel={S.kpiTempo}
        icon="mdi:clock-outline"
        value={handleTime?.averageMs ?? null}
        formatValue={(v) => formatHandleTime(v)}
        helpText={S.kpiTempoHelp}
        isLoading={isLoading}
      />
      <KpiCard
        label="Enviadas + recebidas"
        shortLabel={S.kpiMensagens}
        icon="mdi:swap-horizontal"
        value={volume ? volume.totalSent + volume.totalReceived : null}
        helpText="Mensagens trocadas no período"
        isLoading={isLoading}
      />
    </section>
  );
}
