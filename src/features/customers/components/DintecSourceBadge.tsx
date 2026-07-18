import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface IDintecSourceBadgeProps {
  className?: string;
}

/**
 * Tiny "ERP" pill marking a stat value sourced from the DINTEC import
 * snapshot rather than live-computed from a real order in the platform.
 * Callers only render this when the resolver in `dintecStats.ts` reports
 * `fromDintec: true` — a real order always takes precedence once it exists,
 * so the badge disappears on its own the moment that happens.
 */
export function DintecSourceBadge({ className }: IDintecSourceBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          aria-label="Dado do ERP DINTEC"
          className={cn(
            "inline-flex shrink-0 cursor-help items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300",
            className,
          )}
        >
          ERP
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-center">
        Dado importado do ERP DINTEC — some quando houver um pedido real na plataforma.
      </TooltipContent>
    </Tooltip>
  );
}
