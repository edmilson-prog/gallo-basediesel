import { useMemo } from "react";
import type { IBadgeDefinition, IGamificationBadge } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { BadgeChip } from "./BadgeChip";
import { RarityBadge } from "./RarityBadge";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface ISellerBadgesGridProps {
  badges: IGamificationBadge[];
  catalogBySlug: Map<string, IBadgeDefinition>;
  /** When true, lists badges as a vertical timeline; otherwise as a wrap grid. */
  asTimeline?: boolean;
}

/**
 * Reusable grid/timeline showing badges earned by a single seller. Re-used by
 * the ranking drill-down (this PRD) and prepared for the future seller profile
 * screen — PRD-043 deliberately exports this from the feature barrel.
 */
export function SellerBadgesGrid({
  badges,
  catalogBySlug,
  asTimeline = false,
}: ISellerBadgesGridProps) {
  const sorted = useMemo(
    () => [...badges].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)),
    [badges],
  );

  if (sorted.length === 0) {
    return (
      <Card className="flex min-h-32 flex-col items-center justify-center border-dashed bg-muted/20 py-8 text-center text-sm text-muted-foreground">
        <Icon icon="mdi:trophy-outline" size={28} className="text-muted-foreground" />
        <p className="mt-2">{S.badgesEmpty}</p>
      </Card>
    );
  }

  if (asTimeline) {
    return (
      <ul className="flex flex-col gap-3">
        {sorted.map((badge) => {
          const def = catalogBySlug.get(badge.badgeType);
          return (
            <li key={badge.id} className="flex items-start gap-3 rounded-md border border-border p-3">
              <BadgeChip definition={def} size={20} outlined />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {def?.name ?? badge.badgeType}
                  </span>
                  {badge.rarity && <RarityBadge rarity={badge.rarity} />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {def?.description ?? "—"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Período {badge.periodRef} ·{" "}
                  {new Date(badge.earnedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {sorted.map((badge) => {
        const def = catalogBySlug.get(badge.badgeType);
        return (
          <div
            key={badge.id}
            className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-3 text-center"
          >
            <BadgeChip definition={def} size={22} outlined />
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold text-foreground">
                {def?.name ?? badge.badgeType}
              </span>
              {badge.rarity && <RarityBadge rarity={badge.rarity} />}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {new Date(badge.earnedAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
