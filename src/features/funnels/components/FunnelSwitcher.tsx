import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import { ALL_FUNNELS } from "../engine/resolveInitialFunnel";
import { COPY } from "../i18n/pt-BR";
import { LayoutPreferenceMenu } from "./LayoutPreferenceMenu";
import type { IFunnelViewProps } from "./types";

/**
 * Default pattern, and the only one that works at every width and every funnel
 * count. The other two views are this same logic in another shape.
 */
export function FunnelSwitcher({
  funnels,
  countsByFunnel,
  activeFunnelId,
  onSelect,
  staticLabel,
  canManage,
  onCreate,
  preferredLayout,
  onPreferredLayoutChange,
}: IFunnelViewProps) {
  const [open, setOpen] = useState(false);
  const active = funnels.find((f) => f.id === activeFunnelId);
  const label = activeFunnelId === ALL_FUNNELS ? COPY.allFunnels : (active?.name ?? "—");

  // One funnel and no power to add another: a chooser with a single option is
  // pure noise. Staff keep the affordance because they can create one.
  if (staticLabel && !canManage) {
    return <h1 className="text-base font-semibold text-foreground">{label}</h1>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 shrink-0 gap-2 px-2"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={COPY.switcherTrigger(label)}
        >
          {active ? (
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(active.accent).dot)}
            />
          ) : null}
          <h1 className="truncate text-base font-semibold text-foreground">{label}</h1>
          <Icon icon="mdi:chevron-down" size={16} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={COPY.searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{COPY.searchEmpty}</CommandEmpty>

            <CommandGroup>
              {funnels.map((f) => (
                <CommandItem
                  key={f.id}
                  value={f.name}
                  aria-selected={f.id === activeFunnelId}
                  onSelect={() => {
                    onSelect(f.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(f.accent).dot)}
                  />
                  <Icon icon={f.icon} size={14} className="text-muted-foreground" aria-hidden />
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {/* No noUncheckedIndexedAccess here and the map comes from
                        the server — the fallback is the 2026-07-18 incident. */}
                    {countsByFunnel[f.id] ?? 0}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value={COPY.allFunnels}
                aria-selected={activeFunnelId === ALL_FUNNELS}
                onSelect={() => {
                  onSelect(ALL_FUNNELS);
                  setOpen(false);
                }}
                className="gap-2"
              >
                <Icon icon="mdi:view-list-outline" size={14} aria-hidden />
                {COPY.allFunnels}
              </CommandItem>
            </CommandGroup>

            {canManage && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={COPY.newFunnel.trigger}
                    onSelect={() => {
                      onCreate();
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Icon icon="mdi:plus" size={14} aria-hidden />
                    {COPY.newFunnel.trigger}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>

        <div className="border-t border-border p-1">
          <LayoutPreferenceMenu value={preferredLayout} onChange={onPreferredLayoutChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
