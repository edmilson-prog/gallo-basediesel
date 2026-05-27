import { SalesKpiRow } from "../SalesKpiRow";
import { SeasonalityCard } from "../SeasonalityCard";
import { RevenueOverTimeChart } from "../charts/RevenueOverTimeChart";
import { CategoryBarChart } from "../charts/CategoryBarChart";
import { VehicleBrandBarChart } from "../charts/VehicleBrandBarChart";
import { ChannelPieChart } from "../charts/ChannelPieChart";
import type { IUseSalesAnalyticsResult } from "../../hooks/useSalesAnalytics";
import type { PartCategory } from "@/shared/types/part-identification";

export interface ISalesOverviewTabProps {
  analytics: IUseSalesAnalyticsResult;
  onCategoryFilter?: (category: PartCategory | "all") => void;
  onBrandFilter?: (brand: string | "all") => void;
}

export function SalesOverviewTab({
  analytics,
  onCategoryFilter,
  onBrandFilter,
}: ISalesOverviewTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <SalesKpiRow kpis={analytics.kpis} isLoading={analytics.isLoading} />

      <SeasonalityCard signal={analytics.seasonality} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevenueOverTimeChart data={analytics.monthlyRevenue} isLoading={analytics.isLoading} />
        <CategoryBarChart
          data={analytics.categoryBreakdown}
          isLoading={analytics.isLoading}
          onCategoryClick={(cat) => {
            if (cat === "outros" || !onCategoryFilter) return;
            onCategoryFilter(cat as PartCategory);
          }}
        />
        <VehicleBrandBarChart
          data={analytics.vehicleBrandBreakdown}
          isLoading={analytics.isLoading}
          onBrandClick={(brand) => onBrandFilter?.(brand)}
        />
        <ChannelPieChart data={analytics.channelBreakdown} isLoading={analytics.isLoading} />
      </div>
    </div>
  );
}
