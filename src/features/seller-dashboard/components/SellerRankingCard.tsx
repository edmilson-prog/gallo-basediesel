import { Link } from "@tanstack/react-router";
import type { IRankingEntry } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerRankingCardProps {
  entry: IRankingEntry | null;
  totalSellers: number;
  isLoading: boolean;
}

export function SellerRankingCard({ entry, totalSellers, isLoading }: ISellerRankingCardProps) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-14 w-full" />
      </Card>
    );
  }

  if (!entry) {
    return (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:trophy-outline" size={16} className="text-primary" />
          {S.rankingTitle}
        </div>
        <p className="text-sm text-muted-foreground">{S.rankingEmpty}</p>
      </Card>
    );
  }

  const delta = entry.positionDelta ?? 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon icon="mdi:trophy-outline" size={16} className="text-primary" />
        {S.rankingTitle}
      </div>
      <div className="flex items-center gap-4">
        <span className="font-display text-4xl font-bold text-primary">#{entry.position}</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {S.rankingOf} {totalSellers} {S.rankingSellers}
          </p>
          {delta !== 0 && (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs",
                delta > 0 ? "text-severity-success" : "text-severity-critical",
              )}
            >
              <Icon icon={delta > 0 ? "mdi:arrow-up" : "mdi:arrow-down"} size={13} />
              {delta > 0 ? S.rankingMovedUp : S.rankingMovedDown} {Math.abs(delta)}{" "}
              {Math.abs(delta) === 1 ? "posição" : "posições"}
            </p>
          )}
        </div>
        <Link to="/app/gestao/ranking" className="text-xs font-semibold text-primary hover:underline">
          {S.rankingCta}
        </Link>
      </div>
    </Card>
  );
}
