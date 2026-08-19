import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { toast } from "sonner";
import type { ICustomer, ID, ISeller, IVehicle } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { formatDateBR } from "@/shared/utils/format";
import { avatarColors, hashHue, initialsFrom } from "@/shared/utils/avatar";
import type { ColumnId, OptionalColumn } from "../../utils/columns";
import { useVehiclesColumnWidths } from "../../hooks/useVehiclesColumnWidths";
import { VehiclesColumnsContextContent, VehiclesColumnsDropdown } from "./VehiclesColumnsMenu";
import { VehicleFichaChips } from "../VehicleFichaChips";
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
const FICHA_COPY = VEHICLE_STRINGS.list.ficha;
const USAGE_COPY = VEHICLE_STRINGS.list.usage;
const MENU_COPY = VEHICLE_STRINGS.list.rowMenu;

const SELECT_COLUMN_WIDTH = 40;
const ACTIONS_COLUMN_WIDTH = 44;

/** `ficha` is derived client-side, so it has no server-side sort key. */
const SORTABLE: Partial<Record<ColumnId, IVehiclesListSort["orderBy"]>> = {
  vehicle: "brand",
  plate: "plate",
  customer: "customerName",
  usage: "currentKm",
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
  onApproveOne?: (id: ID) => void;
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
  onApproveOne,
  canSelect = true,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  scrollRef,
}: IVehiclesTableProps) {
  // Only pending registrations are actionable in bulk, so only they are
  // selectable — a checkbox on an already-approved row promises nothing.
  const selectable = useMemo(
    () => vehicles.filter((v) => v.cadastroStatus === "pendente"),
    [vehicles],
  );
  const allInPageSelected = selectable.length > 0 && selectable.every((v) => selectedIds.has(v.id));
  const partialPageSelected = !allInPageSelected && selectable.some((v) => selectedIds.has(v.id));

  const { widths, setWidth, commit } = useVehiclesColumnWidths();

  const columns = useMemo(
    () =>
      [
        { id: "vehicle", label: COPY.vehicle },
        { id: "plate", label: COPY.plate },
        { id: "customer", label: COPY.customer },
        { id: "ficha", label: COPY.ficha },
        { id: "usage", label: COPY.usage },
        { id: "seller", label: COPY.seller },
        { id: "cadastroStatus", label: COPY.cadastroStatus },
      ] satisfies { id: ColumnId; label: string }[],
    [],
  );

  // vehicle is mandatory; optional columns honor the visibility set.
  const visibleCols = useMemo(
    () =>
      columns.filter((col) => col.id === "vehicle" || visibleColumns.has(col.id as OptionalColumn)),
    [columns, visibleColumns],
  );

  const tableWidth =
    (canSelect ? SELECT_COLUMN_WIDTH : 0) +
    visibleCols.reduce((sum, col) => sum + widths[col.id], 0) +
    ACTIONS_COLUMN_WIDTH;

  if (isLoading) {
    // visible data columns + select + actions
    return <VehiclesTableSkeleton columns={visibleCols.length + (canSelect ? 1 : 0) + 1} />;
  }

  if (vehicles.length === 0) return null;

  const handleHeaderClick = (columnId: ColumnId) => {
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
            <col key={col.id} style={{ width: widths[col.id] }} />
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
                      aria-label="Selecionar cadastros pendentes da página"
                      disabled={selectable.length === 0}
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
                      title={col.id === "ficha" ? FICHA_COPY.headerHint : undefined}
                      className={cn(
                        "relative select-none overflow-hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                        sortKey && "cursor-pointer hover:text-foreground",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.id === "ficha" && <Icon icon="mdi:information-outline" size={12} />}
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
                        onMouseDown={(e) => startResize(e, col.id)}
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
          {vehicles.map((vehicle, index) => {
            const customer = customersById.get(vehicle.customerId) ?? null;
            return (
              <VehicleRow
                key={vehicle.id}
                vehicle={vehicle}
                index={index}
                isSelected={selectedIds.has(vehicle.id)}
                onToggleSelected={onToggleSelected}
                onSelect={onSelectVehicle}
                onApproveOne={onApproveOne}
                customer={customer}
                seller={(customer?.sellerId && sellersById.get(customer.sellerId)) || null}
                canSelect={canSelect}
                visible={visibleColumns}
              />
            );
          })}
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
  onApproveOne?: (id: ID) => void;
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
  onApproveOne,
  customer,
  seller,
  canSelect,
  visible,
}: IVehicleRowProps) {
  const last = lastServiceAt(vehicle);
  const isPending = vehicle.cadastroStatus === "pendente";
  const customerName = customer
    ? customer.type === "B2B"
      ? customer.nomeFantasia
      : customer.fullName
    : "—";
  const customerPlace = customer?.address
    ? `${customer.address.city}/${customer.address.state}`
    : null;
  const hasUsage = typeof vehicle.currentKm === "number" || last !== null;

  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-accent/30",
        isPending ? "bg-severity-warning/[0.06]" : index % 2 === 1 && "bg-muted/30",
      )}
      onClick={() => onSelect(vehicle.id)}
    >
      {canSelect && (
        <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
          {isPending && (
            <Checkbox
              aria-label={`Selecionar veículo ${vehicle.brand} ${vehicle.model}`}
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelected(vehicle.id, Boolean(checked))}
            />
          )}
        </TableCell>
      )}

      <TableCell>
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Icon icon={iconForBrand(vehicle.brand)} size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold uppercase text-foreground">
              {vehicle.brand && vehicle.brand !== "Outra" ? `${vehicle.brand} ` : ""}
              {vehicle.model}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {vehicle.year}
              {vehicle.engine ? ` · ${vehicle.engine}` : ""}
            </p>
          </div>
        </div>
      </TableCell>

      {visible.has("plate") && (
        <TableCell>
          <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide text-foreground">
            {formatPlate(vehicle.plate)}
          </span>
        </TableCell>
      )}

      {visible.has("customer") && (
        <TableCell className="text-sm">
          <div className="min-w-0">
            <p className="truncate uppercase text-foreground">{customerName}</p>
            {customer && (
              <p className="truncate text-[11px] text-muted-foreground">
                {customer.type === "B2B" ? "B2B" : "B2C"}
                {customerPlace ? ` · ${customerPlace}` : ""}
              </p>
            )}
          </div>
        </TableCell>
      )}

      {visible.has("ficha") && (
        <TableCell className="overflow-hidden">
          <VehicleFichaChips vehicle={vehicle} />
        </TableCell>
      )}

      {visible.has("usage") && (
        <TableCell>
          {!hasUsage ? (
            <span className="text-xs text-muted-foreground">{USAGE_COPY.noRecords}</span>
          ) : (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                {formatKm(vehicle.currentKm)}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {last ? USAGE_COPY.lastService(formatDateBR(last)) : USAGE_COPY.noServices}
              </p>
            </div>
          )}
        </TableCell>
      )}

      {visible.has("seller") && (
        <TableCell>
          {seller ? (
            <div className="flex min-w-0 items-center gap-2">
              <SellerAvatar seller={seller} />
              <span className="truncate text-xs text-muted-foreground">
                {shortSellerName(seller.fullName)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      )}

      {visible.has("cadastroStatus") && (
        <TableCell>
          {vehicle.cadastroStatus === "aprovado" ? (
            // Approved is the norm, not news: a discreet check instead of a
            // badge that would repeat 50 times per page.
            <Icon
              icon="mdi:check"
              size={14}
              aria-label={STATUS_LABEL.aprovado}
              className="text-muted-foreground/70"
            />
          ) : (
            <Badge
              variant="outline"
              className={cn("gap-1 text-xs", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
            >
              {isPending && <Icon icon="mdi:clock-alert-outline" size={11} />}
              {STATUS_LABEL[vehicle.cadastroStatus]}
            </Badge>
          )}
        </TableCell>
      )}

      <TableCell className="w-10 px-1" onClick={(e) => e.stopPropagation()}>
        <VehicleRowMenu
          vehicle={vehicle}
          onOpen={() => onSelect(vehicle.id)}
          onApprove={isPending && onApproveOne ? () => onApproveOne(vehicle.id) : undefined}
        />
      </TableCell>
    </TableRow>
  );
}

function SellerAvatar({ seller }: { seller: ISeller }) {
  const colors = avatarColors(hashHue(seller.id));
  return (
    <span
      aria-hidden
      title={seller.fullName}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
      style={{ background: colors.bg, color: colors.fg }}
    >
      {initialsFrom(seller.fullName)}
    </span>
  );
}

/** "Fernando Mello Muniz" → "Fernando M." — one seller owns most of the base,
 *  so the full name repeated on every row is noise. */
function shortSellerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || !last || parts.length <= 1) return fullName;
  return `${first} ${last.charAt(0)}.`;
}

interface IVehicleRowMenuProps {
  vehicle: IVehicle;
  onOpen: () => void;
  onApprove?: () => void;
}

function VehicleRowMenu({ vehicle, onOpen, onApprove }: IVehicleRowMenuProps) {
  const copyPlate = async () => {
    const plate = formatPlate(vehicle.plate);
    if (!vehicle.plate) return;
    try {
      await navigator.clipboard.writeText(plate);
      toast.success(MENU_COPY.copiedPlate(plate));
    } catch {
      toast.error(MENU_COPY.copyPlateError);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label={MENU_COPY.trigger}
        >
          <Icon icon="mdi:dots-vertical" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onOpen()}>
          <Icon icon="mdi:open-in-new" size={14} />
          {MENU_COPY.open}
        </DropdownMenuItem>
        {vehicle.plate && (
          <DropdownMenuItem onSelect={() => void copyPlate()}>
            <Icon icon="mdi:content-copy" size={14} />
            {MENU_COPY.copyPlate}
          </DropdownMenuItem>
        )}
        {onApprove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onApprove()}>
              <Icon icon="mdi:check-circle-outline" size={14} />
              {MENU_COPY.approve}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
