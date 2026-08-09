import type { ID, ILead, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import { getInitials } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.list.triage.actions;

export interface ILeadRowActionsProps {
  lead: ILead;
  sellers: ISeller[];
  /** Stages of the open funnel. Empty in the consolidated view — no shared axis. */
  stages: ILeadFunnelStage[];
  /** The lead's stage in the open funnel, so the menu can disable it. */
  currentStageId?: ID;
  onAssign: (sellerId: ID, sellerName: string) => void;
  onMove: (stageId: ID) => void;
  onOpenConversation: () => void;
  onDiscard: () => void;
}

/**
 * The four decisions a row can take without leaving the list.
 *
 * "Triar em lista é mais rápido que arrastar um a um" was the promise the
 * board's triage band makes, and what it opened was a read-only table — the
 * promise broke on arrival. These are the decisions triage actually consists
 * of: give it an owner, move it on, answer it, or drop it.
 */
export function LeadRowActions({
  lead,
  sellers,
  stages,
  currentStageId,
  onAssign,
  onMove,
  onOpenConversation,
  onDiscard,
}: ILeadRowActionsProps) {
  const hasConversation = lead.conversations.length > 0;

  return (
    <span
      className="inline-flex items-center gap-0.5"
      // The row navigates to the lead; none of these should.
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              aria-label={COPY.assign}
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:account-plus-outline" size={14} aria-hidden />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{COPY.assign}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="max-h-72 w-52 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">{COPY.assign}</DropdownMenuLabel>
          {sellers.map((seller) => (
            <DropdownMenuItem
              key={seller.id}
              disabled={seller.id === lead.sellerId}
              className="gap-2 text-xs"
              onSelect={() => onAssign(seller.id, seller.fullName)}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                {getInitials(seller.fullName)}
              </span>
              <span className="truncate">{seller.fullName}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {stages.length > 0 && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger
                aria-label={COPY.move}
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon icon="mdi:arrow-right-bold-outline" size={14} aria-hidden />
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{COPY.move}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">{COPY.move}</DropdownMenuLabel>
            {stages.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                disabled={stage.id === currentStageId}
                className="gap-2 text-xs"
                onSelect={() => onMove(stage.id)}
              >
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(stage.accent).dot)}
                />
                <span className="truncate">{stage.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          {/*
            Disabled rather than hidden: an action that appears on some rows and
            not others reads as a rendering bug, and "este lead ainda não tem
            conversa" is information the person triaging wants.
          */}
          <span tabIndex={hasConversation ? -1 : 0}>
            <button
              type="button"
              disabled={!hasConversation}
              onClick={onOpenConversation}
              aria-label={COPY.conversation}
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-severity-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon icon="mdi:chat-outline" size={14} aria-hidden />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {hasConversation ? COPY.conversation : COPY.noConversation}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onDiscard}
            aria-label={COPY.discard}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-severity-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon icon="mdi:close-octagon-outline" size={14} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{COPY.discard}</TooltipContent>
      </Tooltip>
    </span>
  );
}
