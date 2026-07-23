import type { ICustomer } from "@/shared/types";
import { MetricsCard } from "../cards/MetricsCard";
import { CadastraisCard } from "../cards/CadastraisCard";
import { StatusWalletCard } from "../cards/StatusWalletCard";
import { TagsCard } from "../cards/TagsCard";
import { PortalCard } from "../cards/PortalCard";

export interface IOverviewTabProps {
  customer: ICustomer;
  /** `column` (default) = lateral panel, 1 column with metrics card.
   *  `page` = dedicated page, 2 columns and metrics hidden (stat strip covers it). */
  variant?: "column" | "page";
  /** Enables the inline cadastral editor (detail page only). */
  cadastraisEditable?: boolean;
  /** Nonce forwarded to the cadastral card to open the editor on demand. */
  cadastraisEditSignal?: number;
}

export function OverviewTab({
  customer,
  variant = "column",
  cadastraisEditable,
  cadastraisEditSignal,
}: IOverviewTabProps) {
  if (variant === "page") {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <CadastraisCard
            customer={customer}
            editable={cadastraisEditable}
            editSignal={cadastraisEditSignal}
          />
        </div>
        <div className="space-y-3">
          <StatusWalletCard customer={customer} />
          <TagsCard customer={customer} />
          <PortalCard customer={customer} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MetricsCard customer={customer} />
      <CadastraisCard
        customer={customer}
        editable={cadastraisEditable}
        editSignal={cadastraisEditSignal}
      />
      <StatusWalletCard customer={customer} />
      <TagsCard customer={customer} />
      <PortalCard customer={customer} />
    </div>
  );
}
