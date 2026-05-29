import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import type { SellerRankMetric } from "../../utils/sellerLeaderboard";
import type { ISellerLeaderboardSummary } from "../../utils/sellerLeaderboard";

const METRICS: { value: SellerRankMetric; label: string }[] = [
  { value: "revenue", label: S.sellersMetricRevenue },
  { value: "attainmentPct", label: S.sellersMetricAttainment },
  { value: "orderCount", label: S.sellersMetricOrders },
  { value: "avgTicket", label: S.sellersMetricTicket },
];

export interface ISellersSummaryHeaderProps {
  summary: ISellerLeaderboardSummary;
  metric: SellerRankMetric;
  onMetric: (m: SellerRankMetric) => void;
  showTable: boolean;
  onToggleTable: () => void;
}

export function SellersSummaryHeader({
  summary,
  metric,
  onMetric,
  showTable,
  onToggleTable,
}: ISellersSummaryHeaderProps) {
  const fmtPct = (n: number | null) =>
    n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Stat label={S.sellersSummarySellers} value={String(summary.sellerCount)} />
          <Stat label={S.sellersSummaryRevenue} value={formatBRLCompact(summary.totalRevenue)} />
          <Stat label={S.sellersSummaryAttainment} value={fmtPct(summary.avgAttainmentPct)} />
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={onToggleTable}>
          <Icon icon={showTable ? "mdi:view-agenda-outline" : "mdi:table"} size={16} />
          {showTable ? S.sellersViewCards : S.sellersViewTable}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {S.sellersRankBy}
        </span>
        <ToggleGroup
          type="single"
          value={metric}
          onValueChange={(v) => v && onMetric(v as SellerRankMetric)}
          variant="outline"
          className="flex-wrap justify-start"
        >
          {METRICS.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} size="sm" className="text-xs">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-[120px] flex-1 gap-0 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}
