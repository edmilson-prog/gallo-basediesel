import { TopProductsTable } from "../tables/TopProductsTable";
import { CategoryBarChart } from "../charts/CategoryBarChart";
import { ProductsInDeclineCard } from "../ProductsInDeclineCard";
import type { IUseSalesAnalyticsResult } from "../../hooks/useSalesAnalytics";
import type { PartCategory } from "@/shared/types/part-identification";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface ISalesProductsTabProps {
  analytics: IUseSalesAnalyticsResult;
  onCategoryFilter?: (category: PartCategory | "all") => void;
}

export function SalesProductsTab({ analytics, onCategoryFilter }: ISalesProductsTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <TopProductsTable rows={analytics.topProducts} isLoading={analytics.isLoading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <h3 className="sr-only">{S.productsCategoryPerformance}</h3>
          <CategoryBarChart
            data={analytics.categoryBreakdown}
            isLoading={analytics.isLoading}
            onCategoryClick={(cat) => {
              if (cat === "outros" || !onCategoryFilter) return;
              onCategoryFilter(cat as PartCategory);
            }}
          />
        </section>
        <ProductsInDeclineCard rows={analytics.productsInDecline} />
      </div>
    </div>
  );
}
