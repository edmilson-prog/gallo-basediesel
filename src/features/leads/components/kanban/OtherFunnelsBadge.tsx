import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import type { ILeadFunnelChip } from "@/features/funnels/hooks/useLeadFunnelChips";
import { COPY as FUNNELS_COPY } from "@/features/funnels/i18n/pt-BR";

export interface IOtherFunnelsBadgeProps {
  others: ILeadFunnelChip[];
  onGo: (funnelId: ID) => void;
}

/**
 * `⑃ N` — deliberately quiet, and deliberately colourless.
 *
 * Being in several funnels is context, not urgency. It must not compete with
 * the overdue warning, which is the only signal on this card that makes anyone
 * act. N counts the OTHER funnels, and only the ones this user reaches.
 */
export function OtherFunnelsBadge({ others, onGo }: IOtherFunnelsBadgeProps) {
  if (others.length === 0) return null;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <span
          role="img"
          aria-label={FUNNELS_COPY.otherFunnels.ariaLabel(others.length)}
          className="inline-flex items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground"
        >
          <Icon icon="mdi:source-branch" size={11} aria-hidden />
          {others.length}
        </span>
      </HoverCardTrigger>

      <HoverCardContent align="end" className="w-56 p-1">
        {others.map((o) => (
          <button
            key={o.funnelId}
            type="button"
            title={FUNNELS_COPY.otherFunnels.goTo(o.name)}
            onClick={(e) => {
              // The card underneath opens the lead's page — this jumps boards.
              e.stopPropagation();
              onGo(o.funnelId);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(o.accent).dot)}
            />
            <span className="truncate">{o.name}</span>
          </button>
        ))}
      </HoverCardContent>
    </HoverCard>
  );
}
