import { useMemo } from "react";
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
import { formatDateBR } from "@/shared/utils/format";
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
}: IVehiclesTableProps) {
  const allInPageSelected = vehicles.length > 0 && vehicles.every((v) => selectedIds.has(v.id));
  const partialPageSelected = !allInPageSelected && vehicles.some((v) => selectedIds.has(v.id));

  const columns = useMemo(
    () =>
      [
        { id: "brand", label: COPY.brand },
        { id: "year", label: COPY.year },
        { id: "engine", label: COPY.engine },
        { id: "plate", label: COPY.plate },
        { id: "customer", label: COPY.customer },
        { id: "seller", label: COPY.seller },
        { id: "km", label: COPY.km, align: "right" as const },
        { id: "lastService", label: COPY.lastService },
        { id: "cadastroStatus", label: COPY.cadastroStatus },
      ] satisfies { id: string; label: string; align?: "right" }[],
    [],
  );

  if (isLoading) {
    return <VehiclesTableSkeleton columns={columns.length + (canSelect ? 1 : 0)} />;
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

  return (
    <div className="h-full w-full">
      <Table containerClassName="h-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="hover:bg-transparent">
            {canSelect && (
              <TableHead className="w-10 px-3">
                <Checkbox
                  aria-label="Selecionar todos da página"
                  checked={allInPageSelected ? true : partialPageSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => onToggleAllInPage(Boolean(checked))}
                />
              </TableHead>
            )}
            {columns.map((col) => {
              const sortKey = SORTABLE[col.id];
              const isSorted = sortKey && sort.orderBy === sortKey;
              return (
                <TableHead
                  key={col.id}
                  onClick={() => handleHeaderClick(col.id)}
                  className={cn(
                    "select-none whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    sortKey && "cursor-pointer hover:text-foreground",
                    col.align === "right" && "text-right",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.align === "right" && "justify-end",
                    )}
                  >
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
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody className={cn(isFetching && "opacity-60 transition-opacity")}>
          {vehicles.map((vehicle) => (
            <VehicleRow
              key={vehicle.id}
              vehicle={vehicle}
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
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface IVehicleRowProps {
  vehicle: IVehicle;
  isSelected: boolean;
  onToggleSelected: (id: ID, checked: boolean) => void;
  onSelect: (id: ID) => void;
  customer: ICustomer | null;
  seller: ISeller | null;
  canSelect: boolean;
}

function VehicleRow({
  vehicle,
  isSelected,
  onToggleSelected,
  onSelect,
  customer,
  seller,
  canSelect,
}: IVehicleRowProps) {
  const last = lastServiceAt(vehicle);
  const customerName = customer
    ? customer.type === "B2B"
      ? customer.nomeFantasia
      : customer.fullName
    : "—";
  return (
    <TableRow className="cursor-pointer hover:bg-accent/30" onClick={() => onSelect(vehicle.id)}>
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
      <TableCell className="text-sm tabular-nums">{vehicle.year}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{vehicle.engine || "—"}</TableCell>
      <TableCell className="font-mono text-xs uppercase">{formatPlate(vehicle.plate)}</TableCell>
      <TableCell className="text-sm">
        <div className="min-w-0">
          <p className="truncate">{customerName}</p>
          {customer && (
            <p className="truncate text-[11px] text-muted-foreground">
              {customer.type === "B2B" ? "B2B" : "B2C"}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs">
        {seller ? (
          <span className="text-muted-foreground">{seller.fullName}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums text-foreground">
        {formatKm(vehicle.currentKm)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {last ? formatDateBR(last) : "—"}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-xs", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
        >
          {STATUS_LABEL[vehicle.cadastroStatus]}
        </Badge>
      </TableCell>
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
