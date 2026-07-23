import type { ICopilotBriefing } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

export interface ICopilotHeaderProps {
  briefing?: ICopilotBriefing;
  /** Slot à direita (chevron de expandir/colapsar etc.). */
  trailing?: React.ReactNode;
}

function formatMoney(v?: number): string | null {
  if (v == null) return null;
  if (v >= 1000) return `R$ ${Math.round(v / 1000)}k`;
  return `R$ ${v}`;
}

export function CopilotHeader({ briefing, trailing }: ICopilotHeaderProps) {
  const ticket = formatMoney(briefing?.averageTicket);
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
        <Icon icon="mdi:robot-outline" size={15} />
      </span>
      <span className="text-sm font-bold text-primary">{COPILOT_STRINGS.title}</span>
      {briefing && (
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {briefing.kind === "lead" ? (
            <span className="font-semibold uppercase text-info">
              Lead{briefing.leadStage ? ` · ${briefing.leadStage}` : ""}
            </span>
          ) : (
            briefing.lifecycleStatus && (
              <span className="font-semibold uppercase text-warning">
                {briefing.lifecycleStatus}
              </span>
            )
          )}
          {briefing.abcClass && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>
                ABC <span className="font-semibold text-primary">{briefing.abcClass}</span>
              </span>
            </>
          )}
          {ticket && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>ticket {ticket}</span>
            </>
          )}
          {briefing.recencyDays != null && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>recência {briefing.recencyDays}d</span>
            </>
          )}
          {briefing.kind === "lead" && briefing.leadOrigin && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>{briefing.leadOrigin}</span>
            </>
          )}
        </span>
      )}
      <span
        className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"
        title={COPILOT_STRINGS.privacyAria}
      >
        <Icon icon="mdi:lock-outline" size={12} />
        {COPILOT_STRINGS.privacy}
      </span>
      {trailing}
    </div>
  );
}
