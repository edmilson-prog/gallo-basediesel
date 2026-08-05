import type { DragEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, ILead, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatBRLCompact, formatPhone } from "@/shared/utils/format";
import {
  getOriginMeta,
  TEMPERATURE_META,
  getInitials,
  getNextActionInfo,
  isConverted,
  isLost,
} from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export interface ILeadCardProps {
  lead: ILead;
  seller?: ISeller;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>, leadId: ID) => void;
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void;
  onClick?: (leadId: ID) => void;
  /** Compact view used inside kanban columns. */
  variant?: "kanban" | "list";
}

export function LeadCard({
  lead,
  seller,
  draggable = true,
  onDragStart,
  onDragEnd,
  onClick,
  variant = "kanban",
}: ILeadCardProps) {
  const navigate = useNavigate();
  const temperatureMeta = TEMPERATURE_META[lead.temperature];
  const originMeta = getOriginMeta(lead.origin);
  const nextAction = getNextActionInfo(lead.nextActionAt);
  const converted = isConverted(lead);
  const lost = isLost(lead);

  const handleClick = () => {
    if (onClick) {
      onClick(lead.id);
      return;
    }
    void navigate({ to: "/app/leads/$id", params: { id: lead.id } });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Lead ${lead.name}, estágio ${lead.stage.name}, temperatura ${temperatureMeta.label}`}
      data-lead-id={lead.id}
      className={cn(
        "group relative flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-left text-card-foreground shadow-sm transition",
        "hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring",
        draggable && "cursor-grab active:cursor-grabbing",
        variant === "kanban" ? "w-full" : "w-full",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px] font-semibold">
              {getInitials(lead.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground" title={lead.name}>
              {lead.name}
            </p>
            <p className="text-[11px] text-muted-foreground">{formatPhone(lead.phone)}</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
            temperatureMeta.tone,
          )}
          title={temperatureMeta.label}
        >
          <Icon icon={temperatureMeta.icon} size={11} />
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-foreground">
          {lead.estimatedValue !== undefined
            ? formatBRLCompact(lead.estimatedValue)
            : LEADS_STRINGS.card.noValue}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
            nextAction.tone,
          )}
        >
          <Icon icon="mdi:calendar-clock-outline" size={11} />
          {nextAction.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
            originMeta.tone,
          )}
        >
          <Icon icon={originMeta.icon} size={11} />
          {originMeta.label}
        </span>
        {seller && (
          <span
            className="inline-flex items-center gap-1 text-muted-foreground"
            title={seller.fullName}
          >
            <Avatar className="h-4 w-4">
              <AvatarFallback className="text-[8px] font-semibold">
                {getInitials(seller.fullName)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[8ch] truncate sm:inline">{seller.fullName}</span>
          </span>
        )}
      </div>

      {(converted || lost) && (
        <div className="absolute right-2 top-2">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
              converted
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                : "bg-red-500/20 text-red-700 dark:text-red-300",
            )}
          >
            {converted ? LEADS_STRINGS.card.converted : LEADS_STRINGS.card.lost}
          </span>
        </div>
      )}
    </div>
  );
}
