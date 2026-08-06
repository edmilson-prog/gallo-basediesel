import type { ID, ILeadFunnel } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import { COPY } from "../i18n/pt-BR";

export interface IAddToFunnelMenuProps {
  /** Funnels the lead is NOT in yet. */
  funnels: ILeadFunnel[];
  onAdd: (funnelId: ID, funnelName: string) => void;
  /** Renders as a text button instead of the compact `+`, for the empty state. */
  variant?: "icon" | "text";
}

/**
 * Put this lead in another funnel, without leaving the conversation.
 *
 * Lists only the funnels the lead is not already in — offering one it is
 * already in would rely on `addEntry`'s silent noop to hide a pointless click.
 */
export function AddToFunnelMenu({ funnels, onAdd, variant = "icon" }: IAddToFunnelMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={COPY.fiche.add}
        className={cn(
          "inline-flex items-center gap-1 rounded text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          variant === "icon" ? "size-5 justify-center hover:bg-muted" : "text-xs underline-offset-2 hover:underline",
        )}
      >
        <Icon icon="mdi:plus" size={variant === "icon" ? 14 : 12} aria-hidden />
        {variant === "text" && COPY.fiche.emptyAction}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">{COPY.fiche.add}</DropdownMenuLabel>
        {funnels.length === 0 ? (
          // A disabled line, not an empty menu: "nothing here" has to be said.
          <DropdownMenuItem disabled className="text-xs">
            {COPY.fiche.addEmpty}
          </DropdownMenuItem>
        ) : (
          funnels.map((f) => (
            <DropdownMenuItem
              key={f.id}
              className="gap-2 text-xs"
              onSelect={() => onAdd(f.id, f.name)}
            >
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(f.accent).dot)}
              />
              <Icon icon={f.icon} size={14} className="shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{f.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
