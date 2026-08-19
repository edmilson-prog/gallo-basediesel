import { useState } from "react";
import type { ID, ISeller, IStore, VehicleCadastroStatus } from "@/shared/types";
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
  CADASTRO_STATUS_KEYS,
  VEHICLE_BRANDS,
  countActiveFilters,
  type IVehiclesListFilters,
} from "../../utils/listFilters";
import { STATUS_LABEL } from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.filters;

export interface IVehiclesFiltersBarProps {
  filters: IVehiclesListFilters;
  patch: (patch: Partial<IVehiclesListFilters>) => void;
  onClear: () => void;
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
  isManagerOrOwner: boolean;
  className?: string;
}

export function VehiclesFiltersBar({
  filters,
  patch,
  onClear,
  sellers,
  stores,
  canFilterStore,
  canFilterSeller,
  isManagerOrOwner,
  className,
}: IVehiclesFiltersBarProps) {
  // "Pendentes" now lives in the header's queue chips, alongside the two other
  // enrichment backlogs it belongs with — see VehiclesQueueChips.
  const activeCount = countActiveFilters(filters);

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <MultiSelectPopover
          label={COPY.brand}
          icon="mdi:car-info"
          description="Filtrar por marca do veículo"
          selected={filters.brands}
          options={VEHICLE_BRANDS.map((b) => ({ value: b, label: b }))}
          onChange={(next) => patch({ brands: next })}
        />

        <TextFilterPopover
          label={COPY.model}
          icon="mdi:car-side"
          description="Filtrar pelo modelo do veículo"
          value={filters.model}
          onChange={(next) => patch({ model: next })}
          placeholder="ex.: FH540"
        />

        <YearRangePopover
          yearMin={filters.yearMin}
          yearMax={filters.yearMax}
          description="Filtrar por faixa de ano de fabricação"
          onChange={(next) => patch({ yearMin: next.yearMin, yearMax: next.yearMax })}
        />

        <TextFilterPopover
          label={COPY.engine}
          icon="mdi:engine"
          description="Filtrar pelo motor do veículo"
          value={filters.engine}
          onChange={(next) => patch({ engine: next })}
          placeholder="ex.: DC13"
        />

        <MultiSelectPopover
          label={COPY.status}
          icon="mdi:check-decagram-outline"
          description="Filtrar pelo status do cadastro (aprovado, pendente, rejeitado)"
          selected={filters.cadastroStatuses}
          options={CADASTRO_STATUS_KEYS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          onChange={(next) => patch({ cadastroStatuses: next as VehicleCadastroStatus[] })}
        />

        {canFilterSeller && (
          <MultiSelectPopover
            label="Vendedor"
            icon="mdi:account-tie"
            description="Filtrar pelos veículos de um ou mais vendedores"
            searchable
            selected={filters.sellerIds}
            options={sellers.map((s) => ({ value: s.id, label: s.fullName }))}
            onChange={(next) => patch({ sellerIds: next as ID[] })}
          />
        )}

        {canFilterStore && stores.length > 1 && (
          <MultiSelectPopover
            label={COPY.store}
            icon="mdi:store"
            description="Filtrar pela loja de origem do veículo"
            selected={filters.storeIds}
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(next) => patch({ storeIds: next as ID[] })}
          />
        )}

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {activeCount} {activeCount === 1 ? "filtro ativo" : "filtros ativos"}
            </Badge>
          )}
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
              <Icon icon="mdi:close-circle-outline" size={14} />
              {COPY.clear}
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

interface ITextFilterPopoverProps {
  label: string;
  icon: string;
  description: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}

function TextFilterPopover({
  label,
  icon,
  description,
  value,
  placeholder,
  onChange,
}: ITextFilterPopoverProps) {
  const [draft, setDraft] = useState(value);
  const active = value.trim().length > 0;
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setDraft(value);
      }}
    >
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
      <PopoverContent align="start" className="w-[240px] space-y-2 p-3">
        <Input
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setDraft("");
              onChange("");
            }}
          >
            Limpar
          </Button>
          <Button size="sm" className="text-xs" onClick={() => onChange(draft.trim())}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface IYearRangePopoverProps {
  yearMin?: number;
  yearMax?: number;
  description: string;
  onChange: (next: { yearMin?: number; yearMax?: number }) => void;
}

function YearRangePopover({ yearMin, yearMax, description, onChange }: IYearRangePopoverProps) {
  const [minDraft, setMinDraft] = useState<string>(yearMin !== undefined ? String(yearMin) : "");
  const [maxDraft, setMaxDraft] = useState<string>(yearMax !== undefined ? String(yearMax) : "");
  const active = yearMin !== undefined || yearMax !== undefined;
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setMinDraft(yearMin !== undefined ? String(yearMin) : "");
          setMaxDraft(yearMax !== undefined ? String(yearMax) : "");
        }
      }}
    >
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
              <Icon icon="mdi:calendar" size={14} />
              {VEHICLE_STRINGS.filters.yearRange}
              {active && (
                <span className="text-[10px]">
                  {yearMin ?? "•"}–{yearMax ?? "•"}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-[260px] space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={minDraft}
            placeholder={VEHICLE_STRINGS.filters.yearMin}
            onChange={(e) => setMinDraft(e.target.value)}
            className="h-8 text-xs"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            value={maxDraft}
            placeholder={VEHICLE_STRINGS.filters.yearMax}
            onChange={(e) => setMaxDraft(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setMinDraft("");
              setMaxDraft("");
              onChange({ yearMin: undefined, yearMax: undefined });
            }}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={() => {
              const min = minDraft.trim() ? Number(minDraft) : undefined;
              const max = maxDraft.trim() ? Number(maxDraft) : undefined;
              onChange({
                yearMin: Number.isFinite(min) ? min : undefined,
                yearMax: Number.isFinite(max) ? max : undefined,
              });
            }}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
