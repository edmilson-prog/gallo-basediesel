import { useMemo, useState } from "react";
import type { CustomerStatus, ICustomer, ID, ISeller, IStore } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ABC_KEYS,
  RECENCY_BUCKETS,
  STATUS_KEYS,
  VEHICLE_BRANDS,
  type AbcKey,
  type ICustomersListFilters,
  type PositivationFilter,
  type VehicleBrandName,
} from "../../utils/listFilters";
import type { INumericRange, RecencyBucket } from "@/providers/data";

const STATUS_LABELS: Record<CustomerStatus, string> = {
  ativo: "Ativo",
  dormente: "Dormente",
  recuperacao: "Recuperação",
  perdido: "Perdido",
};

const ABC_LABELS: Record<AbcKey, string> = {
  A: "A",
  B: "B",
  C: "C",
  none: "Sem classificação",
};

const RECENCY_LABELS: Record<RecencyBucket, string> = {
  "0-30": "0–30 dias",
  "31-90": "31–90 dias",
  "91-180": "91–180 dias",
  "180+": "180+ dias",
};

export interface ICustomersFiltersBarProps {
  filters: ICustomersListFilters;
  patch: (patch: Partial<ICustomersListFilters>) => void;
  onClear: () => void;
  sellers: ISeller[];
  stores: IStore[];
  availableTags: string[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
  isManagerOrOwner: boolean;
  className?: string;
}

export function CustomersFiltersBar({
  filters,
  patch,
  onClear,
  sellers,
  stores,
  availableTags,
  canFilterStore,
  canFilterSeller,
  isManagerOrOwner,
  className,
}: ICustomersFiltersBarProps) {
  const activeCount = useMemo(() => countActive(filters), [filters]);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2",
          className,
        )}
      >
        <MultiSelectPopover
          label="Status"
          icon="mdi:circle-medium"
          description="Filtrar por status do cliente (ativo, dormente, recuperação, perdido)"
          selected={filters.statuses}
          options={STATUS_KEYS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          onChange={(next) => patch({ statuses: next as CustomerStatus[] })}
        />

        <TypeToggle type={filters.type} onChange={(next) => patch({ type: next })} />

        <MultiSelectPopover
          label="ABC"
          icon="mdi:chart-arc"
          description="Filtrar pela curva ABC — participação de cada cliente na receita"
          selected={filters.abcClasses}
          options={ABC_KEYS.map((k) => ({ value: k, label: ABC_LABELS[k] }))}
          onChange={(next) => patch({ abcClasses: next as AbcKey[] })}
        />

        <MultiSelectPopover
          label="Tags"
          icon="mdi:tag-multiple-outline"
          description="Filtrar por etiquetas atribuídas aos clientes"
          selected={filters.tags}
          searchable
          options={availableTags.map((t) => ({ value: t, label: t }))}
          onChange={(next) => patch({ tags: next })}
        />

        {canFilterSeller && (
          <MultiSelectPopover
            label="Vendedor"
            icon="mdi:account-tie"
            description="Filtrar pelos clientes de um ou mais vendedores"
            selected={filters.sellerIds}
            searchable
            options={sellers.map((s) => ({ value: s.id, label: s.fullName }))}
            onChange={(next) => patch({ sellerIds: next })}
          />
        )}

        <MultiSelectPopover
          label="Recência"
          icon="mdi:clock-outline"
          description="Filtrar pelo tempo desde a última compra do cliente"
          selected={filters.recencyBuckets}
          options={RECENCY_BUCKETS.map((b) => ({ value: b, label: RECENCY_LABELS[b] }))}
          onChange={(next) => patch({ recencyBuckets: next as RecencyBucket[] })}
        />

        <SingleSelectPopover
          label="Positivação"
          icon="mdi:account-check-outline"
          description="Filtrar por clientes que compraram (positivaram) no mês corrente"
          value={filters.positivation}
          options={[
            { value: "all", label: "Todos" },
            { value: "positivado", label: "Positivados este mês" },
            { value: "nao_positivado", label: "Não positivados" },
          ]}
          onChange={(next) => patch({ positivation: next })}
          isActive={filters.positivation !== "all"}
        />

        <RangePopover
          label="Ticket médio"
          icon="mdi:cash-multiple"
          description="Filtrar pela faixa de ticket médio dos últimos 12 meses"
          range={filters.ticketRange}
          presets={[
            { label: "< R$ 500", range: { max: 500 } },
            { label: "R$ 500–2k", range: { min: 500, max: 2000 } },
            { label: "R$ 2k–10k", range: { min: 2000, max: 10_000 } },
            { label: "> R$ 10k", range: { min: 10_000 } },
          ]}
          onChange={(next) => patch({ ticketRange: next })}
        />

        <RangePopover
          label="LTV"
          icon="mdi:trophy-outline"
          description="Filtrar pela faixa de valor total histórico (LTV) do cliente"
          range={filters.ltvRange}
          presets={[
            { label: "< R$ 5 mil", range: { max: 5000 } },
            { label: "R$ 5–50 mil", range: { min: 5000, max: 50_000 } },
            { label: "> R$ 50 mil", range: { min: 50_000 } },
          ]}
          onChange={(next) => patch({ ltvRange: next })}
        />

        <MultiSelectPopover
          label="Veículo"
          icon="mdi:truck"
          description="Filtrar por marca de veículo presente na frota do cliente"
          selected={filters.vehicleBrands}
          options={[
            { value: "any", label: "Qualquer veículo" },
            ...VEHICLE_BRANDS.map((b) => ({ value: b, label: b })),
          ]}
          onChange={(next) => patch({ vehicleBrands: next as (VehicleBrandName | "any")[] })}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={filters.hasB2BPortal}
              onClick={() => patch({ hasB2BPortal: !filters.hasB2BPortal })}
              className={cn(
                "h-8 gap-1.5 text-xs",
                filters.hasB2BPortal && "border-primary/40 bg-primary/5 text-primary",
              )}
            >
              <Icon icon="mdi:account-tie-outline" size={14} />
              Portal B2B
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mostrar apenas clientes com acesso ao Portal B2B</TooltipContent>
        </Tooltip>

        {canFilterStore && stores.length > 1 && (
          <MultiSelectPopover
            label="Loja"
            icon="mdi:store"
            description="Filtrar pela loja de origem do cliente"
            selected={filters.storeIds}
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(next) => patch({ storeIds: next })}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {activeCount > 0 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {activeCount} {activeCount === 1 ? "filtro ativo" : "filtros ativos"}
            </Badge>
          )}
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
              <Icon icon="mdi:close-circle-outline" size={14} />
              Limpar tudo
            </Button>
          )}
          {!isManagerOrOwner && (
            <span className="text-[10px] text-muted-foreground">
              Visualizando apenas sua carteira
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function countActive(f: ICustomersListFilters): number {
  let n = 0;
  if (f.statuses.length > 0) n += 1;
  if (f.type !== "all") n += 1;
  if (f.abcClasses.length > 0) n += 1;
  if (f.tags.length > 0) n += 1;
  if (f.sellerIds.length > 0) n += 1;
  if (f.recencyBuckets.length > 0) n += 1;
  if (f.ticketRange && (f.ticketRange.min || f.ticketRange.max)) n += 1;
  if (f.ltvRange && (f.ltvRange.min || f.ltvRange.max)) n += 1;
  if (f.vehicleBrands.length > 0) n += 1;
  if (f.storeIds.length > 0) n += 1;
  if (f.positivation !== "all") n += 1;
  if (f.hasB2BPortal) n += 1;
  return n;
}

interface IMultiOption<T extends string> {
  value: T;
  label: string;
}

interface IMultiSelectPopoverProps<T extends string> {
  label: string;
  icon: string;
  description: string;
  selected: T[];
  options: IMultiOption<T>[];
  onChange: (next: T[]) => void;
  searchable?: boolean;
}

function MultiSelectPopover<T extends string>({
  label,
  icon,
  description,
  selected,
  options,
  onChange,
  searchable = false,
}: IMultiSelectPopoverProps<T>) {
  const [query, setQuery] = useState("");
  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const active = selected.length > 0;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs",
                active && "border-primary/40 bg-primary/5 text-primary",
              )}
            >
              <Icon icon={icon} size={14} />
              {label}
              {active && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-semibold">
                  {selected.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-[260px] p-2">
        {searchable && (
          <Input
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 h-8 text-xs"
          />
        )}
        <ScrollArea className="max-h-[260px] pr-2">
          <div className="space-y-1">
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma opção</p>
            )}
            {filtered.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => {
                    onChange(
                      isSelected
                        ? selected.filter((v) => v !== opt.value)
                        : [...selected, opt.value],
                    );
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  <Checkbox checked={isSelected} className="pointer-events-none" />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onChange([])}>
              Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ISingleSelectOption {
  value: PositivationFilter;
  label: string;
}

interface ISingleSelectPopoverProps {
  label: string;
  icon: string;
  description: string;
  value: PositivationFilter;
  options: ISingleSelectOption[];
  onChange: (next: PositivationFilter) => void;
  isActive: boolean;
}

function SingleSelectPopover({
  label,
  icon,
  description,
  value,
  options,
  onChange,
  isActive,
}: ISingleSelectPopoverProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs",
                isActive && "border-primary/40 bg-primary/5 text-primary",
              )}
            >
              <Icon icon={icon} size={14} />
              {label}
              {isActive && <span className="text-[10px]">✓</span>}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-[220px] p-2">
        <div className="space-y-1">
          {options.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground",
                  selected && "bg-accent text-accent-foreground",
                )}
              >
                <Icon
                  icon={selected ? "mdi:radiobox-marked" : "mdi:radiobox-blank"}
                  size={14}
                  className={selected ? "text-primary" : "text-muted-foreground"}
                />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ITypeToggleProps {
  type: ICustomersListFilters["type"];
  onChange: (next: ICustomersListFilters["type"]) => void;
}

