import { useNavigate } from "@tanstack/react-router";
import type { ID, ILead, ILeadFunnelEntry, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import { LeadFunnelChips } from "@/features/funnels/components/LeadFunnelChips";
import { FUNNELS_COPY } from "@/features/funnels";
import type { ILeadFunnelChip } from "@/features/funnels/hooks/useLeadFunnelChips";
import { hexToAccentSlot } from "@/features/funnels/engine/legacyStageColor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDateBR, formatPhone } from "@/shared/utils/format";
import {
  getInitials,
  getOriginMeta,
  TEMPERATURE_META,
  daysInStage,
  getNextActionInfo,
} from "../utils/leadDisplay";
import type { ILeadsListSort, LeadsOrderBy } from "../utils/listFilters";
import { LeadRowActions } from "./LeadRowActions";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.list.columns;
const DAY_MS = 86_400_000;

/**
 * Four sortable columns, down from six.
 *
 * Temperature became the dot beside the name and "criado em" left the table
 * entirely, so neither has a header left to click. Both survive in the row's
 * tooltip, which is also where origin went.
 */
const SORTABLE: Partial<Record<string, LeadsOrderBy>> = {
  name: "name",
  estimatedValue: "estimatedValue",
  nextActionAt: "nextActionAt",
  daysInStage: "daysInStage",
};

export interface ILeadsListRowActions {
  sellers: ISeller[];
  /** Stages of the open funnel; empty in the consolidated view. */
  stages: ILeadFunnelStage[];
  onAssign: (lead: ILead, sellerId: ID, sellerName: string) => void;
  onMove: (lead: ILead, stageId: ID) => void;
  onDiscard: (lead: ILead) => void;
}

export interface ILeadsListProps {
  leads: ILead[];
  sellersById: Map<ID, ISeller>;
  isLoading: boolean;
  sort: ILeadsListSort;
  onSortChange: (sort: ILeadsListSort) => void;
  /**
   * Reports this view's scroll container so the header can draw the progress
   * line on the seam. The kanban has no single vertical scroller — each column
   * scrolls on its own — so it deliberately never reports one, and the bar
   * stays at zero there rather than tracking something arbitrary.
   */
  scrollRef?: (el: HTMLDivElement | null) => void;
  /**
   * Funnel chips per lead. Present only when the user reaches more than one
   * funnel, and always in the consolidated view (spec 7.5) — where it is the
   * only thing telling you which board a row belongs to.
   */
  funnelChipsByLead?: Map<ID, ILeadFunnelChip[]>;
  /**
   * The lead's participation in the OPEN funnel. Stage, value and time-in-stage
   * come from here whenever it exists: `lead.stage` and `lead.estimatedValue`
   * are the single-pipeline era's snapshot, marked `@deprecated`, and a lead in
   * two funnels has two of each.
   */
  entriesByLead?: Map<ID, ILeadFunnelEntry>;
  stagesById?: Map<ID, ILeadFunnelStage>;
  /** Present only when bulk actions are available to this user. */
  selection?: {
    selected: Set<ID>;
    allVisibleSelected: boolean;
    someVisibleSelected: boolean;
    toggle: (id: ID, index: number, withShift: boolean) => void;
    selectAllVisible: () => void;
  };
  /** Decisions available on the row. Absent when the user cannot edit leads. */
  rowActions?: ILeadsListRowActions;
  /** Triage mode pins the row actions open instead of revealing them on hover. */
  triageMode?: boolean;
}

export function LeadsList({
  leads,
  sellersById,
  isLoading,
  sort,
  onSortChange,
  scrollRef,
  funnelChipsByLead,
  entriesByLead,
  stagesById,
  selection,
  rowActions,
  triageMode = false,
}: ILeadsListProps) {
  const navigate = useNavigate();
  const now = new Date();

  const handleSort = (column: string) => {
    const orderBy = SORTABLE[column];
    if (!orderBy) return;
    if (sort.orderBy === orderBy) {
      onSortChange({ orderBy, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ orderBy, orderDir: "desc" });
    }
  };

  if (isLoading && leads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            {selection && (
              <TableHead className="w-9">
                <Checkbox
                  checked={
                    selection.allVisibleSelected
                      ? true
                      : selection.someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={selection.selectAllVisible}
                  // "Visible", never "all 903" — a header box that promised the
                  // whole set would apply a batch to rows nobody has seen.
                  aria-label={COPY.selectVisible}
                />
              </TableHead>
            )}
            <SortableHeader column="name" label={COPY.lead} sort={sort} onSort={handleSort} />
            <TableHead>{COPY.funnelStage}</TableHead>
            {funnelChipsByLead && <TableHead>{FUNNELS_COPY.sectionLabel}</TableHead>}
            <SortableHeader
              column="estimatedValue"
              label={COPY.estimatedValue}
              align="right"
              sort={sort}
              onSort={handleSort}
            />
            <TableHead>{COPY.seller}</TableHead>
            <SortableHeader
              column="nextActionAt"
              label={COPY.nextAction}
              sort={sort}
              onSort={handleSort}
            />
            <SortableHeader
              column="daysInStage"
              label={COPY.inStage}
              align="right"
              sort={sort}
              onSort={handleSort}
            />
            {rowActions && <TableHead className="w-[8.5rem] text-right">{COPY.actions}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead, index) => {
            const tempMeta = TEMPERATURE_META[lead.temperature];
            const originMeta = getOriginMeta(lead.origin);
            const nextAction = getNextActionInfo(lead.nextActionAt, now);
            const seller = lead.sellerId ? sellersById.get(lead.sellerId) : undefined;
            const chips = funnelChipsByLead?.get(lead.id) ?? [];

            const entry = entriesByLead?.get(lead.id);
            const stage = entry ? stagesById?.get(entry.stageId) : undefined;
            const value = entry?.estimatedValue ?? lead.estimatedValue;
            const stalledDays = entry
              ? Math.max(0, Math.floor((now.getTime() - new Date(entry.enteredStageAt).getTime()) / DAY_MS))
              : daysInStage(lead, now);
            const stageAccent = stage
              ? getAccentClasses(stage.accent)
              : getAccentClasses(hexToAccentSlot(lead.stage.color));

            return (
              <TableRow
                key={lead.id}
                data-state={selection?.selected.has(lead.id) ? "selected" : undefined}
                className={cn(
                  "group cursor-pointer hover:bg-accent/40",
                  selection?.selected.has(lead.id) && "bg-accent/40",
                )}
                onClick={() => void navigate({ to: "/app/leads/$id", params: { id: lead.id } })}
              >
                {selection && (
                  <TableCell
                    // The row opens the lead; the checkbox must not. Without
                    // this every tick would navigate away from the selection
                    // being built.
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selection.selected.has(lead.id)}
                      onCheckedChange={() => selection.toggle(lead.id, index, false)}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          e.preventDefault();
                          selection.toggle(lead.id, index, true);
                        }
                      }}
                      aria-label={lead.name}
                    />
                  </TableCell>
                )}

                {/*
                  One cell for identity: the temperature is the dot, the phone
                  sits under the same heading it always belonged to, and origin
                  and creation date — two whole columns before — moved into the
                  tooltip. Eleven columns of read-only data was the reason
                  nobody could decide anything here.
                */}
                <TableCell className="max-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          role="img"
                          aria-label={tempMeta.label}
                          className={cn("size-2 shrink-0 rounded-full", tempMeta.dot)}
                        />
                        <span className="truncate font-medium text-foreground">{lead.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatPhone(lead.phone)}
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon icon={originMeta.icon} size={12} aria-hidden />
                        {LEADS_STRINGS.filters.origin}: {originMeta.label}
                      </span>
                      <span>
                        {LEADS_STRINGS.detail.createdAt}: {formatDateBR(lead.createdAt)}
                      </span>
                      <span>
                        {LEADS_STRINGS.detail.fields.temperature}: {tempMeta.label}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>

                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium text-foreground",
                      stageAccent.chip,
                    )}
                  >
                    <span aria-hidden className={cn("size-1.5 rounded-full", stageAccent.dot)} />
                    {stage?.name ?? lead.stage.name}
                  </span>
                </TableCell>

                {funnelChipsByLead && (
                  <TableCell>
                    <LeadFunnelChips chips={chips} />
                  </TableCell>
                )}

                <TableCell
                  className={cn(
                    "text-right text-sm tabular-nums",
                    value !== undefined
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground/60",
                  )}
                >
                  {value !== undefined ? formatBRL(value) : LEADS_STRINGS.card.noValueShort}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {seller ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold">
                        {getInitials(seller.fullName)}
                      </span>
                      <span className="truncate">{seller.fullName}</span>
                    </span>
                  ) : (
                    LEADS_STRINGS.detail.state.sellerQueue
                  )}
                </TableCell>

                <TableCell>
                  {nextAction.urgency === "none" ? (
                    <span className="text-xs text-muted-foreground/60">{nextAction.label}</span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium",
                        nextAction.urgency === "overdue"
                          ? "text-severity-critical"
                          : nextAction.urgency === "today"
                            ? "text-severity-warning"
                            : "text-muted-foreground",
                      )}
                    >
                      {nextAction.urgency === "overdue" && (
                        <Icon icon="mdi:calendar-alert" size={12} aria-hidden />
                      )}
                      {nextAction.label}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {stalledDays}
                </TableCell>

                {rowActions && (
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "inline-flex transition-opacity",
                        // Pinned in triage mode: the whole point of the mode is
                        // that the decision is one click away on every row, and
                        // hover-to-reveal makes you hunt for it.
                        triageMode
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                      )}
                    >
                      <LeadRowActions
                        lead={lead}
                        sellers={rowActions.sellers}
                        stages={rowActions.stages}
                        currentStageId={entry?.stageId}
                        onAssign={(sellerId, sellerName) =>
                          rowActions.onAssign(lead, sellerId, sellerName)
                        }
                        onMove={(stageId) => rowActions.onMove(lead, stageId)}
                        onOpenConversation={() => {
                          const [conversationId] = lead.conversations;
                          if (!conversationId) return;
                          void navigate({
                            to: "/app/atendimento/$id",
                            params: { id: conversationId },
                          });
                        }}
                        onDiscard={() => rowActions.onDiscard(lead)}
                      />
                    </span>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface ISortableHeaderProps {
  column: string;
  label: string;
  align?: "left" | "right";
  sort: ILeadsListSort;
  onSort: (column: string) => void;
}

function SortableHeader({ column, label, align = "left", sort, onSort }: ISortableHeaderProps) {
  const active = sort.orderBy === SORTABLE[column];
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 text-xs hover:text-foreground",
          align === "right" && "ml-auto",
        )}
      >
        {label}
        {active && (
          <Icon icon={sort.orderDir === "asc" ? "mdi:arrow-up" : "mdi:arrow-down"} size={12} />
        )}
      </button>
    </TableHead>
  );
}
