import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { ICustomer, ID, ISeller, IVehicle } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { formatDateBR } from "@/shared/utils/format";
import type { ColumnId, OptionalColumn } from "../../utils/columns";
import { useVehiclesColumnWidths } from "../../hooks/useVehiclesColumnWidths";
import { VehiclesColumnsContextContent, VehiclesColumnsDropdown } from "./VehiclesColumnsMenu";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL,
  formatKm,
  formatPlate,
  iconForBrand,
} from "../../utils/vehicleDisplay";
import { lastServiceAt, type IVehiclesListSort } from "../../utils/listFilters";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.list.columns;

const SELECT_COLUMN_WIDTH = 40;
const ACTIONS_COLUMN_WIDTH = 44;

const SORTABLE: Partial<Record<string, IVehiclesListSort["orderBy"]>> = {
  brand: "brand",
  engine: "engine",
  plate: "plate",
  year: "year",
  km: "currentKm",
  lastService: "lastServiceAt",
  customer: "customerName",
  seller: "seller",
  cadastroStatus: "cadastroStatus",
};

export interface IVehiclesTableProps {
  vehicles: IVehicle[];
  isLoading: boolean;
  isFetching: boolean;
  selectedIds: Set<ID>;
  onToggleSelected: (id: ID, checked: boolean) => void;
  onToggleAllInPage: (checked: boolean) => void;
  sort: IVehiclesListSort;
  onSortChange: (next: IVehiclesListSort) => void;
  customersById: Map<ID, ICustomer>;
  sellersById: Map<ID, ISeller>;
  onSelectVehicle: (id: ID) => void;
  showStore?: boolean;
  canSelect?: boolean;
  visibleColumns: Set<OptionalColumn>;
  onToggleColumn: (id: OptionalColumn) => void;
  onShowAllColumns: () => void;
  /** Exposes the inner scroll container (drives the header progress line). */
  scrollRef?: (el: HTMLDivElement | null) => void;
}

