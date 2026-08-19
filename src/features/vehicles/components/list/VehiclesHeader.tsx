import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.list;

export interface IVehiclesHeaderProps {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  canCreate: boolean;
  onCreate: () => void;
  /** Enrichment-queue chips — rendered right after the title, ahead of the filters. */
  queueSlot?: ReactNode;
  /** Filter controls rendered inline, between the queue chips and the search field. */
  filtersSlot?: ReactNode;
}

export function VehiclesHeader({
  total,
  searchValue,
  onSearchChange,
  canCreate,
  onCreate,
  queueSlot,
  filtersSlot,
}: IVehiclesHeaderProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Press "/" anywhere (outside inputs) to focus the search field.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-background/85 px-4 py-2 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
      <div className="flex min-w-0 shrink-0 items-baseline gap-2">
        <h1 className="text-base font-semibold text-foreground">{COPY.title}</h1>
        <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
          {COPY.subtitle(total)}
        </Badge>
      </div>

      {queueSlot}

      {filtersSlot}

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <div
          className={cn(
            "relative flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
            focused ? "max-w-2xl" : "max-w-sm",
          )}
        >
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            placeholder={COPY.searchPlaceholder}
            className="h-9 w-full bg-muted/40 pl-8 pr-9 text-sm transition-colors focus-visible:bg-background"
          />
          <kbd
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-2 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground transition-opacity duration-200 sm:flex",
              focused ? "opacity-0" : "opacity-100",
            )}
          >
            /
          </kbd>
        </div>

        {canCreate && (
          <Button size="sm" className="shrink-0 gap-1.5" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {COPY.addButton}
          </Button>
        )}
      </div>
    </div>
  );
}
