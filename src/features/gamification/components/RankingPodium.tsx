import type { IBadgeDefinition, IRankingEntry, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { SellerAvatar } from "./SellerAvatar";
import { BadgeChip } from "./BadgeChip";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface IRankingPodiumProps {
  topEntries: IRankingEntry[];
  sellersById: Map<string, ISeller>;
  catalogBySlug: Map<string, IBadgeDefinition>;
  onSellerClick?: (sellerId: string) => void;
}

const SLOT_META = [
  {
    rank: 1,
    ring: "gold",
    label: S.podiumGold,
    icon: "mdi:trophy",
    iconClass: "text-amber-500",
    order: "lg:order-2 lg:scale-110",
  },
  {
    rank: 2,
    ring: "silver",
    label: S.podiumSilver,
    icon: "mdi:medal",
    iconClass: "text-slate-400",
    order: "lg:order-1",
  },
  {
    rank: 3,
    ring: "bronze",
    label: S.podiumBronze,
    icon: "mdi:medal-outline",
    iconClass: "text-orange-500",
    order: "lg:order-3",
  },
] as const;

/**
 * Top-3 podium row. Gold/Silver/Bronze cards with avatar, score and badges.
 * On mobile the cards stack 1-2-3; on desktop they reorder to 2-1-3 with the
 * gold card scaled up to feel like a real podium.
 */
export function RankingPodium({
  topEntries,
  sellersById,
  catalogBySlug,
  onSellerClick,
}: IRankingPodiumProps) {
  if (topEntries.length === 0) {
    return (
      <Card className="flex min-h-32 flex-col items-center justify-center border-dashed bg-muted/30 py-8 text-center text-sm text-muted-foreground">
        <Icon icon="mdi:trophy-outline" size={28} className="text-muted-foreground" />
        <p className="mt-2">{S.podiumEmpty}</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SLOT_META.map((slot) => {
        const entry = topEntries.find((e) => e.position === slot.rank);
        if (!entry) {
          return (
            <Card
              key={slot.rank}
              className={`flex h-full flex-col items-center gap-3 border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground ${slot.order}`}
            >
              <Icon icon={slot.icon} size={24} className={slot.iconClass} />
              <p className="font-medium">{slot.label}</p>
              <p className="text-xs">—</p>
            </Card>
          );
        }
        const seller = sellersById.get(entry.sellerId);
        const breakdown = entry.breakdown;
        const slugs = (entry.badgeSlugs ?? []).slice(0, 5);
        return (
          <Card
            key={entry.sellerId}
            className={`flex h-full flex-col items-center gap-3 p-6 text-center ${slot.order} ${slot.rank === 1 ? "border-amber-500/30 bg-amber-500/5" : ""}`}
          >
            <Icon icon={slot.icon} size={28} className={slot.iconClass} />
            <SellerAvatar
              fullName={seller?.fullName ?? "—"}
              size="xl"
              ring={slot.ring as "gold" | "silver" | "bronze"}
            />
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => onSellerClick?.(entry.sellerId)}
                className="text-base font-semibold text-foreground hover:underline"
              >
                {seller?.fullName ?? entry.sellerId}
              </button>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {slot.label}
              </span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {entry.score.toLocaleString("pt-BR")}
              <span className="ml-1 text-xs font-medium uppercase text-muted-foreground">pts</span>
            </div>
            {breakdown && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
                {breakdown.fromGoals > 0 && (
                  <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">
                    {S.chipGoals} {breakdown.fromGoals}
                  </span>
                )}
                {breakdown.fromCustomers > 0 && (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                    {S.chipCustomers} {breakdown.fromCustomers}
                  </span>
                )}
                {breakdown.fromOrders > 0 && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent-foreground">
                    {S.chipOrders} {breakdown.fromOrders}
                  </span>
                )}
                {breakdown.fromBadges > 0 && (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">
                    {S.chipBadges} {breakdown.fromBadges}
                  </span>
                )}
              </div>
            )}
            {slugs.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {slugs.map((slug) => (
                  <BadgeChip key={slug} definition={catalogBySlug.get(slug)} size={16} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
