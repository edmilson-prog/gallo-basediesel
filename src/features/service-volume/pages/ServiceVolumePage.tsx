import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, MetricAudience } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useManagerDashboardSettings } from "@/features/manager-dashboard/hooks/useManagerDashboardSettings";
import { KpiCard } from "@/features/manager-dashboard/components/KpiCard";
import { useServiceVolumeFilters } from "../hooks/useServiceVolumeFilters";
import { useServiceVolumeMetrics } from "../hooks/useServiceVolumeMetrics";
import { useCargaEVolumeSnapshot } from "../hooks/useCargaEVolumeSnapshot";
import { useSellerLoad } from "../hooks/useSellerLoad";
import { useVolumeHeatmap } from "../hooks/useVolumeHeatmap";
import { useKpis } from "../hooks/useKpis";
import { ServiceVolumeFilters } from "../components/ServiceVolumeFilters";
import { ServiceVolumeKpis } from "../components/ServiceVolumeKpis";
import { NovosAtendimentosChart } from "../components/NovosAtendimentosChart";
import { MessageVolumeChart } from "../components/MessageVolumeChart";
import { MessagesByUserChart } from "../components/MessagesByUserChart";
import { StatusDistributionDonut } from "../components/StatusDistributionDonut";
import { AccumulatedChatsChart } from "../components/AccumulatedChatsChart";
import { SellerLoadList } from "../components/SellerLoadList";
import { VolumeHeatmap } from "../components/VolumeHeatmap";
import { SERVICE_VOLUME_STRINGS } from "../i18n/pt-BR";

function formatMinutes(value: number): string {
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

export interface IServiceVolumePageProps {
  /** Locks the tab's store scope to the Gestor's own store. */
  gestorLockedStoreId?: ID;
}

export function ServiceVolumePage({ gestorLockedStoreId }: IServiceVolumePageProps = {}) {
  const navigate = useNavigate();
  const { currentStore } = useCurrentStore();
  const filters = useServiceVolumeFilters({ gestorLockedStoreId });
  const [audience, setAudience] = useState<MetricAudience>("all");
  const m = useServiceVolumeMetrics(filters.state, audience);
  const carga = useCargaEVolumeSnapshot(filters.state);
  const settings = useManagerDashboardSettings(currentStore?.id ?? null);
  const sellerLoad = useSellerLoad(carga.snapshot, {
    overloadThreshold: settings.settings.sellerOverloadThreshold,
  });
  const heatmap = useVolumeHeatmap(carga.snapshot);
  const kpis = useKpis(carga.snapshot);
  const cargaHasError = Boolean(carga.error) && !carga.isLoading;
  const goToInbox = (params: Record<string, string>) =>
    void navigate({ to: "/app/atendimento", search: params });
  const isLoading =
    m.novos.isLoading ||
    m.accumulated.isLoading ||
    m.handleTime.isLoading ||
    m.volume.isLoading ||
    m.byUser.isLoading ||
    m.status.isLoading;
  const isEmptyEverywhere =
    !isLoading &&
    (m.novos.data?.total ?? 0) === 0 &&
    (m.status.data?.total ?? 0) === 0 &&
    (m.volume.data ? m.volume.data.totalSent + m.volume.data.totalReceived : 0) === 0;
  return (
    <div className="space-y-6">
      <ServiceVolumeFilters
        granularity={filters.state.granularity}
        period={filters.state.period}
        onGranularity={filters.setGranularity}
        onPeriod={filters.setPeriod}
      />
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Indicadores principais"
      >
        <KpiCard
          icon="mdi:timer-sand"
          label={SERVICE_VOLUME_STRINGS.kpiTmaLabel}
          shortLabel={SERVICE_VOLUME_STRINGS.kpiTmaShort}
          helpText={SERVICE_VOLUME_STRINGS.kpiTmaHelp}
          value={kpis.tmaMinutes.current}
          formatValue={formatMinutes}
          trend={kpis.tmaMinutes.trend}
          isLoading={carga.isLoading}
          hasError={cargaHasError}
          onRetry={() => void carga.refetch()}
          onClick={() => goToInbox({ status: "resolvida" })}
        />
        <KpiCard
          icon="mdi:reply-outline"
          label={SERVICE_VOLUME_STRINGS.kpiTmrLabel}
          shortLabel={SERVICE_VOLUME_STRINGS.kpiTmrShort}
          helpText={SERVICE_VOLUME_STRINGS.kpiTmrHelp}
          value={kpis.tmrMinutes.current}
          formatValue={formatMinutes}
          trend={kpis.tmrMinutes.trend}
          isLoading={carga.isLoading}
          hasError={cargaHasError}
          onRetry={() => void carga.refetch()}
          onClick={() => goToInbox({ status: "em_andamento" })}
        />
        <KpiCard
          icon="mdi:check-circle-outline"
          label={SERVICE_VOLUME_STRINGS.kpiResolutionLabel}
          shortLabel={SERVICE_VOLUME_STRINGS.kpiResolutionShort}
          helpText={SERVICE_VOLUME_STRINGS.kpiResolutionHelp}
          value={kpis.resolutionRatePct.current}
          formatValue={formatPercent}
          trend={kpis.resolutionRatePct.trend}
          isLoading={carga.isLoading}
          hasError={cargaHasError}
          onRetry={() => void carga.refetch()}
          onClick={() => goToInbox({ status: "resolvida" })}
        />
        <KpiCard
          icon="mdi:inbox-arrow-down-outline"
          label={SERVICE_VOLUME_STRINGS.kpiBacklogLabel}
          shortLabel={SERVICE_VOLUME_STRINGS.kpiBacklogShort}
          helpText={SERVICE_VOLUME_STRINGS.kpiBacklogHelp}
          value={kpis.backlog.current}
          isLoading={carga.isLoading}
          hasError={cargaHasError}
          onRetry={() => void carga.refetch()}
          onClick={() => goToInbox({ status: "aguardando" })}
        />
      </section>
      <ServiceVolumeKpis
        novos={m.novos.data}
        accumulated={m.accumulated.data}
        handleTime={m.handleTime.data}
        volume={m.volume.data}
        isLoading={isLoading}
      />
      {isEmptyEverywhere && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {SERVICE_VOLUME_STRINGS.emptyAll}
        </div>
      )}
      <NovosAtendimentosChart data={m.novos.data} />
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Carga e volume">
        <SellerLoadList
          entries={sellerLoad}
          overloadThreshold={settings.settings.sellerOverloadThreshold}
          isLoading={carga.isLoading}
          onSellerClick={(sellerId) =>
            void navigate({
              to: "/app/atendimento",
              search: { assignment: sellerId, status: "em_andamento" },
            })
          }
        />
        <VolumeHeatmap
          data={heatmap}
          isLoading={carga.isLoading}
          onCellClick={(day, hour) => {
            const now = new Date();
            const offsetToTarget = day - now.getDay();
            const target = new Date(now);
            target.setDate(now.getDate() + offsetToTarget);
            target.setHours(hour, 0, 0, 0);
            void navigate({
              to: "/app/atendimento",
              search: {
                period: "30d",
                q: `${target.toISOString().slice(0, 10)} ${hour}h-${hour + 1}h`,
              },
            });
          }}
        />
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MessageVolumeChart data={m.volume.data} />
        <MessagesByUserChart data={m.byUser.data} audience={audience} onAudience={setAudience} />
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDistributionDonut data={m.status.data} />
        <AccumulatedChatsChart data={m.accumulated.data} />
      </section>
    </div>
  );
}
