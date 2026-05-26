import { SdrSessionsHeatmap } from "../SdrSessionsHeatmap";
import { SdrFaqBarChart } from "../SdrFaqBarChart";
import { SdrEscalationReasonPie } from "../SdrEscalationReasonPie";
import { SdrTtfrBarChart } from "../SdrTtfrBarChart";
import type { ISdrDashboardData } from "../../hooks/useSdrDashboardData";

export interface ISdrMetricsTabProps {
  data: ISdrDashboardData;
  onCellClick?: () => void;
}

export function SdrMetricsTab({ data, onCellClick }: ISdrMetricsTabProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SdrSessionsHeatmap data={data.heatmap} onCellClick={onCellClick} />
      <SdrFaqBarChart data={data.faqBreakdown} />
      <SdrEscalationReasonPie data={data.escalationReasonBreakdown} />
      <SdrTtfrBarChart data={data.ttfrByMode} />
    </div>
  );
}
