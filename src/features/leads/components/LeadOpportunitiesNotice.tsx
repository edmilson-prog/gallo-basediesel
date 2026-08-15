import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import { useLeadDetailFunnels } from "@/features/funnels/hooks/useLeadDetailFunnels";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.convertModal.opportunities;

export interface ILeadOpportunitiesNoticeProps {
  leadId: ID;
  storeId: ID | null | undefined;
}

/**
 * What converting does — and does not do — to the lead's open opportunities.
 *
 * A lead in two funnels is two opportunities, each with its own stage and its
 * own value. Converting writes `converted_to_customer_id` and the legacy stage
 * snapshot; `convert_lead_mark` does not touch `lead_funnel_entries`, so those
 * participations stay exactly where they were.
 *
 * That is worth saying out loud rather than leaving to be discovered on the
 * board a week later: a converted lead still sitting in "Em negociação" keeps
 * counting toward the forecast of a deal that already closed. Naming the
 * consequence at the moment of the decision is the honest option while the
 * behaviour is what it is.
 */
export function LeadOpportunitiesNotice({ leadId, storeId }: ILeadOpportunitiesNoticeProps) {
  const { view, totalValue, isLoading } = useLeadDetailFunnels(leadId, storeId);

  if (isLoading || view.visible.length === 0) return null;

  return (
    <div className="rounded-md border border-severity-warning/35 bg-severity-warning/5 p-3">
      <p className="flex items-start gap-2 text-xs text-pretty text-foreground">
        <Icon
          icon="mdi:information-outline"
          size={14}
          aria-hidden
          className="mt-0.5 shrink-0 text-severity-warning"
        />
        <span>
          {COPY.body(view.visible.length)}{" "}
          <span className="text-muted-foreground">{COPY.hint}</span>
        </span>
      </p>

      <ul className="mt-2.5 space-y-1">
        {view.visible.map(({ entry, funnel, stage }) => {
          const accent = getAccentClasses(funnel.accent);
          return (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded border border-border bg-card px-2.5 py-1.5 text-xs"
            >
              <span aria-hidden className={cn("size-2 shrink-0 rounded-sm", accent.dot)} />
              <span className="truncate font-medium text-foreground">{funnel.name}</span>
              <span className="shrink-0 text-muted-foreground">· {stage?.name ?? "—"}</span>
              <span
                className={cn(
                  "ml-auto shrink-0 tabular-nums",
                  entry.estimatedValue !== undefined
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground/60",
                )}
              >
                {entry.estimatedValue !== undefined
                  ? formatBRL(entry.estimatedValue)
                  : COPY.noValue}
              </span>
            </li>
          );
        })}
      </ul>

      {totalValue > 0 && (
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          {COPY.total(formatBRL(totalValue))}
        </p>
      )}
    </div>
  );
}
