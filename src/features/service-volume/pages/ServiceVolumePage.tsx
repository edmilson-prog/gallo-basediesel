import { useState } from "react";
import type { MetricAudience } from "@/shared/types";
import { useServiceVolumeFilters } from "../hooks/useServiceVolumeFilters";
import { useServiceVolumeMetrics } from "../hooks/useServiceVolumeMetrics";
import { ServiceVolumeFilters } from "../components/ServiceVolumeFilters";
import { ServiceVolumeKpis } from "../components/ServiceVolumeKpis";
import { NovosAtendimentosChart } from "../components/NovosAtendimentosChart";
import { MessageVolumeChart } from "../components/MessageVolumeChart";
import { MessagesByUserChart } from "../components/MessagesByUserChart";
import { StatusDistributionDonut } from "../components/StatusDistributionDonut";
import { AccumulatedChatsChart } from "../components/AccumulatedChatsChart";
import { SERVICE_VOLUME_STRINGS } from "../i18n/pt-BR";

export function ServiceVolumePage() {
  const filters = useServiceVolumeFilters();
  const [audience, setAudience] = useState<MetricAudience>("all");
  const m = useServiceVolumeMetrics(filters.state, audience);
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
      <ServiceVolumeKpis
        novos={m.novos.data}
        accumulated={m.accumulated.data}
        handleTime={m.handleTime.data}
        volume={m.volume.data}
        isLoading={isLoading}
      />
      {isEmptyEverywhere && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {SERVICE_VOLUME_STRINGS.prodPlaceholder}
        </div>
      )}
      <NovosAtendimentosChart data={m.novos.data} />
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
