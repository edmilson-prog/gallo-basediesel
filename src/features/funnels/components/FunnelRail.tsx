import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import { ALL_FUNNELS } from "../engine/resolveInitialFunnel";
import { COPY } from "../i18n/pt-BR";
import { LayoutPreferenceMenu } from "./LayoutPreferenceMenu";
import type { IFunnelViewProps } from "./types";

/** Spec 6.6 fixes both widths; do not invent others. */
const EXPANDED_PX = 208;
const COLLAPSED_PX = 56;

/**
 * Vertical rail. The only pattern where the funnels are permanent drop
 * targets, which is why the mockups recommend it for the N:N model — but it
 * costs horizontal room, so it collapses below 1280px and disappears below
 * 1024px (see resolveLayout).
 */
export function FunnelRail({
  funnels,
  countsByFunnel,
  activeFunnelId,
  onSelect,
  collapsed,
  staticLabel,
  canManage,
  onCreate,
  preferredLayout,
  onPreferredLayoutChange,
}: IFunnelViewProps) {
  return (
    <nav
      aria-label={COPY.sectionLabel}
      style={{ width: collapsed ? COLLAPSED_PX : EXPANDED_PX }}
      className="flex shrink-0 flex-col gap-0.5 border-r border-border p-2"
    >
      {!collapsed && (
        <p className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {COPY.sectionLabel}
        </p>
      )}

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {funnels.map((f) => {
          const isActive = f.id === activeFunnelId;
          const count = countsByFunnel[f.id] ?? 0;
          const item = (
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              // Collapsed, the label is the ONLY name a screen reader gets —
              // a tooltip is not an accessible name.
              aria-label={collapsed ? `${f.name} — ${COPY.count(count)}` : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted",
                isActive && "bg-muted text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {/* Dedicated strip: the accent classes are backgrounds, so
                  applying one to the button would replace bg-muted rather
                  than mark the active item. */}
              {isActive && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1 left-0 w-0.5 rounded-r",
                    getAccentClasses(f.accent).bar,
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(f.accent).dot)}
              />
              {!collapsed && (
                <>
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </>
              )}
            </button>
          );

          return (
            <li key={f.id}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{item}</TooltipTrigger>
                  <TooltipContent side="right">
                    {f.name} · {COPY.count(count)}
                  </TooltipContent>
                </Tooltip>
              ) : (
                item
              )}
            </li>
          );
        })}

        <li>
          <button
            type="button"
            onClick={() => onSelect(ALL_FUNNELS)}
            aria-label={collapsed ? COPY.allFunnels : undefined}
            aria-current={activeFunnelId === ALL_FUNNELS ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted",
              activeFunnelId === ALL_FUNNELS && "bg-muted text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon icon="mdi:view-list-outline" size={14} aria-hidden />
            {!collapsed && <span className="truncate">{COPY.allFunnels}</span>}
          </button>
        </li>
      </ul>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-1">
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreate}
            aria-label={collapsed ? COPY.newFunnel.trigger : undefined}
            className={cn("h-8 gap-2 text-xs", collapsed ? "w-full justify-center px-0" : "justify-start px-2")}
          >
            <Icon icon="mdi:plus" size={14} />
            {!collapsed && COPY.newFunnel.trigger}
          </Button>
        )}
        <LayoutPreferenceMenu
          value={preferredLayout}
          onChange={onPreferredLayoutChange}
          compact={collapsed}
        />
      </div>

      {staticLabel && !collapsed && (
        <p className="px-2 pt-1 text-[10px] leading-snug text-muted-foreground">
          {COPY.defaultFunnelHint}
        </p>
      )}
    </nav>
  );
}
