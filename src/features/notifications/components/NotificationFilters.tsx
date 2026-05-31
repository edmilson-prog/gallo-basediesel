import type { NotificationCategory, NotificationSeverity } from "@/providers/notifications";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ALL_CATEGORIES,
  ALL_SEVERITIES,
  EMPTY_NOTIFICATION_FILTERS,
  hasActiveNotificationFilters,
  toggleInArray,
  type INotificationFilters,
  type NotificationStatusFilter,
} from "@/features/notifications/lib/notificationFilters";
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
} from "@/features/notifications/lib/severity";

interface NotificationFiltersProps {
  variant: "sidebar" | "bar";
  filters: INotificationFilters;
  /** Optional per-category unread/total counts. */
  counts?: Partial<Record<NotificationCategory, number>>;
  onChange: (next: INotificationFilters) => void;
  onClear: () => void;
}

const STATUS_OPTIONS: Array<{ value: NotificationStatusFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "unread", label: "Não-lidas" },
  { value: "archived", label: "Arquivadas" },
];

// ---------------------------------------------------------------------------
// Sidebar variant
// ---------------------------------------------------------------------------

function SidebarFilters({
  filters,
  counts,
  onChange,
  onClear,
}: Omit<NotificationFiltersProps, "variant">) {
  const hasActive = hasActiveNotificationFilters(filters);

  return (
    <div className="flex flex-col gap-5">
      {/* Status */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </h3>
        <ToggleGroup
          type="single"
          value={filters.status}
          onValueChange={(val) => {
            if (!val) return; // prevent de-selecting all
            onChange({ ...filters, status: val as NotificationStatusFilter });
          }}
          className="flex-col items-stretch gap-1"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              className="justify-start px-3 text-sm"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      {/* Categories */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Categorias
        </h3>
        <ul className="flex flex-col gap-0.5" role="list">
          {ALL_CATEGORIES.map((cat) => {
            const isActive = filters.categories.includes(cat);
            const count = counts?.[cat];
            return (
              <li key={cat}>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      categories: toggleInArray(filters.categories, cat),
                    })
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-pressed={isActive}
                >
                  <Icon
                    icon={CATEGORY_ICON[cat]}
                    size={16}
                    className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
                  />
                  <span className="flex-1 text-left">{CATEGORY_LABEL[cat]}</span>
                  {count !== undefined && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Severities */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Severidade
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {ALL_SEVERITIES.map((sev) => {
            const isActive = filters.severities.includes(sev);
            const tone = SEVERITY_TONE[sev];
            return (
              <button
                key={sev}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    severities: toggleInArray(filters.severities, sev),
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isActive
                    ? [tone.bg, tone.text, tone.border]
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={isActive}
              >
                {SEVERITY_LABEL[sev]}
              </button>
            );
          })}
        </div>
      </section>

      {/* Clear */}
      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          <Icon icon="mdi:filter-off" size={14} />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar variant
// ---------------------------------------------------------------------------

function BarFilters({
  filters,
  counts,
  onChange,
  onClear,
}: Omit<NotificationFiltersProps, "variant">) {
  const hasActive = hasActiveNotificationFilters(filters);

  const activeCategoryCount = filters.categories.length;
  const activeSeverityCount = filters.severities.length;

  function removeCategory(cat: NotificationCategory) {
    onChange({ ...filters, categories: filters.categories.filter((c) => c !== cat) });
  }

  function removeSeverity(sev: NotificationSeverity) {
    onChange({ ...filters, severities: filters.severities.filter((s) => s !== sev) });
  }

  function clearStatus() {
    onChange({ ...filters, status: "all" });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Control row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status segment */}
        <ToggleGroup
          type="single"
          value={filters.status}
          onValueChange={(val) => {
            if (!val) return;
            onChange({ ...filters, status: val as NotificationStatusFilter });
          }}
          size="sm"
          className="gap-0 rounded-md border border-border"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              size="sm"
              className="rounded-none px-3 text-xs first:rounded-l-md last:rounded-r-md"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Categories dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Icon icon="mdi:tag-multiple" size={14} />
              Categorias
              {activeCategoryCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {activeCategoryCount}
                </span>
              )}
              <Icon icon="mdi:chevron-down" size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel className="text-xs">Categorias</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_CATEGORIES.map((cat) => {
              const count = counts?.[cat];
              return (
                <DropdownMenuCheckboxItem
                  key={cat}
                  checked={filters.categories.includes(cat)}
                  onCheckedChange={() =>
                    onChange({
                      ...filters,
                      categories: toggleInArray(filters.categories, cat),
                    })
                  }
                  className="gap-2"
                >
                  <Icon icon={CATEGORY_ICON[cat]} size={14} className="text-muted-foreground" />
                  <span className="flex-1">{CATEGORY_LABEL[cat]}</span>
                  {count !== undefined && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  )}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Severities dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Icon icon="mdi:alert-circle-outline" size={14} />
              Severidade
              {activeSeverityCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {activeSeverityCount}
                </span>
              )}
              <Icon icon="mdi:chevron-down" size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel className="text-xs">Severidade</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_SEVERITIES.map((sev) => {
              const tone = SEVERITY_TONE[sev];
              const isActive = filters.severities.includes(sev);
              return (
                <DropdownMenuCheckboxItem
                  key={sev}
                  checked={isActive}
                  onCheckedChange={() =>
                    onChange({
                      ...filters,
                      severities: toggleInArray(filters.severities, sev),
                    })
                  }
                >
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      isActive ? [tone.bg, tone.text] : "text-foreground",
                    )}
                  >
                    {SEVERITY_LABEL[sev]}
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Clear button */}
        {hasActive && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            <Icon icon="mdi:filter-off" size={14} />
            Limpar
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {hasActive && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Filtros ativos">
          {/* Status chip (only when not "all") */}
          {filters.status !== "all" && (
            <span
              role="listitem"
              className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
            >
              {STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status}
              <button
                type="button"
                aria-label={`Remover filtro de status: ${filters.status}`}
                onClick={clearStatus}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon icon="mdi:close" size={10} />
              </button>
            </span>
          )}

          {/* Category chips */}
          {filters.categories.map((cat) => (
            <span
              key={cat}
              role="listitem"
              className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
            >
              <Icon icon={CATEGORY_ICON[cat]} size={12} className="text-muted-foreground" />
              {CATEGORY_LABEL[cat]}
              <button
                type="button"
                aria-label={`Remover categoria: ${CATEGORY_LABEL[cat]}`}
                onClick={() => removeCategory(cat)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon icon="mdi:close" size={10} />
              </button>
            </span>
          ))}

          {/* Severity chips */}
          {filters.severities.map((sev) => {
            const tone = SEVERITY_TONE[sev];
            return (
              <span
                key={sev}
                role="listitem"
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  tone.bg,
                  tone.text,
                  tone.border,
                )}
              >
                {SEVERITY_LABEL[sev]}
                <button
                  type="button"
                  aria-label={`Remover severidade: ${SEVERITY_LABEL[sev]}`}
                  onClick={() => removeSeverity(sev)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon icon="mdi:close" size={10} />
                </button>
              </span>
            );
          })}

          {/* "Limpar todos" shortcut when multiple chips */}
          {(filters.categories.length + filters.severities.length > 1 ||
            (filters.status !== "all" &&
              filters.categories.length + filters.severities.length > 0)) && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full px-2.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Limpar todos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Presentational notification filter panel.
 *
 * Controlled entirely via props — no internal state, no routing hooks.
 * Wire to URL search params in the route layer (next task).
 *
 * @example
 * <NotificationFilters
 *   variant="sidebar"
 *   filters={filters}
 *   onChange={setFilters}
 *   onClear={() => setFilters(EMPTY_NOTIFICATION_FILTERS)}
 * />
 */
export function NotificationFilters(props: NotificationFiltersProps) {
  if (props.variant === "sidebar") {
    return <SidebarFilters {...props} />;
  }
  return <BarFilters {...props} />;
}

// Re-export EMPTY_NOTIFICATION_FILTERS for convenient onClear wiring.
export { EMPTY_NOTIFICATION_FILTERS };