export function VehiclesTable({
  vehicles,
  isLoading,
  isFetching,
  selectedIds,
  onToggleSelected,
  onToggleAllInPage,
  sort,
  onSortChange,
  customersById,
  sellersById,
  onSelectVehicle,
  canSelect = true,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  scrollRef,
}: IVehiclesTableProps) {
  const allInPageSelected = vehicles.length > 0 && vehicles.every((v) => selectedIds.has(v.id));
  const partialPageSelected = !allInPageSelected && vehicles.some((v) => selectedIds.has(v.id));

  const { widths, setWidth, commit } = useVehiclesColumnWidths();

  const columns = useMemo(
    () =>
      [
        { id: "brand", label: COPY.brand },
        { id: "year", label: COPY.year },
        { id: "engine", label: COPY.engine },
        { id: "plate", label: COPY.plate },
        { id: "customer", label: COPY.customer },
        { id: "seller", label: COPY.seller },
        { id: "km", label: COPY.km },
        { id: "lastService", label: COPY.lastService },
        { id: "cadastroStatus", label: COPY.cadastroStatus },
      ] satisfies { id: string; label: string }[],
    [],
  );

  // brand is mandatory; optional columns honor the visibility set.
  const visibleCols = useMemo(
    () =>
      columns.filter((col) => col.id === "brand" || visibleColumns.has(col.id as OptionalColumn)),
    [columns, visibleColumns],
  );

  const tableWidth =
    (canSelect ? SELECT_COLUMN_WIDTH : 0) +
    visibleCols.reduce((sum, col) => sum + widths[col.id as ColumnId], 0) +
    ACTIONS_COLUMN_WIDTH;

  if (isLoading) {
    // visible data columns + select + actions
    return <VehiclesTableSkeleton columns={visibleCols.length + (canSelect ? 1 : 0) + 1} />;
  }

  if (vehicles.length === 0) return null;

  const handleHeaderClick = (columnId: string) => {
    const sortKey = SORTABLE[columnId];
    if (!sortKey) return;
    if (sort.orderBy === sortKey) {
      onSortChange({ orderBy: sortKey, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ orderBy: sortKey, orderDir: "asc" });
    }
  };

  // Drag a column border to resize it; persists on mouse up.
  const startResize = (e: ReactMouseEvent, id: ColumnId) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widths[id];
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => setWidth(id, startWidth + (ev.clientX - startX));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      commit();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div className="h-full w-full">
      <Table
        containerRef={scrollRef}
        containerClassName="h-full"
        className="table-fixed"
        style={{ width: tableWidth }}
      >
        <colgroup>
          {canSelect && <col style={{ width: SELECT_COLUMN_WIDTH }} />}
          {visibleCols.map((col) => (
            <col key={col.id} style={{ width: widths[col.id as ColumnId] }} />
          ))}
          <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
        </colgroup>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <TableRow className="hover:bg-transparent [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
                {canSelect && (
                  <TableHead className="w-10 px-3">
                    <Checkbox
                      aria-label="Selecionar todos da página"
                      checked={
                        allInPageSelected ? true : partialPageSelected ? "indeterminate" : false
                      }
                      onCheckedChange={(checked) => onToggleAllInPage(Boolean(checked))}
                    />
                  </TableHead>
                )}
                {visibleCols.map((col) => {
                  const sortKey = SORTABLE[col.id];
                  const isSorted = sortKey && sort.orderBy === sortKey;
                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleHeaderClick(col.id)}
                      className={cn(
                        "relative select-none overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                        sortKey && "cursor-pointer hover:text-foreground",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey && (
                          <Icon
                            icon={
                              isSorted
                                ? sort.orderDir === "asc"
                                  ? "mdi:chevron-up"
                                  : "mdi:chevron-down"
                                : "mdi:unfold-more-horizontal"
                            }
                            size={14}
                            className={cn(!isSorted && "opacity-40")}
                          />
                        )}
                      </span>
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionar coluna ${col.label}`}
                        onMouseDown={(e) => startResize(e, col.id as ColumnId)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
                      />
                    </TableHead>
                  );
                })}
                <TableHead className="w-10 px-1 text-right">
                  <VehiclesColumnsDropdown
                    visible={visibleColumns}
                    onToggle={onToggleColumn}
                    onShowAll={onShowAllColumns}
                  />
                </TableHead>
              </TableRow>
            </ContextMenuTrigger>
            <VehiclesColumnsContextContent
              visible={visibleColumns}
              onToggle={onToggleColumn}
              onShowAll={onShowAllColumns}
            />
          </ContextMenu>
        </TableHeader>
        <TableBody className={cn(isFetching && "opacity-60 transition-opacity")}>
          {vehicles.map((vehicle, index) => (
            <VehicleRow
              key={vehicle.id}
              vehicle={vehicle}
              index={index}
              isSelected={selectedIds.has(vehicle.id)}
              onToggleSelected={onToggleSelected}
              onSelect={onSelectVehicle}
              customer={customersById.get(vehicle.customerId) ?? null}
              seller={
                (customersById.get(vehicle.customerId)?.sellerId &&
                  sellersById.get(customersById.get(vehicle.customerId)!.sellerId)) ||
                null
              }
              canSelect={canSelect}
              visible={visibleColumns}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface IVehicleRowProps {
  vehicle: IVehicle;
  index: number;
  isSelected: boolean;
  onToggleSelected: (id: ID, checked: boolean) => void;
  onSelect: (id: ID) => void;
  customer: ICustomer | null;
  seller: ISeller | null;
  canSelect: boolean;
  visible: Set<OptionalColumn>;
}

function VehicleRow({
  vehicle,
  index,
  isSelected,
  onToggleSelected,
  onSelect,
  customer,
  seller,
  canSelect,
  visible,
}: IVehicleRowProps) {
  const last = lastServiceAt(vehicle);
  const customerName = customer
    ? customer.type === "B2B"
      ? customer.nomeFantasia
      : customer.fullName
    : "—";
  return (
    <TableRow
      className={cn("cursor-pointer hover:bg-accent/30", index % 2 === 1 && "bg-muted/30")}
      onClick={() => onSelect(vehicle.id)}
    >
      {canSelect && (
        <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Selecionar veículo ${vehicle.brand} ${vehicle.model}`}
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelected(vehicle.id, Boolean(checked))}
          />
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Icon icon={iconForBrand(vehicle.brand)} size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium uppercase text-foreground">
              {vehicle.brand} {vehicle.model}
            </p>
            <p className="truncate text-xs text-muted-foreground">{vehicle.engine || "—"}</p>
          </div>
        </div>
      </TableCell>
      {visible.has("year") && (
        <TableCell className="text-sm tabular-nums">{vehicle.year}</TableCell>
      )}
      {visible.has("engine") && (
        <TableCell className="truncate text-xs text-muted-foreground">
          {vehicle.engine || "—"}
        </TableCell>
      )}
      {visible.has("plate") && (
        <TableCell className="font-mono text-xs uppercase">{formatPlate(vehicle.plate)}</TableCell>
      )}
      {visible.has("customer") && (
        <TableCell className="text-sm">
          <div className="min-w-0">
            <p className="truncate uppercase">{customerName}</p>
            {customer && (
              <p className="truncate text-[11px] text-muted-foreground">
                {customer.type === "B2B" ? "B2B" : "B2C"}
              </p>
            )}
          </div>
        </TableCell>
      )}
      {visible.has("seller") && (
        <TableCell className="truncate text-xs uppercase text-muted-foreground">
          {seller ? seller.fullName : "—"}
        </TableCell>
      )}
      {visible.has("km") && (
        <TableCell className="text-sm tabular-nums text-foreground">
          {formatKm(vehicle.currentKm)}
        </TableCell>
      )}
      {visible.has("lastService") && (
        <TableCell className="text-xs text-muted-foreground">
          {last ? formatDateBR(last) : "—"}
        </TableCell>
      )}
      {visible.has("cadastroStatus") && (
        <TableCell>
          <Badge
            variant="outline"
            className={cn("text-xs", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
          >
            {STATUS_LABEL[vehicle.cadastroStatus]}
          </Badge>
        </TableCell>
      )}
      <TableCell className="w-10 px-1" />
    </TableRow>
  );
}

function VehiclesTableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={i} className="px-3 py-2">
                <Skeleton className="h-3 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: columns }).map((__, j) => (
                <TableCell key={j} className="py-3">
                  <Skeleton className="h-3 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
