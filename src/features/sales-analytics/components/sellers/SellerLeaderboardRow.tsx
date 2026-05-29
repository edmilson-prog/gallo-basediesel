import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { formatBRLCompact } from "@/shared/utils/format";
import { attainmentBand, type ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";

const BAND_BAR: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  below: "bg-destructive",
  none: "bg-muted-foreground/40",
};
const BAND_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  below: "text-destructive",
  none: "text-muted-foreground",
};

export interface ISellerLeaderboardRowProps {
  row: ISellerLeaderboardRow;
  onSelect: (sellerId: string) => void;
  selected?: boolean;
}

export function SellerLeaderboardRow({ row, onSelect, selected }: ISellerLeaderboardRowProps) {
  const band = attainmentBand(row.attainmentPct);
  const pct = row.attainmentPct;
  const trendIcon =
    row.trend === "up" ? "mdi:arrow-up" : row.trend === "down" ? "mdi:arrow-down" : "mdi:minus";
  const trendClass =
    row.trend === "up" ? "text-success" : row.trend === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <button
      type="button"
      onClick={() => onSelect(row.sellerId)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
        selected && "outline outline-2 outline-primary/60 bg-muted/40",
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
        {row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {row.sellerName}
      </span>
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block">
        <span
          className={cn("block h-full rounded-full", BAND_BAR[band])}
          style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
        />
      </span>
      <span className={cn("w-12 text-right text-xs font-bold tabular-nums", BAND_TEXT[band])}>
        {pct == null ? "—" : `${Math.round(pct)}%`}
      </span>
      <span className="w-20 text-right text-sm font-bold tabular-nums text-foreground">
        {formatBRLCompact(row.revenue)}
      </span>
      <Icon icon={trendIcon} size={16} className={cn("shrink-0", trendClass)} />
      <Icon icon="mdi:chevron-right" size={18} className="shrink-0 text-muted-foreground/50" />
    </button>
  );
}
