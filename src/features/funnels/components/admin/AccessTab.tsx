import type { ID, ILeadFunnel, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { resolveAccessPreview } from "../../engine/accessPreview";
import { COPY } from "../../i18n/pt-BR";

export interface IAccessTabProps {
  funnel: ILeadFunnel;
  sellers: ISeller[];
  staffIds: ID[];
  grantedIds: ID[];
  openToStore: boolean;
  onGrantedChange: (next: ID[]) => void;
  onOpenToStoreChange: (next: boolean) => void;
}

export function AccessTab({
  funnel,
  sellers,
  staffIds,
  grantedIds,
  openToStore,
  onGrantedChange,
  onOpenToStoreChange,
}: IAccessTabProps) {
  // The default funnel has no access tab. It receives every new lead, it is
  // where `removeEntry` sends a lead that leaves its last funnel, and it is
  // where triage happens — restricting it would lock the whole operation.
  if (funnel.isDefault) {
    return (
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {COPY.admin.access.defaultNote}
      </p>
    );
  }

  const preview = resolveAccessPreview({ sellers, grantedIds, openToStore, staffIds });
  const staff = new Set(staffIds);
  const selectable = sellers.filter((s) => !staff.has(s.id));

  const toggle = (id: ID) =>
    onGrantedChange(
      grantedIds.includes(id) ? grantedIds.filter((x) => x !== id) : [...grantedIds, id],
    );

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border p-2.5 text-xs",
          preview.isEmpty
            ? "border-severity-warning/40 bg-severity-warning/10 text-foreground"
            : "border-border bg-muted/40 text-foreground",
        )}
      >
        <Icon
          icon={preview.isEmpty ? "mdi:account-off-outline" : "mdi:account-group-outline"}
          size={16}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-medium">
            {preview.isEmpty ? COPY.admin.access.empty : COPY.admin.access.reach(preview.reachCount)}
          </p>
          {preview.isEmpty && (
            <p className="text-[11px] text-muted-foreground">{COPY.admin.access.emptyHint}</p>
          )}
        </div>
      </div>

      {/* Owner and manager as a fixed informative line, not a locked checkbox:
          the access comes from the role, and a ticked box nobody can untick
          invites people to try. */}
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon icon="mdi:shield-account-outline" size={12} aria-hidden />
        {COPY.admin.access.staffNote}
      </p>

      <label className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-foreground">
            {COPY.admin.access.openToStore}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {COPY.admin.access.openToStoreHint}
          </span>
        </span>
        <Switch checked={openToStore} onCheckedChange={onOpenToStoreChange} />
      </label>

      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {selectable.map((s) => (
          <li key={s.id}>
            <label
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition hover:bg-muted",
                // Opened to the whole store, the individual ticks stop deciding
                // anything — shown dimmed rather than hidden, so turning the
                // switch back off does not look like the grants were lost.
                openToStore && "opacity-50",
              )}
            >
              <Checkbox
                checked={grantedIds.includes(s.id)}
                onCheckedChange={() => toggle(s.id)}
                aria-label={s.fullName}
              />
              <span className="truncate">{s.fullName}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
