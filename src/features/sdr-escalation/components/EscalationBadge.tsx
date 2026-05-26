import { memo } from "react";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SdrEscalationMode } from "@/shared/types";
import { ESCALATION_MODE_LABELS } from "../templates/render";

export interface IEscalationBadgeProps {
  mode: SdrEscalationMode;
  /** Compact variant used inside the inbox list (icon + short label). */
  compact?: boolean;
  /** When set, renders a slim banner-style badge for the conversation header. */
  banner?: boolean;
  className?: string;
}

const MODE_CLASSES: Record<SdrEscalationMode, string> = {
  urgent: "bg-red-500/15 text-red-700 ring-red-500/30 dark:bg-red-500/25 dark:text-red-200",
  normal:
    "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:bg-amber-500/25 dark:text-amber-200",
  standard:
    "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-500/25 dark:text-emerald-200",
};

/**
 * Badge rendered on the inbox item, the conversation header and the painel.
 * Communicates that an SDR-driven handoff happened plus its urgency.
 */
function EscalationBadgeInner({ mode, compact, banner, className }: IEscalationBadgeProps) {
  const base = cn(
    "inline-flex items-center gap-1 rounded font-medium ring-1",
    MODE_CLASSES[mode],
    compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
    banner && "w-full justify-center rounded-md py-1 text-sm font-semibold ring-1",
    mode === "urgent" && "animate-pulse",
    className,
  );

  const label = compact
    ? "Escalado"
    : banner
      ? `🤖 Esta conversa foi escalada pelo SDR — ${ESCALATION_MODE_LABELS[mode]}`
      : `Escalado pelo SDR · ${ESCALATION_MODE_LABELS[mode]}`;

  const content = (
    <span className={base} role="status" aria-live={mode === "urgent" ? "assertive" : "polite"}>
      <Icon icon="mdi:robot" size={compact ? 11 : 14} />
      <span>{label}</span>
    </span>
  );

  if (banner) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top">
        Conversa transferida do agente SDR — modo {ESCALATION_MODE_LABELS[mode]}.
      </TooltipContent>
    </Tooltip>
  );
}

export const EscalationBadge = memo(EscalationBadgeInner);
