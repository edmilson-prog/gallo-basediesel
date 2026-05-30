import { useMemo } from "react";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { daysSince, formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.timeline;

export interface ICustomerRelationshipTimelineProps {
  customer: ICustomer;
  className?: string;
  onSeeAllNotes?: () => void;
}

interface ITimelineNode {
  icon: string;
  title: string;
  detail: string;
  muted?: boolean;
}

export function CustomerRelationshipTimeline({
  customer,
  className,
  onSeeAllNotes,
}: ICustomerRelationshipTimelineProps) {
  const hasNotes = customer.notes.length > 0;
  const nodes = useMemo<ITimelineNode[]>(() => {
    const out: ITimelineNode[] = [];
    const since = customer.firstPurchaseAt ?? customer.createdAt;
    if (since) {
      out.push({
        icon: "mdi:account-star-outline",
        title: COPY.customerSince,
        detail: formatDateBR(since),
      });
    }
    if (customer.convertedFromLeadAt) {
      out.push({
        icon: "mdi:account-convert-outline",
        title: COPY.convertedFromLead,
        detail: formatDateBR(customer.convertedFromLeadAt),
      });
    }
    if (customer.lastPurchaseAt) {
      const d = daysSince(customer.lastPurchaseAt);
      out.push({
        icon: "mdi:cart-outline",
        title: COPY.lastPurchase,
        detail: `${formatDateBR(customer.lastPurchaseAt)} · ${COPY.lastPurchaseDays(d ?? 0)}`,
      });
    }
    const recentNotes = [...customer.notes]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 2);
    for (const note of recentNotes) {
      out.push({
        icon: "mdi:note-text-outline",
        title: COPY.recentNote,
        detail: `${formatDateBR(note.createdAt)} — ${note.content.slice(0, 60)}`,
        muted: true,
      });
    }
    return out;
  }, [customer]);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:timeline-clock-outline" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>

      {nodes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {nodes.map((node, i) => (
            <li key={i} className="relative">
              <span
                className={cn(
                  "absolute -left-[21px] grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-card",
                  node.muted ? "bg-muted-foreground/50" : "bg-primary",
                )}
                aria-hidden
              />
              <div className="flex items-start gap-1.5">
                <Icon
                  icon={node.icon}
                  size={13}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{node.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground" title={node.detail}>
                    {node.detail}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        {hasNotes && onSeeAllNotes && (
          <button
            type="button"
            onClick={onSeeAllNotes}
            className="mt-3 inline-flex items-center gap-1 rounded text-[11px] font-medium text-primary transition-colors hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {COPY.seeAllNotes}
            <Icon icon="mdi:arrow-right" size={12} />
          </button>
        )}
      )}
    </section>
  );
}
