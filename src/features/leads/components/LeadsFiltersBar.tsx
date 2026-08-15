import { useState, type ReactNode } from "react";
import type { ID, ISeller, IStore, LeadOrigin, LeadTemperature } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBRLCompact } from "@/shared/utils/format";
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
  /**
   * Options for the "Estágio" filter. Structural on purpose: with a funnel open
   * these are `ILeadFunnelStage`, and with the consolidated view they are the
   * store's legacy `IPipelineStage`. The bar only ever reads id and name.
   */
  stages: { id: ID; name: string }[];
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
  view: "kanban" | "list";
  className?: string;
}

/**
 * Filters that say what they are filtering by.
 *
 * They used to be seven identical, mute pills: the same word before and after
 * you picked something, with the applied value hidden behind a click and the
 * only evidence of state a badge at the far end of the bar counting them. Now
 * the pill carries the value, clearing one is on the pill itself, and "limpar
 * N" appears only when there is something to clear.
 */
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
          <MultiSelectFilter
            label={COPY.stage}
            icon="mdi:flag-outline"
            description={COPY.descriptions.stage}
            selected={filters.stageIds}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(next) => patch({ stageIds: next as ID[] })}
          />
        )}

        <MultiSelectFilter
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

        <MultiSelectFilter
          label={COPY.origin}
          icon="mdi:source-branch"
          description={COPY.descriptions.origin}
          selected={filters.origins}
          options={LEAD_ORIGINS.map((o) => ({ value: o, label: ORIGIN_META[o].label }))}
          onChange={(next) => patch({ origins: next as LeadOrigin[] })}
        />

        {canFilterSeller && (
          <MultiSelectFilter
            label={COPY.seller}
            icon="mdi:account-tie"
            description={COPY.descriptions.seller}
            searchable
            selected={filters.sellerIds}
            options={sellers.map((s) => ({ value: s.id, label: s.fullName }))}
            onChange={(next) => patch({ sellerIds: next as ID[] })}
          />
        )}

        <SingleSelectFilter
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

        <SingleSelectFilter
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

        <RangeFilter
          label={COPY.valueRange}
          icon="mdi:cash-multiple"
          description={COPY.descriptions.valueRange}
          min={filters.valueMin}
          max={filters.valueMax}
          onChange={(next) => patch({ valueMin: next.min, valueMax: next.max })}
        />

        {canFilterStore && stores.length > 1 && (
          <MultiSelectFilter
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

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="ml-auto h-8 gap-1 text-xs text-muted-foreground"
          >
            <Icon icon="mdi:close" size={13} aria-hidden />
            {COPY.clearCount(activeCount)}
          </Button>
        )}
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

interface IFilterPillProps {
  icon: string;
  label: string;
  /** The applied value. `undefined` means the filter is off. */
  value?: string;
  description: string;
  onClear: () => void;
  contentClassName?: string;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/**
 * One pill: the trigger and the clear affordance side by side inside a shared
 * frame, rather than nested — a `<button>` inside a `<button>` is invalid HTML,
 * and the browser resolves it by dropping the inner one.
 */
function FilterPill({
  icon,
  label,
  value,
  description,
  onClear,
  contentClassName,
  onOpenChange,
  children,
}: IFilterPillProps) {
  const active = value !== undefined;
  return (
    <Popover onOpenChange={onOpenChange}>
      <span
        className={cn(
          "inline-flex h-8 shrink-0 items-center rounded-md border text-xs transition",
          active
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-input bg-background text-foreground hover:bg-accent/50",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-full items-center gap-1.5 rounded-l-md px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  !active && "rounded-r-md",
                  active && "pr-1.5 font-semibold",
                )}
              >
                <Icon icon={icon} size={14} aria-hidden />
                <span className="max-w-[11rem] truncate">{active ? value : label}</span>
                {!active && (
                  <Icon icon="mdi:chevron-down" size={12} className="opacity-50" aria-hidden />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>

        {active && (
          <button
            type="button"
            onClick={onClear}
            aria-label={COPY.remove(label)}
            className="inline-flex h-full items-center rounded-r-md pl-0.5 pr-2 opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Icon icon="mdi:close" size={12} aria-hidden />
          </button>
        )}
      </span>
      <PopoverContent align="start" className={contentClassName}>
        {children}
      </PopoverContent>
    </Popover>
  );
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

function MultiSelectFilter<T extends string>({
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

  // The first pick spelled out, the rest counted. Listing all of them would
  // push a five-seller filter past the width of the bar it sits on.
  const [first] = selected;
  const firstLabel = options.find((o) => o.value === first)?.label ?? first;
  const value =
    selected.length === 0
      ? undefined
      : selected.length === 1
        ? firstLabel
        : `${firstLabel} ${COPY.more(selected.length - 1)}`;

  return (
    <FilterPill
      icon={icon}
      label={label}
      value={value}
      description={description}
      onClear={() => onChange([])}
      contentClassName="w-[260px] p-2"
    >
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
                    isSelected ? selected.filter((v) => v !== opt.value) : [...selected, opt.value],
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
    </FilterPill>
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

function SingleSelectFilter<T extends string>({
  label,
  icon,
  description,
  value,
  options,
  onChange,
}: ISingleSelectProps<T>) {
  // Option zero is "Qualquer" by construction — the neutral state, not a filter.
  const [neutral] = options;
  const active = neutral !== undefined && value !== neutral.value;
  const current = options.find((o) => o.value === value);

  return (
    <FilterPill
      icon={icon}
      label={label}
      value={active ? (current?.label ?? String(value)) : undefined}
      description={description}
      onClear={() => neutral && onChange(neutral.value)}
      contentClassName="w-[220px] p-1"
    >
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
    </FilterPill>
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

function RangeFilter({ label, icon, description, min, max, onChange }: IRangeProps) {
  const [minDraft, setMinDraft] = useState<string>(min !== undefined ? String(min) : "");
  const [maxDraft, setMaxDraft] = useState<string>(max !== undefined ? String(max) : "");

  const value =
    min === undefined && max === undefined
      ? undefined
      : min !== undefined && max !== undefined
        ? `${formatBRLCompact(min)} – ${formatBRLCompact(max)}`
        : min !== undefined
          ? `≥ ${formatBRLCompact(min)}`
          : `≤ ${formatBRLCompact(max as number)}`;

  return (
    <FilterPill
      icon={icon}
      label={label}
      value={value}
      description={description}
      onClear={() => {
        setMinDraft("");
        setMaxDraft("");
        onChange({ min: undefined, max: undefined });
      }}
      contentClassName="w-[260px] space-y-2 p-3"
      onOpenChange={(open) => {
        if (open) {
          setMinDraft(min !== undefined ? String(min) : "");
          setMaxDraft(max !== undefined ? String(max) : "");
        }
      }}
    >
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
    </FilterPill>
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
