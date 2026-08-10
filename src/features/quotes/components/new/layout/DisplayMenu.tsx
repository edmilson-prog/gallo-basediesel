// src/features/quotes/components/new/layout/DisplayMenu.tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  QUOTE_DENSITY_OPTIONS,
  QUOTE_LAYOUT_OPTIONS,
  type QuoteDensity,
  type QuoteLayout,
} from "../../../types/editor";

export interface IDisplayMenuProps {
  layout: QuoteLayout;
  onLayoutChange: (v: QuoteLayout) => void;
  density: QuoteDensity;
  onDensityChange: (v: QuoteDensity) => void;
}

/**
 * "Exibição" menu — the editor's real preferences (page layout + table density),
 * labelled instead of the four unlabelled icons the header used to carry.
 */
export function DisplayMenu({
  layout,
  onLayoutChange,
  density,
  onDensityChange,
}: IDisplayMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5">
          <Icon icon="mdi:view-dashboard-outline" size={16} />
          Exibição
          <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Layout
        </DropdownMenuLabel>
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          {QUOTE_LAYOUT_OPTIONS.map((opt) => {
            const active = opt.value === layout;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onLayoutChange(opt.value)}
                aria-pressed={active}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors motion-reduce:transition-none ${
                  active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
              >
                <Icon icon={opt.icon} size={16} className={active ? "" : "text-muted-foreground"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{opt.label}</span>
                  <span
                    className={`block truncate text-[10px] ${
                      active ? "opacity-80" : "text-muted-foreground"
                    }`}
                  >
                    {opt.hint}
                  </span>
                </span>
                {active && <Icon icon="mdi:check" size={14} />}
              </button>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Densidade da tabela
        </DropdownMenuLabel>
        <div className="px-2 pb-2">
          <ToggleGroup
            type="single"
            size="sm"
            value={density}
            onValueChange={(v) => v && onDensityChange(v as QuoteDensity)}
            aria-label="Densidade da tabela"
          >
            {QUOTE_DENSITY_OPTIONS.map((opt) => (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                aria-label={opt.label}
                className="gap-1 text-xs"
              >
                <Icon icon={opt.icon} size={14} />
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
