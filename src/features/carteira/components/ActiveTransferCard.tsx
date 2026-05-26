import { useState } from "react";
import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { SellerRoute } from "./SellerRoute";
import { TransferTypeBadge } from "./TransferTypeBadge";
import { CustomerListModal } from "./CustomerListModal";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { formatDate, formatDateTime, formatPeriod, timeUntil } from "../utils/formatters";

export interface IActiveTransferCardProps {
  transfer: ICarteiraTransfer;
  sellersById: Map<ID, ISeller>;
  canRevert: boolean;
  onRevert: (transfer: ICarteiraTransfer) => void;
}

export function ActiveTransferCard({
  transfer,
  sellersById,
  canRevert,
  onRevert,
}: IActiveTransferCardProps) {
  const [openList, setOpenList] = useState(false);
  const count = transfer.customerIds.length;
  const isTemporary = transfer.type === "temporary";
  const timeLeft = isTemporary ? timeUntil(transfer.autoRevertAt) : undefined;
  const createdBy = sellersById.get(transfer.createdBy)?.fullName ?? transfer.createdBy;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TransferTypeBadge type={transfer.type} />
          {isTemporary && (
            <Badge variant="outline" className="gap-1">
              <Icon icon="mdi:clock-outline" size={12} />
              {CARTEIRA_STRINGS.active.timeLeft(timeLeft ?? "—")}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpenList(true)}
            className="gap-1"
          >
            <Icon icon="mdi:account-multiple-outline" size={14} />
            {CARTEIRA_STRINGS.active.viewCustomers(count)}
          </Button>
          {canRevert && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRevert(transfer)}
              className="gap-1"
            >
              <Icon icon="mdi:undo" size={14} />
              {CARTEIRA_STRINGS.active.revertNow}
            </Button>
          )}
        </div>
      </div>

      <SellerRoute
        fromSellerId={transfer.fromSellerId}
        toSellerId={transfer.toSellerId}
        sellersById={sellersById}
      />

      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        {isTemporary && (
          <div>
            <dt className="text-muted-foreground">{CARTEIRA_STRINGS.active.period}</dt>
            <dd className="font-medium text-foreground">
              {formatPeriod(transfer.startDate, transfer.endDate)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">{CARTEIRA_STRINGS.active.reason}</dt>
          <dd className="font-medium text-foreground">{transfer.reason || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{CARTEIRA_STRINGS.active.executedBy}</dt>
          <dd className="font-medium text-foreground">{createdBy}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{CARTEIRA_STRINGS.active.executedAt}</dt>
          <dd className="font-medium text-foreground">{formatDateTime(transfer.createdAt)}</dd>
        </div>
        {isTemporary && transfer.autoRevertAt && (
          <div>
            <dt className="text-muted-foreground">{CARTEIRA_STRINGS.active.expiresIn}</dt>
            <dd className="font-medium text-foreground">{formatDate(transfer.autoRevertAt)}</dd>
          </div>
        )}
      </dl>

      <CustomerListModal
        open={openList}
        customerIds={transfer.customerIds}
        onClose={() => setOpenList(false)}
      />
    </Card>
  );
}
