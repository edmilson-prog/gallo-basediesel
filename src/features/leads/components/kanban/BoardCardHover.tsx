import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import type { IBoardCard } from "@/features/funnels/engine/boardBuckets";
import type { ILeadFunnelChip } from "@/features/funnels/hooks/useLeadFunnelChips";
import { formatDateBR, formatPhone } from "@/shared/utils/format";
import { getOriginMeta } from "../../utils/leadDisplay";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface IBoardCardHoverProps {
  card: IBoardCard;
  /** Every funnel the user reaches that holds this lead, current one included. */
  chips: ILeadFunnelChip[];
}

const DAY_MS = 86_400_000;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-xs text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Everything the 60px card dropped.
 *
 * "Days in stage" comes from `entry.enteredStageAt`, so it is real per funnel —
 * the lead's own `updatedAt` would report the same number on every board, and
 * would move whenever anything at all about the lead changed.
 */
export function BoardCardHover({ card, chips }: IBoardCardHoverProps) {
  const { lead, entry } = card;
  const origin = getOriginMeta(lead.origin);
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(entry.enteredStageAt).getTime()) / DAY_MS),
  );

  return (
    <dl className="space-y-1.5">
      <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>

      <Row label={LEADS_STRINGS.kanban.hover.phone}>{formatPhone(lead.phone)}</Row>
      <Row label={LEADS_STRINGS.kanban.hover.origin}>
        <span className="inline-flex items-center gap-1">
          <Icon icon={origin.icon} size={11} aria-hidden />
          {origin.label}
        </span>
      </Row>
      <Row label={LEADS_STRINGS.kanban.hover.daysInStage}>
        {LEADS_STRINGS.kanban.hover.daysValue(days)}
      </Row>
      <Row label={LEADS_STRINGS.kanban.hover.createdAt}>{formatDateBR(lead.createdAt)}</Row>
      <Row label={LEADS_STRINGS.kanban.hover.tags}>
        {lead.tags.length > 0 ? lead.tags.join(", ") : LEADS_STRINGS.kanban.hover.noTags}
      </Row>

      {chips.length > 0 && (
        <div className="border-t border-border pt-1.5">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {LEADS_STRINGS.kanban.hover.funnels}
          </p>
          <ul className="space-y-0.5">
            {chips.map((c) => (
              <li key={c.funnelId} className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(c.accent).dot)}
                />
                <span className="truncate">{c.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </dl>
  );
}
