import type { BadgeRarity, IBadgeDefinition, IGamificationBadge, ISeller } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { SellerAvatar } from "./SellerAvatar";
import { BadgeChip } from "./BadgeChip";
import { RarityBadge } from "./RarityBadge";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface IRecentBadgesCardProps {
  badges: IGamificationBadge[];
  sellersById: Map<string, ISeller>;
  catalogBySlug: Map<string, IBadgeDefinition>;
  /** Max items to render. */
  limit?: number;
}

const RARITY_RANK: Record<BadgeRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

/**
 * Card listing the rarest badges earned in the current period (PRD-043).
 * Sort: rarity desc (legendary → common) then earnedAt desc.
 */
export function RecentBadgesCard({
  badges,
  sellersById,
  catalogBySlug,
  limit = 5,
}: IRecentBadgesCardProps) {
  const sorted = [...badges].sort((a, b) => {
    const ra = RARITY_RANK[a.rarity ?? "common"];
    const rb = RARITY_RANK[b.rarity ?? "common"];
    if (ra !== rb) return ra - rb;
    return b.earnedAt.localeCompare(a.earnedAt);
  });
  const visible = sorted.slice(0, limit);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{S.badgesHighlightTitle}</h2>
        <p className="text-xs text-muted-foreground">{S.badgesHighlightSubtitle}</p>
      </div>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.badgesEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((badge) => {
            const def = catalogBySlug.get(badge.badgeType);
            const seller = sellersById.get(badge.sellerId);
            return (
              <li key={badge.id} className="flex items-center gap-3">
                <BadgeChip definition={def} size={18} outlined />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {def?.name ?? badge.badgeType}
                    </span>
                    {badge.rarity && <RarityBadge rarity={badge.rarity} />}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <SellerAvatar fullName={seller?.fullName ?? "—"} size="sm" />
                    <span className="truncate">{seller?.fullName ?? badge.sellerId}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
