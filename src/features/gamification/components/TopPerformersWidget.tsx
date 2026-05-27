import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { ID, IBadgeDefinition } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useRanking } from "../hooks/useRanking";
import { resolvePeriod } from "../utils/periods";
import { SellerAvatar } from "./SellerAvatar";
import { BadgeChip } from "./BadgeChip";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface ITopPerformersWidgetProps {
  storeId: ID;
}

const MEDAL_ICONS = ["mdi:trophy", "mdi:medal", "mdi:medal-outline"];
const MEDAL_TINTS = ["text-amber-500", "text-slate-400", "text-orange-500"];

/**
 * "Top performers do mês" — Manager Dashboard widget (PRD-014 integration).
 *
 * Mini horizontal podium of the current month's top 3 sellers (this store
 * only), with a deep link to the full ranking page. Hidden when gamification
 * is disabled on the store settings.
 */
export function TopPerformersWidget({ storeId }: ITopPerformersWidgetProps) {
  const period = useMemo(() => resolvePeriod("mensal"), []);
  const ranking = useRanking({ period, scope: { storeId } });

  const catalogBySlug = useMemo<Map<string, IBadgeDefinition>>(() => {
    const map = new Map<string, IBadgeDefinition>();
    for (const b of ranking.rules?.badges ?? []) map.set(b.slug, b);
    return map;
  }, [ranking.rules]);

  // Hide entirely when gamification is disabled.
  if (ranking.rules && !ranking.rules.active) {
    return null;
  }

  const top3 = ranking.ranking.slice(0, 3);

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:trophy" size={18} className="text-amber-500" />
          {S.widgetTopPerformersTitle}
        </h2>
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
        <ul className="flex flex-col divide-y divide-border/40">
          {top3.map((entry, idx) => {
            const seller = ranking.sellers.find((s) => s.id === entry.sellerId);
            const visibleSlugs = (entry.badgeSlugs ?? []).slice(0, 3);
            return (
              <li
                key={entry.sellerId}
                className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
              >
                <Icon icon={MEDAL_ICONS[idx]} size={20} className={MEDAL_TINTS[idx]} />
                <SellerAvatar fullName={seller?.fullName ?? "—"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {seller?.fullName ?? entry.sellerId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.score.toLocaleString("pt-BR")} pts
                  </p>
                </div>
                {visibleSlugs.length > 0 && (
                  <div className="hidden items-center gap-1 sm:flex">
                    {visibleSlugs.map((slug) => (
                      <BadgeChip
                        key={slug}
                        definition={catalogBySlug.get(slug)}
                        size={12}
                        withTooltip={false}
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
