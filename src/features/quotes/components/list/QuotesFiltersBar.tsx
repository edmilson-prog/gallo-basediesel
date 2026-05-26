import { useMemo } from "react";
import type { ISeller, IStore, QuoteOrigin, QuoteStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  activeFilterCount,
  type DateRangeBucket,
  type IQuotesListFilters,
  type ValidityBucket,
} from "../../utils/listFilters";
import { QUOTE_STATUS_META } from "../QuoteStatusBadge";
import { QUOTE_ORIGIN_META } from "../QuoteOriginBadge";

const STATUS_OPTIONS: QuoteStatus[] = [
  "rascunho",
  "enviado",
  "aceito",
  "recusado",
  "expirado",
  "convertido",
];
const ORIGIN_OPTIONS: QuoteOrigin[] = ["sdr", "vendedor", "cliente_portal", "ecommerce"];

const DATE_LABELS: Record<DateRangeBucket, string> = {
  any: "Qualquer período",
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  custom: "Personalizado",
};

const VALIDITY_LABELS: Record<ValidityBucket, string> = {
  any: "Qualquer validade",
  expiring_soon: "Expirando em 3 dias",
  expired: "Expirado",
  valid: "Válido",
};

export function QuotesFiltersBar({
  filters,
  patch,
  onClear,
  sellers,
  stores,
  canFilterStore,
  canFilterSeller,
}: {
  filters: IQuotesListFilters;
  patch: (p: Partial<IQuotesListFilters>) => void;
  onClear: () => void;
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
}) {
  const filterCount = useMemo(() => activeFilterCount(filters), [filters]);

  const toggleArray = <T extends string>(arr: T[], value: T): T[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-4 py-2 md:px-6">
      {/* Status */}
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
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {STATUS_OPTIONS.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.statuses.includes(s)}
                onCheckedChange={() => patch({ statuses: toggleArray(filters.statuses, s) })}
              />
              <span>{QUOTE_STATUS_META[s].label}</span>
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
              <span>{QUOTE_ORIGIN_META[o].label}</span>
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
                  onCheckedChange={() => patch({ sellerIds: toggleArray(filters.sellerIds, s.id) })}
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
        onValueChange={(v) => patch({ dateRange: v as DateRangeBucket })}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(DATE_LABELS) as DateRangeBucket[]).map((k) => (
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

      {/* Total */}
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

      {/* Validity */}
      <Select
        value={filters.validity}
        onValueChange={(v) => patch({ validity: v as ValidityBucket })}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(VALIDITY_LABELS) as ValidityBucket[]).map((k) => (
            <SelectItem key={k} value={k}>
              {VALIDITY_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
    </div>
  );
}
