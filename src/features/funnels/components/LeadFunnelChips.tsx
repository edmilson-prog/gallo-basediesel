import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import type { ILeadFunnelChip } from "../hooks/useLeadFunnelChips";

/** Beyond this the row stops being scannable; the rest goes to the tooltip. */
const VISIBLE = 2;

export interface ILeadFunnelChipsProps {
  chips: ILeadFunnelChip[];
  /**
   * The lead sits in at least one funnel this user cannot open. Shown as a
   * padlock without a name: revealing which would leak the commercial
   * structure the access control exists to protect (spec 7.5).
   */
  hasHidden?: boolean;
}

export function LeadFunnelChips({ chips, hasHidden }: ILeadFunnelChipsProps) {
  if (chips.length === 0 && !hasHidden) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const shown = chips.slice(0, VISIBLE);
  const rest = chips.slice(VISIBLE);

  return (
    <div className="flex items-center gap-1">
      {shown.map((c) => (
        <span
          key={c.funnelId}
          className="inline-flex max-w-[9rem] items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground"
        >
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-sm", getAccentClasses(c.accent).dot)}
          />
          <span className="truncate">{c.name}</span>
        </span>
      ))}

      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default rounded border border-border px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              +{rest.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>{rest.map((c) => c.name).join(" · ")}</TooltipContent>
        </Tooltip>
      )}

      {hasHidden && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground">
              <Icon icon="mdi:lock-outline" size={13} aria-label="Em um funil que você não acessa" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Este lead está em um funil que você não acessa.</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
