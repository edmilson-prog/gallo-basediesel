import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import { useSellerLeaderboard } from "../../hooks/useSellerLeaderboard";
import type { SellerRankMetric } from "../../utils/sellerLeaderboard";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { SellersSummaryHeader } from "../sellers/SellersSummaryHeader";
import { SellerPodium } from "../sellers/SellerPodium";
import { SellerLeaderboardRow } from "../sellers/SellerLeaderboardRow";
import { SellersTable } from "../sellers/SellersTable";
import { SellerDetailDrawer } from "../sellers/SellerDetailDrawer";

export interface ISellersTabProps {
  storeId?: ID;
  /** When set, the viewer is a Vendedor — only their own row is shown (rank preserved). */
  viewerSellerId?: ID;
  /** Selected seller for the drawer (deep-link via ?vendedor=). */
  selectedSellerId?: string;
  onSelectSeller: (sellerId: string | undefined) => void;
}

export function SellersTab({
  storeId,
  viewerSellerId,
  selectedSellerId,
  onSelectSeller,
}: ISellersTabProps) {
  const [metric, setMetric] = useState<SellerRankMetric>("revenue");
  const [showTable, setShowTable] = useState(false);
  const { rows, summary, isLoading } = useSellerLeaderboard({ storeId, metric });

  const visibleRows = useMemo(
    () => (viewerSellerId ? rows.filter((r) => r.sellerId === viewerSellerId) : rows),
    [rows, viewerSellerId],
  );

  const showPodium = !viewerSellerId && visibleRows.length >= 4;
  const top3 = showPodium ? visibleRows.slice(0, 3) : [];
  const listRows = showPodium ? visibleRows.slice(3) : visibleRows;

  const selectedRow = useMemo(
    () => rows.find((r) => r.sellerId === selectedSellerId) ?? null,
    [rows, selectedSellerId],
  );

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <Icon icon="mdi:trophy-broken" size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{S.sellersEmpty}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-5">
      {viewerSellerId ? (
        <p className="text-sm font-semibold text-muted-foreground">{S.sellersMyPosition}</p>
      ) : (
        <SellersSummaryHeader
          summary={summary}
          metric={metric}
          onMetric={setMetric}
          showTable={showTable}
          onToggleTable={() => setShowTable((v) => !v)}
        />
      )}

      {showTable && !viewerSellerId ? (
        <SellersTable rows={visibleRows} onSelect={(id) => onSelectSeller(id)} />
      ) : (
        <div className="flex flex-col gap-4">
          {showPodium && <SellerPodium top3={top3} onSelect={(id) => onSelectSeller(id)} />}
          <div className="flex flex-col gap-2">
            {listRows.map((row) => (
              <SellerLeaderboardRow
                key={row.sellerId}
                row={row}
                selected={row.sellerId === selectedSellerId}
                onSelect={(id) => onSelectSeller(id)}
              />
            ))}
          </div>
        </div>
      )}

      <SellerDetailDrawer
        row={selectedRow}
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) onSelectSeller(undefined);
        }}
      />
    </Card>
  );
}
