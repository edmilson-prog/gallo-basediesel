import type { ID, ILeadFunnel } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAccentClasses } from "../../engine/accentClasses";
import { COPY } from "../../i18n/pt-BR";

export interface IFunnelAdminRailProps {
  funnels: ILeadFunnel[];
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  canCreate: boolean;
  onCreate: () => void;
  /** Active leads sitting in archived funnels — the warning at the foot. */
  archivedLeadCount: number;
}

/**
 * The 260px rail, or a Select below 1024px.
 *
 * Archived funnels are listed, dimmed, under their own heading: un-archiving is
 * only reachable from here, so hiding them would strand them.
 */
export function FunnelAdminRail({
  funnels,
  selectedId,
  onSelect,
  canCreate,
  onCreate,
  archivedLeadCount,
}: IFunnelAdminRailProps) {
  const isMobile = useIsMobile();
  const active = funnels.filter((f) => !f.archivedAt);
  const archived = funnels.filter((f) => f.archivedAt);

  if (isMobile) {
    return (
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Select value={selectedId ?? undefined} onValueChange={onSelect}>
          <SelectTrigger className="flex-1" aria-label={COPY.admin.railMobileLabel}>
            <SelectValue placeholder={COPY.admin.railMobileLabel} />
          </SelectTrigger>
          <SelectContent>
            {funnels.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
                {f.archivedAt ? ` (${COPY.admin.archivedSection.toLowerCase()})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  return (
    <nav
      aria-label={COPY.admin.railLabel}
      className="flex w-[260px] shrink-0 flex-col border-r border-border"
    >
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {active.map((f) => (
            <RailItem
              key={f.id}
              funnel={f}
              selected={f.id === selectedId}
              onSelect={() => onSelect(f.id)}
            />
          ))}
        </ul>

        {archived.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {COPY.admin.archivedSection}
            </p>
            <ul className="space-y-0.5">
              {archived.map((f) => (
                <RailItem
                  key={f.id}
                  funnel={f}
                  selected={f.id === selectedId}
                  onSelect={() => onSelect(f.id)}
                />
              ))}
            </ul>
            {archivedLeadCount > 0 && (
              <p className="mt-2 rounded-md border border-severity-warning/40 bg-severity-warning/10 px-2 py-1.5 text-[11px] text-foreground">
                {COPY.admin.archivedWarning(archived.length, archivedLeadCount)}
              </p>
            )}
          </>
        )}
      </div>

      {canCreate && (
        <div className="border-t border-border p-2">
          <Button variant="outline" size="sm" className="w-full" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} aria-hidden />
            {COPY.newFunnel.trigger}
          </Button>
        </div>
      )}
    </nav>
  );
}

function RailItem({
  funnel,
  selected,
  onSelect,
}: {
  funnel: ILeadFunnel;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
          funnel.archivedAt && "opacity-60",
        )}
      >
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(funnel.accent).dot)}
        />
        <Icon icon={funnel.icon} size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{funnel.name}</span>
        {funnel.isDefault && (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
            {COPY.admin.defaultBadge}
          </span>
        )}
      </button>
    </li>
  );
}