function TypeToggle({ type, onChange }: ITypeToggleProps) {
  const options: { value: ICustomersListFilters["type"]; label: string; description: string }[] = [
    { value: "all", label: "Ambos", description: "Mostrar clientes B2B e B2C" },
    { value: "B2B", label: "B2B", description: "Mostrar apenas pessoas jurídicas (B2B)" },
    { value: "B2C", label: "B2C", description: "Mostrar apenas pessoas físicas (B2C)" },
  ];
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-border bg-muted/30 p-0.5 text-xs">
      {options.map((o) => (
        <Tooltip key={o.value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded px-2 py-1 transition-colors",
                type === o.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          </TooltipTrigger>
          <TooltipContent>{o.description}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

interface IRangePopoverProps {
  label: string;
  icon: string;
  description: string;
  range: INumericRange | undefined;
  presets: { label: string; range: INumericRange }[];
  onChange: (range: INumericRange | undefined) => void;
}

function RangePopover({ label, icon, description, range, presets, onChange }: IRangePopoverProps) {
  const [min, setMin] = useState<string>(range?.min !== undefined ? String(range.min) : "");
  const [max, setMax] = useState<string>(range?.max !== undefined ? String(range.max) : "");
  const active = Boolean(range && (range.min || range.max));

  const apply = () => {
    const next: INumericRange = {};
    if (min.trim() !== "" && Number.isFinite(Number(min))) next.min = Number(min);
    if (max.trim() !== "" && Number.isFinite(Number(max))) next.max = Number(max);
    if (next.min === undefined && next.max === undefined) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs",
                active && "border-primary/40 bg-primary/5 text-primary",
              )}
            >
              <Icon icon={icon} size={14} />
              {label}
              {active && <span className="text-[10px]">✓</span>}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-[260px] space-y-2 p-3">
        <div className="space-y-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setMin(p.range.min !== undefined ? String(p.range.min) : "");
                setMax(p.range.max !== undefined ? String(p.range.max) : "");
                onChange(p.range);
              }}
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Personalizado
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Mín"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="h-8 text-xs"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="number"
              placeholder="Máx"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex justify-end gap-1 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                setMin("");
                setMax("");
                onChange(undefined);
              }}
            >
              Limpar
            </Button>
            <Button size="sm" className="text-xs" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
