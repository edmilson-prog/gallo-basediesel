import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface IInfoHintProps {
  /** Explanation shown inside the tooltip. */
  text: string;
  /** Accessible name for the trigger (e.g. the metric/widget name). */
  label: string;
  /** Icon size in px. */
  size?: number;
}

/**
 * Small "ⓘ" affordance that reveals an explanatory tooltip on hover/focus.
 *
 * Safe to place inside clickable cards: the trigger is a non-button <span>
 * (avoids invalid nested buttons) and stops click propagation so it never
 * fires the parent card's onClick. Relies on the app-level TooltipProvider.
 */
export function InfoHint({ text, label, size = 14 }: IInfoHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className="inline-flex shrink-0 cursor-help text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <Icon icon="mdi:information-outline" size={size} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-center">{text}</TooltipContent>
    </Tooltip>
  );
}
