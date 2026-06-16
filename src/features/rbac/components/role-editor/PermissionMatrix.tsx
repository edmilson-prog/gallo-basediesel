import { useEffect, useMemo, useRef, useState } from "react";
import type { IPermission, IRbacResource, IRole } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ACTIONS } from "../../permissions/actions";
import { ACTION_LABELS, ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";
import { ResourceAreaGroup } from "./ResourceAreaGroup";

export interface IPermissionMatrixProps {
  role: IRole;
  resources: IRbacResource[];
}

interface IArea {
  area: string;
  resources: IRbacResource[];
}

function groupByArea(resources: IRbacResource[]): IArea[] {
  // Resources already arrive ordered by group then sortOrder from the provider;
  // preserve that order while collecting them into contiguous areas.
  const order: string[] = [];
  const buckets = new Map<string, IRbacResource[]>();
  for (const resource of resources) {
    if (!buckets.has(resource.group)) {
      buckets.set(resource.group, []);
      order.push(resource.group);
    }
    buckets.get(resource.group)!.push(resource);
  }
  return order.map((area) => ({ area, resources: buckets.get(area)! }));
}

/**
 * Read-only permission matrix for a single role (PRD-211 Task 9 — scaffold).
 *
 * Collapsible areas derived from `listResources()` grouped by `group`; a sticky
 * column header carries the 5 action labels; a resource search box (focus with
 * "/") filters the rows. Editing lands in the editable task.
 */
export function PermissionMatrix({ role, resources }: IPermissionMatrixProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Global "/" shortcut focuses the resource search, mirroring the list-screen
  // UX (do not steal typing from inputs / textareas / contentEditable).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const permissionByResource = useMemo(() => {
    const map = new Map<string, IPermission>();
    role.permissions.forEach((p) => map.set(p.resource, p));
    return map;
  }, [role.permissions]);

  const filteredAreas = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const matching = normalized
      ? resources.filter(
          (r) =>
            r.label.toLocaleLowerCase("pt-BR").includes(normalized) ||
            r.group.toLocaleLowerCase("pt-BR").includes(normalized),
        )
      : resources;
    return groupByArea(matching);
  }, [resources, query]);

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
      {/* Role identity + search */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">{role.name}</h2>
            {role.isSystem && (
              <Badge variant="outline" className="gap-1 px-1.5 py-0.5 text-[10px]">
                <Icon icon="mdi:lock" size={11} />
                {ROLE_EDITOR_LABELS.systemRoleBadge}
              </Badge>
            )}
            <Badge variant="secondary" className="gap-1 px-1.5 py-0.5 text-[10px]">
              <Icon icon="mdi:lock-outline" size={11} />
              {ROLE_EDITOR_LABELS.readOnlyBadge}
            </Badge>
          </div>
          {role.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{role.description}</p>
          )}
        </div>

        <div className="relative w-full max-w-xs shrink-0">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder={ROLE_EDITOR_LABELS.searchPlaceholder}
            aria-label={ROLE_EDITOR_LABELS.searchPlaceholder}
            className="pl-8 pr-9"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
            /
          </kbd>
        </div>
      </div>

      {/* Sticky action header */}
      <div className="sticky top-0 z-10 grid grid-cols-[minmax(8rem,1fr)_repeat(5,3rem)_6rem] items-center gap-1 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ROLE_EDITOR_LABELS.resourceColumn}
        </span>
        {ACTIONS.map((action) => (
          <span
            key={action}
            className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {ACTION_LABELS[action]}
          </span>
        ))}
        <span className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ROLE_EDITOR_LABELS.scopeColumn}
        </span>
      </div>

      {/* Areas */}
      {filteredAreas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {ROLE_EDITOR_LABELS.noResults}
        </p>
      ) : (
        <div>
          {filteredAreas.map((group) => (
            <ResourceAreaGroup
              key={group.area}
              area={group.area}
              resources={group.resources}
              permissionByResource={permissionByResource}
            />
          ))}
        </div>
      )}
    </div>
  );
}
