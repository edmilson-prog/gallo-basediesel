import { useMemo } from "react";
import type {
  ISeller,
  IStore,
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activeOrderFilterCount,
  type IOrdersListFilters,
  type OrderDateRangeBucket,
  type OrderOriginFilterKind,
} from "../../utils/listFilters";
import { ORDER_STATUS_META } from "../OrderStatusBadge";
import { ORDER_ORIGIN_META } from "../OrderOriginBadge";
import { orderStatusLabel } from "../../utils/orderStatus";

const STATUS_OPTIONS: OrderStatus[] = [
  "aguardando_pagamento",
  "pago_aguardando_envio",
  "em_separacao",
  "enviado",
  "entregue",
  "concluido",
  "cancelado",
  "devolvido",
];

const PAYMENT_OPTIONS: OrderPaymentStatus[] = [
  "pendente",
  "parcial",
  "pago",
  "estornado",
  "vencido",
];

const FULFILL_OPTIONS: OrderFulfillmentStatus[] = [
  "pendente",
  "separacao",
  "expedido",
  "entregue",
  "devolvido",
  "cancelado",
];

const ORIGIN_OPTIONS: OrderOriginFilterKind[] = [
  "sdr",
  "quote",
  "manual",
  "ecommerce",
  "portal",
];

const DATE_LABELS: Record<OrderDateRangeBucket, string> = {
  any: "Qualquer período",
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  custom: "Personalizado",
};

const PAYMENT_LABELS: Record<OrderPaymentStatus, string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  estornado: "Estornado",
  vencido: "Vencido",
};

const FULFILL_LABELS: Record<OrderFulfillmentStatus, string> = {
  pendente: "Pendente",
  separacao: "Em separação",
  expedido: "Expedido",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

export function OrdersFiltersBar({
  filters,
  patch,
  onClear,
  sellers,
  stores,
  canFilterStore,
  canFilterSeller,
}: {
  filters: IOrdersListFilters;
  patch: (p: Partial<IOrdersListFilters>) => void;
  onClear: () => void;
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
}) {
  const filterCount = useMemo(() => activeOrderFilterCount(filters), [filters]);

  const toggleArray = <T extends string>(arr: T[], value: T): T[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-4 py-2 md:px-6">
      {/* Aggregate status */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:filter-variant" size={14} />
            Status
            {filters.statuses.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.statuses.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-1.5">
          {STATUS_OPTIONS.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.statuses.includes(s)}
                onCheckedChange={() => patch({ statuses: toggleArray(filters.statuses, s) })}
              />
              <span>{ORDER_STATUS_META[s].label}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Payment status */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:cash" size={14} />
            Pagamento
            {filters.paymentStatuses.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.paymentStatuses.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {PAYMENT_OPTIONS.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.paymentStatuses.includes(p)}
                onCheckedChange={() =>
                  patch({ paymentStatuses: toggleArray(filters.paymentStatuses, p) })
                }
              />
              <span>{PAYMENT_LABELS[p]}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Fulfillment status */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:truck-fast-outline" size={14} />
            Entrega
            {filters.fulfillmentStatuses.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.fulfillmentStatuses.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {FULFILL_OPTIONS.map((f) => (
            <label
              key={f}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.fulfillmentStatuses.includes(f)}
                onCheckedChange={() =>
                  patch({
                    fulfillmentStatuses: toggleArray(filters.fulfillmentStatuses, f),
                  })
                }
              />
              <span>{FULFILL_LABELS[f]}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Origin */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:source-branch" size={14} />
            Origem
            {filters.origins.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.origins.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {ORIGIN_OPTIONS.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.origins.includes(o)}
                onCheckedChange={() => patch({ origins: toggleArray(filters.origins, o) })}
              />
              <span>{ORDER_ORIGIN_META[o].label}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Sellers */}
      {canFilterSeller && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Icon icon="mdi:account-tie-outline" size={14} />
              Vendedor
              {filters.sellerIds.length > 0 && (
                <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {filters.sellerIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-64 space-y-1 overflow-y-auto">
            {sellers.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={filters.sellerIds.includes(s.id)}
                  onCheckedChange={() =>
                    patch({ sellerIds: toggleArray(filters.sellerIds, s.id) })
                  }
                />
                <span className="truncate">{s.fullName}</span>
              </label>
            ))}
            {sellers.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum vendedor.</p>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Date range */}
      <Select
        value={filters.dateRange}
        onValueChange={(v) => patch({ dateRange: v as OrderDateRangeBucket })}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(DATE_LABELS) as OrderDateRangeBucket[]).map((k) => (
            <SelectItem key={k} value={k}>
              {DATE_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.dateRange === "custom" && (
        <>
          <Input
            type="date"
            className="h-9 w-36"
            value={filters.dateFrom ?? ""}
            onChange={(e) => patch({ dateFrom: e.target.value || undefined })}
          />
          <Input
            type="date"
            className="h-9 w-36"
            value={filters.dateTo ?? ""}
            onChange={(e) => patch({ dateTo: e.target.value || undefined })}
          />
        </>
      )}

      {/* Total range */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:currency-brl" size={14} />
            Valor
            {(filters.totalMin !== undefined || filters.totalMax !== undefined) && (
              <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Mínimo (R$)</label>
            <Input
              type="number"
              value={filters.totalMin ?? ""}
              onChange={(e) =>
                patch({ totalMin: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Máximo (R$)</label>
            <Input
              type="number"
              value={filters.totalMax ?? ""}
              onChange={(e) =>
                patch({ totalMax: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Store (Owner) */}
      {canFilterStore && stores.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Icon icon="mdi:store-outline" size={14} />
              Loja
              {filters.storeIds.length > 0 && (
                <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {filters.storeIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 space-y-1">
            {stores.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={filters.storeIds.includes(s.id)}
                  onCheckedChange={() => patch({ storeIds: toggleArray(filters.storeIds, s.id) })}
                />
                <span className="truncate">{s.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {filterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
          <Icon icon="mdi:close" size={14} />
          Limpar ({filterCount})
        </Button>
      )}

      {/* Active status pills — hint of selected aggregate filters */}
      {filters.statuses.length > 0 && (
        <div className="hidden items-center gap-1 text-[11px] text-muted-foreground lg:flex">
          <Icon icon="mdi:chevron-right" size={12} />
          {filters.statuses.map((s) => orderStatusLabel(s)).join(" · ")}
        </div>
      )}
    </div>
  );
}
