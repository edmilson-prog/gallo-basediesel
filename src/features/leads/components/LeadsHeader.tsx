import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { cn } from "@/lib/utils";
import type { ILead } from "@/shared/types";
import { LeadsMetricsPopover } from "./LeadsMetricsPopover";
import { LEADS_STRINGS } from "../i18n/pt-BR";
import type { LeadsView } from "../hooks/useLeadsUrlState";

const COPY = LEADS_STRINGS.page;

/** Matches the debounce used by the reference search (CatalogHeader). */
const SEARCH_DEBOUNCE_MS = 300;

export interface ILeadsHeaderProps {
  activeCount: number;
  searchValue: string;
  view: LeadsView;
  canCreate: boolean;
  onSearchChange: (q: string) => void;
  onViewChange: (view: LeadsView) => void;
  onCreate: () => void;
  /**
   * The page's scroll container, for the progress line on the fixed/scrollable
   * seam. `null` until the child mounts and reports its element.
   */
  scrollEl?: HTMLElement | null;
  /** Unfiltered set for the metrics popover — see ILeadsMetricsPopoverProps. */
  metricsLeads: ILead[];
  /**
   * The funnel switcher, when the resolved layout is "header". It carries the
   * page's <h1> (spec 6.7), so "Leads" demotes to a muted prefix rather than
   * competing for the same role.
   */
  funnelSlot?: React.ReactNode;
  /**
   * True in the consolidated view: funnels have no common stage axis, so a
   * unified kanban is impossible and the toggle is locked to the list with an
   * explanation rather than silently ignoring the click.
   */
  viewLocked?: boolean;
  viewLockedReason?: string;
}

export function LeadsHeader({
  activeCount,
  searchValue,
  view,
  canCreate,
  onSearchChange,
  onViewChange,
  onCreate,
  scrollEl = null,
  metricsLeads,
  funnelSlot,
  viewLocked = false,
  viewLockedReason,
}: ILeadsHeaderProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [draft, setDraft] = useState(searchValue);

  // Keep the local draft in sync when the URL changes from outside (e.g. "clear all").
  useEffect(() => {
    setDraft(searchValue);
  }, [searchValue]);

  // Debounce the upward write: the search filters the whole fetched set.
  useEffect(() => {
    if (draft === searchValue) return;
    const t = setTimeout(() => onSearchChange(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, searchValue, onSearchChange]);

  // Global "/" focuses the field, unless the user is already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const viewToggle = (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={(val) => {
        if (val === "kanban" || val === "list") onViewChange(val);
      }}
      variant="outline"
      size="sm"
      disabled={viewLocked}
      className="shrink-0"
      aria-label="Modo de visualização"
    >
      <ToggleGroupItem value="kanban" aria-label={LEADS_STRINGS.views.kanban}>
        <Icon icon="mdi:view-column-outline" size={16} />
        <span className="ml-1 hidden sm:inline">{LEADS_STRINGS.views.kanban}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label={LEADS_STRINGS.views.list}>
        <Icon icon="mdi:format-list-bulleted" size={16} />
        <span className="ml-1 hidden sm:inline">{LEADS_STRINGS.views.list}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <div className="relative flex flex-wrap items-center gap-3 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {funnelSlot ? (
          <>
            <span className="text-sm font-medium text-muted-foreground">{COPY.title}</span>
            <span aria-hidden className="text-sm text-muted-foreground">
              /
            </span>
            {funnelSlot}
          </>
        ) : (
          <h1 className="text-base font-semibold text-foreground">{COPY.title}</h1>
        )}
        <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
          {COPY.activeCount(activeCount)}
        </Badge>
      </div>

      <div className="ml-auto flex flex-1 flex-wrap items-center justify-end gap-2">
        <div
          className="relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none"
          style={{ maxWidth: searchFocused ? "42rem" : "24rem" }}
        >
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") searchRef.current?.blur();
            }}
            placeholder={COPY.searchPlaceholder}
            className="h-9 pl-8 pr-9 text-sm"
          />
          <kbd
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-opacity sm:flex",
              searchFocused && "opacity-0",
            )}
          >
            /
          </kbd>
        </div>

        <LeadsMetricsPopover leads={metricsLeads} />

        {viewLocked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0" tabIndex={0}>
                {viewToggle}
              </span>
            </TooltipTrigger>
            <TooltipContent>{viewLockedReason}</TooltipContent>
          </Tooltip>
        ) : (
          viewToggle
        )}

        {canCreate && (
          <Button size="sm" className="shrink-0 gap-1.5" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {COPY.addLead}
          </Button>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <ScrollProgressBar container={scrollEl} />
      </div>
    </div>
  );
}
