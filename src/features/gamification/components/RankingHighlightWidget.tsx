import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useRanking } from "../hooks/useRanking";
import { resolvePeriod } from "../utils/periods";
import { SellerAvatar } from "./SellerAvatar";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface IRankingHighlightWidgetProps {
  /**
   * When omitted, defaults to all stores (Owner cockpit). Pass the current
   * store id to scope to a single one (Gestor cockpit).
   */
  storeId?: ID;
}

const MEDAL_ICONS = ["mdi:trophy", "mdi:medal", "mdi:medal-outline"];
const MEDAL_TINTS = ["text-amber-500", "text-slate-400", "text-orange-500"];

/**
 * Executive Cockpit highlight (PRD-040 integration) — top 3 sellers in the
 * current month. Replaces the inline "gamification statistics" stub the
 * cockpit was previously rendering.
 */
export function RankingHighlightWidget({ storeId }: IRankingHighlightWidgetProps) {
  const period = useMemo(() => resolvePeriod("mensal"), []);
  const ranking = useRanking({ period, scope: { storeId } });

  if (ranking.rules && !ranking.rules.active) {
    return null;
  }

  const top3 = ranking.ranking.slice(0, 3);

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:podium-gold" size={18} className="text-amber-500" />
            {S.widgetCockpitTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{S.widgetCockpitSubtitle}</p>
        </div>
        <Link to="/app/gestao/ranking" className="text-xs text-primary hover:underline">
          {S.widgetTopPerformersCta}
        </Link>
      </header>

      {ranking.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : top3.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.podiumEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {top3.map((entry, idx) => {
            const seller = ranking.sellers.find((s) => s.id === entry.sellerId);
            const breakdown = entry.breakdown;
            return (
              <li
                key={entry.sellerId}
                className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
              >
                <Icon icon={MEDAL_ICONS[idx]} size={22} className={MEDAL_TINTS[idx]} />
                <SellerAvatar fullName={seller?.fullName ?? "—"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {seller?.fullName ?? entry.sellerId}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Metas {breakdown?.fromGoals ?? 0} · Clientes {breakdown?.fromCustomers ?? 0} ·
                    Pedidos {breakdown?.fromOrders ?? 0}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {entry.score.toLocaleString("pt-BR")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
