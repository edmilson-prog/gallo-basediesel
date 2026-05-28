import type { ID, ISeller, IStore, MovementType } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { INVENTORY_MOVEMENT_STRINGS as S } from "../i18n/pt-BR";
import { MOVEMENT_TYPE_LABELS } from "./MovementTypeBadge";
import type { MovementPeriod } from "../hooks/useInventoryMovementsFilters";

const TYPE_OPTIONS: MovementType[] = [
  "saida_venda",
  "devolucao",
  "entrada_compra",
  "ajuste_inventario",
  "transferencia_loja",
];

const PERIOD_OPTIONS: { value: MovementPeriod; label: string }[] = [
  { value: "all", label: S.filtersPeriodAll },
  { value: "24h", label: S.periodLast24h },
  { value: "7d", label: S.periodLast7d },
  { value: "30d", label: S.periodLast30d },
  { value: "90d", label: S.periodLast90d },
];

export interface IMovementHeaderProps {
  type: MovementType | "all";
  onTypeChange: (t: MovementType | "all") => void;
  productQuery: string;
  onProductQueryChange: (q: string) => void;
  period: MovementPeriod;
  onPeriodChange: (p: MovementPeriod) => void;
  sellerId: ID | "all";
  onSellerChange: (id: ID | "all") => void;
  storeId: ID | "all";
  onStoreChange: (id: ID | "all") => void;
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  activeCount: number;
  onClear: () => void;
}

export function MovementHeader(props: IMovementHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-foreground">
            {S.pageTitle}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{S.pageSubtitle}</p>
        </div>
        <NewMovementButton />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {S.filtersPart}
          </label>
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={props.productQuery}
              onChange={(e) => props.onProductQueryChange(e.target.value)}
              placeholder={S.filtersPartPlaceholder}
              className="pl-8"
            />
          </div>
        </div>

        <FilterSelect
          label={S.filtersType}
          value={props.type}
          onChange={(v) => props.onTypeChange(v as MovementType | "all")}
          allLabel={S.filtersTypeAll}
          options={TYPE_OPTIONS.map((t) => ({ value: t, label: MOVEMENT_TYPE_LABELS[t] }))}
        />

        <FilterSelect
          label={S.filtersPeriod}
          value={props.period}
          onChange={(v) => props.onPeriodChange(v as MovementPeriod)}
          options={PERIOD_OPTIONS}
        />

        <FilterSelect
          label={S.filtersSeller}
          value={props.sellerId}
          onChange={(v) => props.onSellerChange(v)}
          allLabel={S.filtersSellerAll}
          options={props.sellers.map((s) => ({ value: s.id, label: s.fullName }))}
        />

        {props.canFilterStore && (
          <FilterSelect
            label={S.filtersStore}
            value={props.storeId}
            onChange={(v) => props.onStoreChange(v)}
            allLabel={S.filtersStoreAll}
            options={props.stores.map((st) => ({ value: st.id, label: st.name }))}
          />
        )}
      </div>

      {props.activeCount > 0 && (
        <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {props.activeCount} filtro{props.activeCount > 1 ? "s" : ""} ativo
            {props.activeCount > 1 ? "s" : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={props.onClear}>
            <Icon icon="mdi:close" size={14} className="mr-1" />
            {S.filtersClear}
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value="all">{allLabel}</SelectItem>}
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewMovementButton() {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-block">
            <Button variant="outline" disabled className="cursor-not-allowed">
              <Icon icon="mdi:plus" size={16} className="mr-1.5" />
              {S.newMovementCta}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {S.newMovementTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
