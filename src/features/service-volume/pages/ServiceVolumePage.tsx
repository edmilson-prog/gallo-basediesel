import { useServiceVolumeFilters } from "../hooks/useServiceVolumeFilters";
import { useServiceVolumeMetrics } from "../hooks/useServiceVolumeMetrics";
import { ServiceVolumeFilters } from "../components/ServiceVolumeFilters";
import { ServiceVolumeKpis } from "../components/ServiceVolumeKpis";
import { NovosAtendimentosChart } from "../components/NovosAtendimentosChart";

export function ServiceVolumePage() {
  const filters = useServiceVolumeFilters();
  const m = useServiceVolumeMetrics(filters.state, "all");
  const isLoading = m.novos.isLoading || m.accumulated.isLoading || m.handleTime.isLoading || m.volume.isLoading;
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
    </div>
  );
}
