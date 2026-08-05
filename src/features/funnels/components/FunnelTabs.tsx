import { useRef } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import { ALL_FUNNELS } from "../engine/resolveInitialFunnel";
import { COPY } from "../i18n/pt-BR";
import { LayoutPreferenceMenu } from "./LayoutPreferenceMenu";
import type { IFunnelViewProps } from "./types";

/**
 * Horizontal strip. Same state as the switcher, laid along the axis the board
 * already scrolls — which is why this is the one pattern that degrades on
 * funnel count (see resolveLayout).
 */
export function FunnelTabs({
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
  const listRef = useRef<HTMLDivElement>(null);

  if (staticLabel && !canManage) {
    const only = funnels[0];
    return (
      <div className="border-b border-border px-4 py-2">
        <h1 className="text-sm font-semibold text-foreground">{only?.name ?? "—"}</h1>
      </div>
    );
  }

  // Arrow keys move between tabs, as the tablist role promises.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = funnels.findIndex((f) => f.id === activeFunnelId);
    if (i < 0) return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = funnels[(i + delta + funnels.length) % funnels.length];
    if (next) onSelect(next.id);
  };

  return (
    <div className="flex items-stretch gap-1 border-b border-border px-4">
      <div
        ref={listRef}
        role="tablist"
        aria-label={COPY.sectionLabel}
        onKeyDown={onKeyDown}
        className="flex flex-1 items-stretch gap-1 overflow-x-auto"
      >
        {funnels.map((f) => {
          const isActive = f.id === activeFunnelId;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(f.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground transition-colors",
                isActive && "text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 shrink-0 rounded-sm", getAccentClasses(f.accent).dot)}
              />
              <Icon icon={f.icon} size={13} aria-hidden />
              {f.name}
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {countsByFunnel[f.id] ?? 0}
              </span>
              {/* Dedicated strip, not a border on this element: the accent
                  classes are backgrounds (bg-funnel-N), so stacking one on the
                  button would paint the whole tab instead of its underline. */}
              {isActive && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-0.5",
                    getAccentClasses(f.accent).bar,
                  )}
                />
              )}
            </button>
          );
        })}

        <button
          type="button"
          role="tab"
          aria-selected={activeFunnelId === ALL_FUNNELS}
          tabIndex={activeFunnelId === ALL_FUNNELS ? 0 : -1}
          onClick={() => onSelect(ALL_FUNNELS)}
          className={cn(
            "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors",
            activeFunnelId === ALL_FUNNELS && "border-b-primary text-foreground",
          )}
        >
          <Icon icon="mdi:view-list-outline" size={13} aria-hidden />
          {COPY.allFunnels}
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canManage && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onCreate}>
            <Icon icon="mdi:plus" size={14} />
            <span className="hidden sm:inline">{COPY.newFunnel.trigger}</span>
          </Button>
        )}
        <LayoutPreferenceMenu
          value={preferredLayout}
          onChange={onPreferredLayoutChange}
          compact
        />
      </div>
    </div>
  );
}
