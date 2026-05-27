import { Icon } from "@/components/Icon";
import type { BadgeRarity, IBadgeDefinition } from "@/shared/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const RARITY_ACCENT: Record<BadgeRarity, string> = {
  common: "text-muted-foreground",
  rare: "text-blue-500",
  epic: "text-purple-500",
  legendary: "text-amber-500",
};

interface IBadgeChipProps {
  definition: IBadgeDefinition | undefined;
  size?: number;
  /** Show a thin ring around the icon. */
  outlined?: boolean;
  withTooltip?: boolean;
}

/** Single round icon for a badge. Tooltip shows name + description. */
export function BadgeChip({
  definition,
  size = 20,
  outlined = false,
  withTooltip = true,
}: IBadgeChipProps) {
  if (!definition) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:help-circle-outline" size={size} />
      </span>
    );
  }
  const accent = RARITY_ACCENT[definition.rarity];
  const inner = (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted ${accent} ${outlined ? "ring-1 ring-current/30" : ""}`}
      aria-label={definition.name}
    >
      <Icon icon={definition.icon} size={size} />
    </span>
  );
  if (!withTooltip) return inner;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs font-semibold">{definition.name}</div>
          <div className="text-[11px] text-muted-foreground">{definition.description}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
