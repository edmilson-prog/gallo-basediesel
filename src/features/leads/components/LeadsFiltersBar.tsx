import { useState } from "react";
import type {
  ID,
  IPipelineStage,
  ISeller,
  IStore,
  LeadOrigin,
  LeadTemperature,
} from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LEAD_ORIGINS,
  LEAD_TEMPERATURES,
  NEXT_ACTION_FILTERS,
  PERIOD_FILTERS,
  type ILeadsListFilters,
  type NextActionFilter,
  type PeriodFilter,
} from "../utils/listFilters";
import { ORIGIN_META, TEMPERATURE_META } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.filters;

export interface ILeadsFiltersBarProps {
  filters: ILeadsListFilters;
  patch: (patch: Partial<ILeadsListFilters>) => void;
  onClear: () => void;
  stages: IPipelineStage[];
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
  view: "kanban" | "list";
  className?: string;
}

export function LeadsFiltersBar({
  filters,
  patch,
  onClear,
  stages,
  sellers,
  stores,
  canFilterStore,
  canFilterSeller,
  view,
  className,
}: ILeadsFiltersBarProps) {
  const activeCount = countActive(filters);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2",
          className,
        )}
      >
        {view === "list" && (
          <MultiSelectPopover
            label={COPY.stage}
            icon="mdi:flag-outline"
            description={COPY.descriptions.stage}
            selected={filters.stageIds}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(next) => patch({ stageIds: next as ID[] })}
          />
        )}

        <MultiSelectPopover
          label={COPY.temperature}
          icon="mdi:thermometer"
          description={COPY.descriptions.temperature}
          selected={filters.temperatures}
          options={LEAD_TEMPERATURES.map((t) => ({
            value: t,
            label: TEMPERATURE_META[t].label,
          }))}
          onChange={(next) => patch({ temperatures: next as LeadTemperature[] })}
        />

        <MultiSelectPopover
          label={COPY.origin}
          icon="mdi:source-branch"
          description={COPY.descriptions.origin}
          selected={filters.origins}
          options={LEAD_ORIGINS.map((o) => ({ value: o, label: ORIGIN_META[o].label }))}
          onChange={(next) => patch({ origins: next as LeadOrigin[] })}
        />

        {canFilterSeller && (
          <MultiSelectPopover
            label={COPY.seller}
            icon="mdi:account-tie"
            description={COPY.descriptions.seller}
            searchable
            selected={filters.sellerIds}
            options={sellers.map((s) => ({ value: s.id, label: s.fullName }))}
            onChange={(next) => patch({ sellerIds: next as ID[] })}
          />
        )}

        <SingleSelectPopover
          label={COPY.nextAction}
          icon="mdi:calendar-clock-outline"
          description={COPY.descriptions.nextAction}
          value={filters.nextAction}
          options={NEXT_ACTION_FILTERS.map((k) => ({
            value: k,
            label: COPY.nextActionOptions[k],
          }))}
          onChange={(next) => patch({ nextAction: next as NextActionFilter })}
        />

        <SingleSelectPopover
          label={COPY.period}
          icon="mdi:calendar"
          description={COPY.descriptions.period}
          value={filters.period}
          options={PERIOD_FILTERS.map((k) => ({
            value: k,
            label: COPY.periodOptions[k],
          }))}
          onChange={(next) => patch({ period: next as PeriodFilter })}
        />

        <RangePopover
          label={COPY.valueRange}
          icon="mdi:cash-multiple"
          description={COPY.descriptions.valueRange}
          min={filters.valueMin}
          max={filters.valueMax}
          onChange={(next) => patch({ valueMin: next.min, valueMax: next.max })}
        />

        {canFilterStore && stores.length > 1 && (
          <MultiSelectPopover
            label={COPY.store}
            icon="mdi:store"
            description={COPY.descriptions.store}
            selected={filters.storeIds}
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(next) => patch({ storeIds: next as ID[] })}
          />
        )}

        <ToggleChip
          active={filters.includeLost}
          onToggle={() => patch({ includeLost: !filters.includeLost })}
          icon="mdi:close-octagon-outline"
          label={COPY.showLost}
          description={COPY.descriptions.showLost}
        />
        <ToggleChip
          active={filters.includeConverted}
          onToggle={() => patch({ includeConverted: !filters.includeConverted })}
          icon="mdi:check-decagram-outline"
          label={COPY.showConverted}
          description={COPY.descriptions.showConverted}
        />

        <div className="ml-auto flex items-center gap-2">
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
        </div>
      </div>
    </TooltipProvider>
  );
}

