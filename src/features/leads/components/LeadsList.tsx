import { useNavigate } from "@tanstack/react-router";
import type { ID, ILead, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  getOriginMeta,
  TEMPERATURE_META,
  daysInStage,
  getNextActionInfo,
} from "../utils/leadDisplay";
import type { ILeadsListSort, LeadsOrderBy } from "../utils/listFilters";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.list.columns;

const SORTABLE: Partial<Record<string, LeadsOrderBy>> = {
  name: "name",
  temperature: "temperature",
  estimatedValue: "estimatedValue",
  nextActionAt: "nextActionAt",
  createdAt: "createdAt",
  daysInStage: "daysInStage",
};

export interface ILeadsListProps {
  leads: ILead[];
  sellersById: Map<ID, ISeller>;
  isLoading: boolean;
  sort: ILeadsListSort;
  onSortChange: (sort: ILeadsListSort) => void;
}

export function LeadsList({ leads, sellersById, isLoading, sort, onSortChange }: ILeadsListProps) {
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
    <div className="h-full overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <SortableHeader column="name" label={COPY.name} sort={sort} onSort={handleSort} />
            <TableHead>{COPY.phone}</TableHead>
            <TableHead>{COPY.stage}</TableHead>
            <SortableHeader
              column="temperature"
              label={COPY.temperature}
              sort={sort}
              onSort={handleSort}
            />
            <TableHead>{COPY.origin}</TableHead>
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
              label={COPY.daysInStage}
              align="right"
              sort={sort}
              onSort={handleSort}
            />
            <SortableHeader
              column="createdAt"
              label={COPY.createdAt}
              sort={sort}
              onSort={handleSort}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const tempMeta = TEMPERATURE_META[lead.temperature];
            const originMeta = getOriginMeta(lead.origin);
            const nextAction = getNextActionInfo(lead.nextActionAt, now);
            const seller = lead.sellerId ? sellersById.get(lead.sellerId) : undefined;
            return (
              <TableRow
                key={lead.id}
                className="cursor-pointer hover:bg-accent/40"
                onClick={() => void navigate({ to: "/app/leads/$id", params: { id: lead.id } })}
              >
                <TableCell className="font-medium text-foreground">{lead.name}</TableCell>
                <TableCell className="text-muted-foreground">{formatPhone(lead.phone)}</TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      borderColor: lead.stage.color,
                      color: lead.stage.color,
                    }}
                  >
                    {lead.stage.name}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      tempMeta.tone,
                    )}
                  >
                    <Icon icon={tempMeta.icon} size={11} />
                    {tempMeta.label}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      originMeta.tone,
                    )}
                  >
                    <Icon icon={originMeta.icon} size={11} />
                    {originMeta.label}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm font-semibold text-foreground">
                  {lead.estimatedValue !== undefined ? formatBRL(lead.estimatedValue) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{seller?.fullName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("h-5 gap-1 text-[10px]", nextAction.tone)}>
                    {nextAction.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {daysInStage(lead, now)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateBR(lead.createdAt)}
                </TableCell>
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
