import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { LEAD_PANEL_SECTIONS, type LeadPanelSectionId } from "./panelSections";

const COPY = LEADS_STRINGS.panel;

export interface ILeadPanelRailProps {
  active: LeadPanelSectionId;
  onSelect: (id: LeadPanelSectionId) => void;
}

/**
 * The panel's section rail — ten icons across the top, four of them locked.
 *
 * A locked entry is dimmed but still ANSWERS, exactly as the kit's does (its
 * `onLocked` fires a toast rather than swallowing the click). Here the answer
 * is the section body itself, which explains what converting would unlock —
 * a tooltip alone would say nothing at all on touch, where half the panel's
 * breakpoints live.
 *
 * So: never a `disabled` button (Radix drops pointer events on those, taking
 * the tooltip with them) and no `aria-disabled` either, because the control
 * genuinely does something. The state is carried by the label instead.
 */
export function LeadPanelRail({ active, onSelect }: ILeadPanelRailProps) {
  return (
    <nav
      aria-label={LEADS_STRINGS.fiche.title}
      className="flex shrink-0 items-center justify-between border-b border-border px-2.5 py-2"
    >
      {LEAD_PANEL_SECTIONS.map((section) => {
        const isActive = active === section.id;
        const label = section.available
          ? section.label
          : COPY.lockedHint(section.label);
        return (
          <Tooltip key={section.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSelect(section.id)}
                className={cn(
                  "grid size-[26px] place-items-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive && "bg-foreground/10 text-foreground",
                  !isActive &&
                    section.available &&
                    "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  !isActive && !section.available && "text-muted-foreground/40 hover:bg-foreground/5",
                )}
              >
                <Icon icon={section.icon} size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
