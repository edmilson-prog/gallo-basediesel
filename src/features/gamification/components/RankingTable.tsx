import type { IBadgeDefinition, IRankingEntry, ISeller, IStore } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { SellerAvatar } from "./SellerAvatar";
import { BadgeChip } from "./BadgeChip";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface IRankingTableProps {
  entries: IRankingEntry[];
  sellersById: Map<string, ISeller>;
  storesById: Map<string, IStore>;
  catalogBySlug: Map<string, IBadgeDefinition>;
  highlightSellerId?: string;
  showStoreColumn?: boolean;
  onSellerClick?: (sellerId: string) => void;
}

function renderDelta(delta: number | undefined) {
  if (delta === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
        <Icon icon="mdi:arrow-up" size={14} />
        {delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
        <Icon icon="mdi:arrow-down" size={14} />
        {Math.abs(delta)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
      <Icon icon="mdi:minus" size={14} />
    </span>
  );
}

/**
 * Ranking listing (4th onwards by default — but shows all when `entries`
 * doesn't omit the podium). Highlights the signed-in seller's row with a
 * sticky accent border.
 */
export function RankingTable({
  entries,
  sellersById,
  storesById,
  catalogBySlug,
  highlightSellerId,
  showStoreColumn = true,
  onSellerClick,
}: IRankingTableProps) {
  if (entries.length === 0) {
    return (
      <Card className="flex min-h-32 items-center justify-center border-dashed bg-muted/20 py-8 text-center text-sm text-muted-foreground">
        {S.tableNoData}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{S.tableHeaderPosition}</th>
              <th className="px-4 py-3 font-medium">{S.tableHeaderSeller}</th>
              {showStoreColumn && <th className="px-4 py-3 font-medium">{S.tableHeaderStore}</th>}
              <th className="px-4 py-3 text-right font-medium">{S.tableHeaderScore}</th>
              <th className="px-4 py-3 text-center font-medium">{S.tableHeaderDelta}</th>
              <th className="px-4 py-3 font-medium">{S.tableHeaderBadges}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const seller = sellersById.get(entry.sellerId);
              const store = seller ? storesById.get(seller.storeId) : undefined;
              const isYou = entry.sellerId === highlightSellerId;
              const slugs = entry.badgeSlugs ?? [];
              const visible = slugs.slice(0, 3);
              const remaining = slugs.length - visible.length;
              return (
                <tr
                  key={entry.sellerId}
                  className={`border-b border-border/60 last:border-0 transition-colors ${isYou ? "bg-accent/10" : "hover:bg-muted/40"}`}
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold ${
                          isYou ? "bg-accent text-accent-foreground" : "bg-muted text-foreground"
                        }`}
                      >
                        {entry.position}
                      </span>
                      {isYou && (
                        <span className="hidden text-[10px] font-medium uppercase tracking-wide text-accent-foreground/80 sm:inline">
                          {S.tableYou}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-3">
                      <SellerAvatar fullName={seller?.fullName ?? "—"} size="sm" />
                      <button
                        type="button"
                        onClick={() => onSellerClick?.(entry.sellerId)}
                        className="text-left font-medium text-foreground hover:underline"
                      >
                        {seller?.fullName ?? entry.sellerId}
                      </button>
                    </div>
                  </td>
                  {showStoreColumn && (
                    <td className="px-4 py-3 align-middle text-muted-foreground">
                      {store?.name ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums text-foreground">
                    {entry.score.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-center align-middle">
                    {renderDelta(entry.positionDelta)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {visible.map((slug) => (
                        <BadgeChip key={slug} definition={catalogBySlug.get(slug)} size={14} />
                      ))}
                      {remaining > 0 && (
                        <span className="text-xs text-muted-foreground">+{remaining}</span>
                      )}
                      {slugs.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
