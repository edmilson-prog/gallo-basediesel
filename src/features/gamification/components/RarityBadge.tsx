import type { BadgeRarity } from "@/shared/types";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

const RARITY_CLASSES: Record<BadgeRarity, string> = {
  common: "border-border bg-muted text-muted-foreground",
  rare: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300",
  epic: "border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-300",
  legendary:
    "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/20",
};

const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: S.raritiesCommon,
  rare: S.raritiesRare,
  epic: S.raritiesEpic,
  legendary: S.raritiesLegendary,
};

interface IRarityBadgeProps {
  rarity: BadgeRarity;
  className?: string;
}

export function RarityBadge({ rarity, className = "" }: IRarityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${RARITY_CLASSES[rarity]} ${className}`}
    >
      {RARITY_LABELS[rarity]}
    </span>
  );
}
