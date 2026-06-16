import { useMemo, useState } from "react";
import type { IPermission, IRbacResource, PermissionScope } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ACTIONS } from "../../permissions/actions";
import { ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";
import { PermissionCell } from "./PermissionCell";
import { ScopeSelect } from "./ScopeSelect";

export interface IResourceAreaGroupProps {
  /** Area name (e.g. "Comercial") shown in the header. */
  area: string;
  /** Resources belonging to this area, already ordered. */
  resources: IRbacResource[];
  /** Permission lookup for the selected role, keyed by resource key. */
  permissionByResource: Map<string, IPermission>;
}

const DEFAULT_SCOPE: PermissionScope = "own";

/**
 * One collapsible area of the permission matrix (PRD-211 Task 9 — scaffold).
 *
 * Header shows an aggregated summary (how many resources grant edit) and each
 * row renders a `PermissionCell` per action plus a `ScopeSelect`. Everything is
 * read-only here; the tri-state bulk column checkbox and mutations land in the
 * editable task.
 */
export function ResourceAreaGroup({
  area,
  resources,
  permissionByResource,
}: IResourceAreaGroupProps) {
  const [open, setOpen] = useState(true);

  const withEditCount = useMemo(
    () =>
      resources.reduce((count, resource) => {
        const perm = permissionByResource.get(resource.key);
        return perm?.actions.includes("edit") ? count + 1 : count;
      }, 0),
    [resources, permissionByResource],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
        <Icon
          icon={open ? "mdi:chevron-down" : "mdi:chevron-right"}
          size={18}
          className="shrink-0 text-muted-foreground"
        />
        <span className="flex-1 text-sm font-semibold text-foreground">{area}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {ROLE_EDITOR_LABELS.areaSummary(withEditCount, resources.length)}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="divide-y divide-border/60">
          {resources.map((resource) => {
            const perm = permissionByResource.get(resource.key);
            const hasAny = (perm?.actions.length ?? 0) > 0;
            const scope = perm?.scope ?? DEFAULT_SCOPE;
            return (
              <div
                key={resource.key}
                className="grid grid-cols-[minmax(8rem,1fr)_repeat(5,3rem)_6rem] items-center gap-1 px-4 py-1.5 hover:bg-muted/30"
              >
                <span className="truncate pr-2 text-sm text-foreground" title={resource.label}>
                  {resource.label}
                </span>
                {ACTIONS.map((action) => (
                  <div key={action} className="flex justify-center">
                    <PermissionCell
                      resourceLabel={resource.label}
                      action={action}
                      allowed={perm?.actions.includes(action) ?? false}
                      scope={scope}
                    />
                  </div>
                ))}
                <div className="flex justify-center">
                  <ScopeSelect scope={scope} disabled={!hasAny} />
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
