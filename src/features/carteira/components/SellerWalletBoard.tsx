import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ISellerWalletRow } from "../hooks/useWalletStats";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { formatDate } from "../utils/formatters";
import {
  sellerFirstName,
  sellerInitials,
  sellerRoleLabel,
  sellerShortName,
} from "../utils/sellerDisplay";

/** Share of a wallet sitting stale above which the dot turns red / amber. */
const RISK_CRITICAL = 0.15;
const RISK_WARNING = 0.08;

/**
 * Five columns, one grid definition, reused by the header and every row so the
 * labels stay glued to their values at any width.
 */
const GRID =
  "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_7rem_minmax(0,1fr)_auto] items-center gap-4";

function riskToneClass(stale: number, customers: number): string {
  if (customers === 0) return "bg-muted-foreground/40";
  const ratio = stale / customers;
  if (ratio >= RISK_CRITICAL) return "bg-severity-critical";
  if (ratio >= RISK_WARNING) return "bg-severity-warning";
  return "bg-severity-success";
}

interface ISellerWalletRowProps {
  row: ISellerWalletRow;
  /** Coverage this seller is the titular of — their wallet is on loan. */
  coveredBy?: { transfer: ICarteiraTransfer; seller: ISeller | undefined };
  /** Coverage this seller is standing in for. */
  coveringFor?: { transfer: ICarteiraTransfer; seller: ISeller | undefined };
  canManage: boolean;
  onOpen: (row: ISellerWalletRow) => void;
  onCover: (row: ISellerWalletRow) => void;
}

function SellerWalletRowItem({
  row,
  coveredBy,
  coveringFor,
  canManage,
  onOpen,
  onCover,
}: ISellerWalletRowProps) {
  const { seller } = row;
  const isAway = Boolean(coveredBy);
  const strings = CARTEIRA_STRINGS.wallet;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={cn(
        GRID,
        "group cursor-pointer border-t border-border px-3.5 py-2.5 transition-colors first:border-t-0",
        "hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035] focus-visible:outline-none",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className={cn("h-8 w-8 rounded-lg", isAway && "opacity-60")}>
          {seller.avatarUrl ? <AvatarImage src={seller.avatarUrl} alt="" /> : null}
          <AvatarFallback className="rounded-lg bg-primary/15 text-[11px] font-bold text-primary">
            {sellerInitials(seller.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div
            className={cn(
              "truncate text-sm font-semibold",
              isAway ? "text-muted-foreground" : "text-foreground",
            )}
            title={seller.fullName}
          >
            {sellerShortName(seller.fullName)}
          </div>
          <div className="truncate text-[11px] text-muted-foreground/70">
            {sellerRoleLabel(seller)}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[17px] font-extrabold tabular-nums text-foreground">
            {row.customers}
          </span>
          <span className="truncate text-[11px] text-muted-foreground/70">
            {strings.customersWithShare(row.customers, row.share)}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
          <div
            className={cn("h-full rounded-full", isAway ? "bg-muted-foreground/50" : "bg-primary")}
            style={{ width: `${Math.round(row.relative * 100)}%` }}
          />
        </div>
      </div>

      <div title={strings.staleTooltip(row.stale)}>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-[7px] shrink-0 rounded-full",
              riskToneClass(row.stale, row.customers),
            )}
          />
          <span className="text-[13px] font-semibold tabular-nums text-foreground">
            {row.stale}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground/70">{strings.staleLabel}</div>
      </div>

      <div className="min-w-0">
        {coveredBy ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge
              variant="outline"
              className="shrink-0 gap-1 border-severity-warning/40 bg-severity-warning/10 text-[10px] uppercase tracking-wide text-severity-warning"
            >
              <Icon icon="mdi:airplane" size={11} />
              {coveredBy.transfer.reason || "Cobertura"}
            </Badge>
            <span className="truncate text-xs text-foreground/70">
              {strings.coveredBy(
                coveredBy.seller ? sellerFirstName(coveredBy.seller.fullName) : "—",
                formatDate(coveredBy.transfer.endDate),
              )}
            </span>
          </div>
        ) : coveringFor ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge
              variant="outline"
              className="shrink-0 gap-1 border-severity-info/40 bg-severity-info/10 text-[10px] uppercase tracking-wide text-severity-info"
            >
              <Icon icon="mdi:hand-heart-outline" size={11} />
              {strings.covering}
            </Badge>
            <span className="truncate text-xs text-foreground/70">
              {strings.coveringFor(
                coveringFor.transfer.customerIds.length,
                coveringFor.seller ? sellerFirstName(coveringFor.seller.fullName) : "—",
              )}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/70">{strings.ownWallet}</span>
        )}
      </div>

      <div
        className="flex items-center gap-1 opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        {canManage && !coveringFor && (
          <Button type="button" variant="outline" size="sm" onClick={() => onCover(row)}>
            {isAway ? strings.viewCoverage : strings.registerCoverage}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={strings.sellerActions(sellerShortName(seller.fullName))}
          onClick={() => onOpen(row)}
        >
          <Icon icon="mdi:dots-vertical" size={16} />
        </Button>
      </div>
    </div>
  );
}

