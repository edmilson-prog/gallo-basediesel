import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ISellerWalletRow } from "../hooks/useWalletStats";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { formatDate } from "../utils/formatters";
import { sellerRoleLabel, sellerShortName } from "../utils/sellerDisplay";

/** Same thresholds the board's risk dot uses, so the two never disagree. */
const RISK_CRITICAL = 0.15;

export interface ISellerWalletModalProps {
  row: ISellerWalletRow | null;
  /** Coverage taking this seller's wallet away, when there is one. */
  coveredBy?: ICarteiraTransfer;
  sellersById: Map<ID, ISeller>;
  /** Permanent changes in the visible 30-day window, for the movement line. */
  recentChanges: ICarteiraTransfer[];
  canManage: boolean;
  onClose: () => void;
  onCover: (row: ISellerWalletRow) => void;
  onViewCustomers: (row: ISellerWalletRow) => void;
  onHandWallet: () => void;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5">
      <div
        className={cn(
          "font-display text-xl font-extrabold leading-none",
          tone ?? "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * A seller's wallet in detail. Opened from the board row, so it answers the
 * follow-up question the row raises ("412 customers — how are they doing?")
 * without navigating away from the page.
 */
export function SellerWalletModal({
  row,
  coveredBy,
  sellersById,
  recentChanges,
  canManage,
  onClose,
  onCover,
  onViewCustomers,
  onHandWallet,
}: ISellerWalletModalProps) {
  const strings = CARTEIRA_STRINGS.sellerModal;
  if (!row) return null;

  const received = recentChanges
    .filter((t) => t.toSellerId === row.sellerId)
    .reduce((sum, t) => sum + t.customerIds.length, 0);
  const handedOver = recentChanges
    .filter((t) => t.fromSellerId === row.sellerId)
    .reduce((sum, t) => sum + t.customerIds.length, 0);
  const net = received - handedOver;

  const staleTone =
    row.customers > 0 && row.stale / row.customers >= RISK_CRITICAL
      ? "text-severity-critical"
      : "text-severity-warning";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:briefcase-outline" size={18} className="text-primary" />
            {sellerShortName(row.seller.fullName)}
          </DialogTitle>
          <DialogDescription>{sellerRoleLabel(row.seller)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Stat label={strings.walletCustomers} value={row.customers} />
          <Stat label={strings.positivados} value={row.positivados} tone="text-severity-success" />
          <Stat label={strings.stale} value={row.stale} tone={staleTone} />
        </div>

        <div className="rounded-lg border border-border bg-foreground/[0.03] px-3.5 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
            {strings.movementTitle}
          </div>
          <div className="flex flex-wrap items-center gap-5 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-foreground/70">
              <Icon icon="mdi:arrow-bottom-left" size={14} className="text-severity-success" />
              {strings.received} <b className="font-semibold text-foreground">{received}</b>
            </span>
            <span className="inline-flex items-center gap-1.5 text-foreground/70">
              <Icon icon="mdi:arrow-top-right" size={14} className="text-severity-warning" />
              {strings.handedOver} <b className="font-semibold text-foreground">{handedOver}</b>
            </span>
            <span
              className={cn(
                "ml-auto font-bold",
                net >= 0 ? "text-severity-success" : "text-severity-warning",
              )}
            >
              {strings.net(net)}
            </span>
          </div>
        </div>

        {coveredBy && (
          <div className="flex gap-2.5 rounded-lg border border-severity-warning/40 bg-severity-warning/10 px-3.5 py-3">
            <Icon icon="mdi:clock-outline" size={16} className="shrink-0 text-severity-warning" />
            <span className="text-[12.5px] leading-relaxed text-foreground/70">
              {strings.awayNotice(
                coveredBy.reason || "cobertura",
                formatDate(coveredBy.endDate),
                sellersById.get(coveredBy.toSellerId)?.fullName ?? "—",
              )}
            </span>
          </div>
        )}

        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="outline" size="sm" onClick={() => onViewCustomers(row)}>
            <Icon icon="mdi:account-multiple-outline" size={14} />
            {strings.viewCustomers}
          </Button>
          {canManage && !coveredBy && (
            <Button type="button" variant="outline" size="sm" onClick={() => onCover(row)}>
              {CARTEIRA_STRINGS.wallet.registerCoverage}
            </Button>
          )}
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onHandWallet}
              title={CARTEIRA_STRINGS.page.transferCustomersHint}
            >
              {strings.handWallet}
              <Icon icon="mdi:open-in-new" size={12} />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
