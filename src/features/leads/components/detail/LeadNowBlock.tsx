import { useState } from "react";
import type { ILead, LeadNextActionKind } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { NEXT_ACTION_PRESETS, resolveDueDate } from "../../engine/nextAction";
import { getNextActionInfo } from "../../utils/leadDisplay";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail.now;

export interface ILeadNowBlockProps {
  lead: ILead;
  canEdit: boolean;
  pendingField: string | null;
  /** When the customer last wrote, if there is a conversation at all. */
  waitingSince?: string;
  onSet: (kind: LeadNextActionKind, dueAt: string) => void;
  onClear: (completed: boolean) => void;
}

/**
 * What happens next, as a decision rather than a field.
 *
 * This replaces the quietest line on the page — "Próxima ação · Sem próxima
 * ação", set in the same grey as the creation date — which is where the one
 * thing that decides a seller's day was living. With nothing marked, the block
 * does not go mute: it says why the lead is stalled and offers the four ways
 * out in one click. With something marked, it becomes a countdown that turns
 * red when it slips.
 */
export function LeadNowBlock({
  lead,
  canEdit,
  pendingField,
  waitingSince,
  onSet,
  onClear,
}: ILeadNowBlockProps) {
  const [picking, setPicking] = useState(false);
  const pending = pendingField === "nextActionAt";

  if (lead.nextActionAt) {
    const info = getNextActionInfo(lead.nextActionAt);
    const late = info.urgency === "overdue";
    const preset = NEXT_ACTION_PRESETS.find((p) => p.kind === lead.nextActionKind);
    const label = lead.nextActionKind ? COPY.kinds[lead.nextActionKind] : COPY.markedUnknown(info.label);

    return (
      <section
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border p-4",
          late
            ? "border-severity-critical/35 bg-severity-critical/5"
            : "border-primary/30 bg-primary/5",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-md",
            late
              ? "bg-severity-critical/15 text-severity-critical"
              : "bg-primary/15 text-primary",
          )}
        >
          <Icon icon={preset?.icon ?? "mdi:calendar-check"} size={18} />
        </span>

        <div className="min-w-0 flex-[1_1_16rem]">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                late
                  ? "bg-severity-critical/15 text-severity-critical"
                  : "bg-primary/15 text-primary",
              )}
            >
              {info.label}
            </span>
          </p>
          {/*
            Kept as its own line even when the kind is missing: rows written
            before `next_action_kind` existed carry a date and nothing else,
            and the block degrades to the deadline instead of inventing a label.
          */}
          {lead.nextActionKind && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {COPY.markedUnknown(info.label)}
            </p>
          )}
        </div>

        {canEdit && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => onClear(true)}>
              <Icon
                icon={pending ? "svg-spinners:ring-resize" : "mdi:check"}
                size={14}
                aria-hidden
              />
              {COPY.done}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={pending}
              aria-label={COPY.remove}
              onClick={() => onClear(false)}
            >
              <Icon icon="mdi:close" size={15} aria-hidden />
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-dashed border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-md bg-severity-critical/10 text-severity-critical"
        >
          <Icon icon="mdi:clock-alert-outline" size={18} />
        </span>
        <div className="min-w-0 flex-[1_1_18rem]">
          <p className="text-sm font-semibold text-foreground">{COPY.title}</p>
          <p className="mt-0.5 text-pretty text-xs text-muted-foreground">
            {waitingSince
              ? COPY.waitingReply(formatRelativeTimeBR(waitingSince))
              : COPY.waitingNoConversation(formatRelativeTimeBR(lead.createdAt))}
          </p>
        </div>
        {canEdit && !picking && (
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setPicking(true)}>
            <Icon icon="mdi:calendar-plus" size={14} aria-hidden />
            {COPY.mark}
          </Button>
        )}
      </div>

      {picking && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {NEXT_ACTION_PRESETS.map((preset) => (
            <Button
              key={preset.kind}
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setPicking(false);
                onSet(preset.kind, resolveDueDate(preset.when));
              }}
              className="gap-2"
            >
              <Icon icon={preset.icon} size={14} className="text-primary" aria-hidden />
              {COPY.kinds[preset.kind]}
              <span className="font-normal text-muted-foreground">{COPY.when[preset.when]}</span>
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
            {COPY.cancel}
          </Button>
        </div>
      )}
    </section>
  );
}
