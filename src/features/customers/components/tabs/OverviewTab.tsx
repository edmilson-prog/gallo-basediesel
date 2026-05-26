import type { ICustomer } from "@/shared/types";
import { MetricsCard } from "../cards/MetricsCard";
import { CadastraisCard } from "../cards/CadastraisCard";
import { StatusWalletCard } from "../cards/StatusWalletCard";
import { TagsCard } from "../cards/TagsCard";
import { PortalCard } from "../cards/PortalCard";

export interface IOverviewTabProps {
  customer: ICustomer;
}

/** Default tab — stacks the five cards in a single column. */
export function OverviewTab({ customer }: IOverviewTabProps) {
  return (
    <div className="space-y-3">
      <MetricsCard customer={customer} />
      <CadastraisCard customer={customer} />
      <StatusWalletCard customer={customer} />
      <TagsCard customer={customer} />
      <PortalCard customer={customer} />
    </div>
  );
}
