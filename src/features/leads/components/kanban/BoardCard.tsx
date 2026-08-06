import type { DragEvent, ReactNode } from "react";
import type { ID, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { IBoardCard } from "@/features/funnels/engine/boardBuckets";
import type { ILeadFunnelChip } from "@/features/funnels/hooks/useLeadFunnelChips";
import { formatBRLCompact } from "@/shared/utils/format";
import { getInitials, getNextActionInfo, TEMPERATURE_META } from "../../utils/leadDisplay";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { BoardCardHover } from "./BoardCardHover";

export interface IBoardCardProps {
  card: IBoardCard;
  stage: ILeadFunnelStage;
  seller?: ISeller;
  /** False when the board is already scoped to one seller — pure noise then. */
  showSeller: boolean;
  onOpen: (leadId: ID) => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>, leadId: ID) => void;
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void;
  /** The multi-funnel indicator, supplied by the column. */
  indicator?: ReactNode;
  /** Funnels holding this lead, for the hover card. */
  chips: ILeadFunnelChip[];
}

/** Text-only urgency colour. `tone` carries a chip background this card drops. */
const URGENT_TEXT = {
  overdue: "text-severity-critical",
  today: "text-severity-warning",
} as const;

/**
 * The board card, cut from ~96px and seven data points to ~60px and four.
 *
 * Out: the lead's avatar, the phone, the origin chip, the temperature chip's
 * background, the coloured left border, the next-action chip when it is not
 * urgent, and the seller's name. None of it is lost — it all lives in the hover
 * card. What it buys is roughly nine visible cards per column instead of four.
 */
export function BoardCard({
  card,
  stage,
  seller,
  showSeller,
  onOpen,
  draggable = true,
  onDragStart,
  onDragEnd,
  indicator,
  chips,
}: IBoardCardProps) {
  const { lead, entry } = card;
  const temperature = TEMPERATURE_META[lead.temperature];
  const nextAction = getNextActionInfo(lead.nextActionAt);
  const urgentClass =
    nextAction.urgency === "overdue"
      ? URGENT_TEXT.overdue
      : nextAction.urgency === "today"
        ? URGENT_TEXT.today
        : null;

  // The badge reads the PARTICIPATION's stage, not the lead: with N:N the same
  // lead can be won in Catalisador and open in Filtros, and the old badge —
  // which read `lead.convertedToCustomerId` — said "Convertido" on both boards.
  const outcome = stage.kind === "ganho" ? "converted" : stage.kind === "perda" ? "lost" : null;

  const open = () => onOpen(lead.id);

  const cardElement = (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      data-lead-id={lead.id}
      aria-label={LEADS_STRINGS.card.ariaLabel(lead.name, stage.name, temperature.label)}
      className={cn(
        "group relative flex min-h-[56px] w-full flex-col justify-center gap-1 rounded-md border border-border bg-card px-2.5 py-2 text-left shadow-sm transition",
        "hover:border-primary/50 hover:shadow-md",
        // focus-visible, not focus: the card is both a click and a drag target,
        // and the plain `focus:` ring flashed on every mouse-down.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        draggable && "cursor-grab active:cursor-grabbing",
        outcome && "opacity-60",
      )}
    >
      {outcome && (
        // A side strip, not an absolutely-positioned badge: the old one sat at
        // `right-2 top-2`, on top of the temperature chip, and on this card it
        // would cover the dot.
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-1 rounded-l-md",
            outcome === "converted" ? "bg-severity-success" : "bg-severity-critical",
          )}
        />
      )}

      <div className="flex items-center gap-1.5">
        <span
          role="img"
          aria-label={temperature.label}
          className={cn("size-2 shrink-0 rounded-full", temperature.dot)}
        />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {lead.name}
        </p>
        {showSeller && seller && (
          <Avatar className="size-4 shrink-0" title={seller.fullName}>
            <AvatarFallback className="text-[8px] font-semibold">
              {getInitials(seller.fullName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className="flex items-center gap-2 pl-3.5 text-[11px]">
        <span className="tabular-nums text-muted-foreground">
          {entry.estimatedValue !== undefined
            ? formatBRLCompact(entry.estimatedValue)
            : LEADS_STRINGS.card.noValue}
        </span>
        {urgentClass && (
          <span className={cn("inline-flex items-center gap-0.5", urgentClass)}>
            <Icon icon="mdi:calendar-alert" size={11} aria-hidden />
            {nextAction.label}
          </span>
        )}
        {indicator && <span className="ml-auto">{indicator}</span>}
      </div>
    </div>
  );

  // 400ms is not decoration: without the delay, dragging a card down a column
  // opens a popover over every card the pointer crosses on the way.
  return (
    <HoverCard openDelay={400}>
      <HoverCardTrigger asChild>{cardElement}</HoverCardTrigger>
      <HoverCardContent align="start" side="right" className="w-72">
        <BoardCardHover card={card} chips={chips} />
      </HoverCardContent>
    </HoverCard>
  );
}