function countActive(f: ILeadsListFilters): number {
  let n = 0;
  if (f.stageIds.length > 0) n++;
  if (f.temperatures.length > 0) n++;
  if (f.origins.length > 0) n++;
  if (f.sellerIds.length > 0) n++;
  if (f.storeIds.length > 0) n++;
  if (f.nextAction !== "any") n++;
  if (f.period !== "any") n++;
  if (f.valueMin !== undefined || f.valueMax !== undefined) n++;
  if (f.includeLost) n++;
  if (f.includeConverted) n++;
  return n;
}

interface IOption<T extends string> {
  value: T;
  label: string;
}

interface IMultiSelectProps<T extends string> {
  label: string;
  icon: string;
  description: string;
  selected: T[];
  options: IOption<T>[];
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
}: IMultiSelectProps<T>) {
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

interface ISingleSelectProps<T extends string> {
  label: string;
  icon: string;
  description: string;
  value: T;
  options: IOption<T>[];
  onChange: (next: T) => void;
}

function SingleSelectPopover<T extends string>({
  label,
  icon,
  description,
  value,
  options,
  onChange,
}: ISingleSelectProps<T>) {
  const active = value !== options[0].value;
  const current = options.find((o) => o.value === value);
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
              {active && current && (
                <span className="text-[10px] text-muted-foreground">· {current.label}</span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-[220px] p-1">
        {options.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground",
              opt.value === value && "bg-accent text-accent-foreground",
            )}
          >
            <span>{opt.label}</span>
            {opt.value === value && <Icon icon="mdi:check" size={12} />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface IRangeProps {
  label: string;
  icon: string;
  description: string;
  min?: number;
  max?: number;
  onChange: (next: { min?: number; max?: number }) => void;
}

function RangePopover({ label, icon, description, min, max, onChange }: IRangeProps) {
  const [minDraft, setMinDraft] = useState<string>(min !== undefined ? String(min) : "");
  const [maxDraft, setMaxDraft] = useState<string>(max !== undefined ? String(max) : "");
  const active = min !== undefined || max !== undefined;
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setMinDraft(min !== undefined ? String(min) : "");
          setMaxDraft(max !== undefined ? String(max) : "");
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
              <Icon icon={icon} size={14} />
              {label}
              {active && (
                <span className="text-[10px]">
                  {min ?? "•"}–{max ?? "•"}
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
            placeholder="Mín."
            onChange={(e) => setMinDraft(e.target.value)}
            className="h-8 text-xs"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            value={maxDraft}
            placeholder="Máx."
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
              onChange({ min: undefined, max: undefined });
            }}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={() => {
              const n1 = minDraft.trim() ? Number(minDraft) : undefined;
              const n2 = maxDraft.trim() ? Number(maxDraft) : undefined;
              onChange({
                min: Number.isFinite(n1) ? n1 : undefined,
                max: Number.isFinite(n2) ? n2 : undefined,
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

interface IToggleChipProps {
  active: boolean;
  onToggle: () => void;
  icon: string;
  label: string;
  description: string;
}

/**
 * These two chips WIDEN the set (they let lost/converted leads back in) rather
 * than narrowing it like every other control on this bar. A solid `default`
 * fill made them read as the strongest filter applied, which is the opposite
 * of what they do — so inclusion gets its own treatment: dashed while off,
 * muted-solid while on, and never the primary fill reserved for restriction.
 */
function ToggleChip({ active, onToggle, icon, label, description }: IToggleChipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={active}
          onClick={onToggle}
          className={cn(
            "h-8 gap-1.5 border-dashed text-xs",
            active && "border-solid bg-muted text-foreground",
          )}
        >
          <Icon icon={icon} size={14} />
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}
