import { TopCustomersTable } from "../tables/TopCustomersTable";
import { NewVsRecurringCard } from "../NewVsRecurringCard";
import type { IUseSalesAnalyticsResult } from "../../hooks/useSalesAnalytics";

export interface ISalesCustomersTabProps {
  analytics: IUseSalesAnalyticsResult;
}

export function SalesCustomersTab({ analytics }: ISalesCustomersTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <NewVsRecurringCard data={analytics.newVsRecurring} />
      <TopCustomersTable rows={analytics.topCustomers} isLoading={analytics.isLoading} />
    </div>
  );
}