export interface ISellerWalletBoardProps {
  rows: ISellerWalletRow[];
  unassigned: number;
  /** Active temporary coverages, indexed by the seller each one takes FROM. */
  coverageByTitular: Map<ID, ICarteiraTransfer>;
  sellersById: Map<ID, ISeller>;
  isLoading: boolean;
  isError: boolean;
  canManage: boolean;
  onOpenSeller: (row: ISellerWalletRow) => void;
  onCoverSeller: (row: ISellerWalletRow) => void;
  onDistributeUnassigned: () => void;
}

/**
 * The wallet itself, one seller per line: how many customers, what slice of the
 * base that is, how many have gone quiet, and whether the wallet is currently
 * their own. This is what answers "como está a carteira" without leaving the
 * screen — the transfer log below it is the consequence, not the subject.
 */
export function SellerWalletBoard({
  rows,
  unassigned,
  coverageByTitular,
  sellersById,
  isLoading,
  isError,
  canManage,
  onOpenSeller,
  onCoverSeller,
  onDistributeUnassigned,
}: ISellerWalletBoardProps) {
  const strings = CARTEIRA_STRINGS.wallet;

  if (isLoading) {
    return (
      <div className="space-y-px rounded-xl border border-border bg-card p-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">
        <Icon icon="mdi:alert-circle-outline" size={16} className="text-severity-critical" />
        {strings.loadError}
      </div>
    );
  }

  // Coverage destinations, so a stand-in seller can be labelled as "cobrindo".
  const coverageByStandIn = new Map<ID, ICarteiraTransfer>();
  coverageByTitular.forEach((transfer) => coverageByStandIn.set(transfer.toSellerId, transfer));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          GRID,
          "border-b border-border bg-foreground/[0.02] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70",
        )}
      >
        <span>{strings.columns.seller}</span>
        <span>{strings.columns.wallet}</span>
        <span>{strings.columns.risk}</span>
        <span>{strings.columns.situation}</span>
        <span />
      </div>

      {rows.length === 0 ? (
        <div className="px-3.5 py-6 text-center text-sm text-muted-foreground">
          {strings.emptySellers}
        </div>
      ) : (
        rows.map((row) => {
          const covered = coverageByTitular.get(row.sellerId);
          const covering = coverageByStandIn.get(row.sellerId);
          return (
            <SellerWalletRowItem
              key={row.sellerId}
              row={row}
              coveredBy={
                covered
                  ? { transfer: covered, seller: sellersById.get(covered.toSellerId) }
                  : undefined
              }
              coveringFor={
                covering
                  ? { transfer: covering, seller: sellersById.get(covering.fromSellerId) }
                  : undefined
              }
              canManage={canManage}
              onOpen={onOpenSeller}
              onCover={onCoverSeller}
            />
          );
        })
      )}

      {unassigned > 0 && (
        <div className="flex items-center gap-3 border-t border-border bg-severity-critical/[0.06] px-3.5 py-2.5 transition-colors hover:bg-severity-critical/10">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-dashed border-severity-critical/45">
            <Icon icon="mdi:account-off-outline" size={16} className="text-severity-critical" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-severity-critical">
              {strings.unassignedTitle(unassigned)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {strings.unassignedDescription}
            </div>
          </div>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              onClick={onDistributeUnassigned}
            >
              {strings.distribute}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
