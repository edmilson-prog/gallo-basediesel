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
