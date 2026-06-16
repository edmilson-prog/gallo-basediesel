import { useEffect, useMemo, useRef, useState } from "react";
import type { IRbacResource, IRole, PermissionAction, PermissionScope } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ACTIONS } from "../../permissions/actions";
import { ACTION_LABELS, ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";
import { ResourceAreaGroup } from "./ResourceAreaGroup";
import { MATRIX_GRID_COLS } from "./matrixGrid";
import type { DraftMatrix } from "./usePermissionDraft";

export interface IPermissionMatrixProps {
  role: IRole;
  resources: IRbacResource[];
  /** Editable draft matrix keyed by resource (from `usePermissionDraft`). */
  draft: DraftMatrix;
  /** Resource keys whose entry changed vs. the baseline (highlighted rows). */
  changedResources: Set<string>;
  /**
   * When false, the whole matrix is read-only: Owner immutable, or the user
   * lacks `role:edit`. Cells become non-interactive but stay focusable.
   */
  editable: boolean;
  /** Toggles one action on a resource. */
  onToggle: (resource: string, action: PermissionAction) => void;
  /** Changes a resource's scope. */
  onScopeChange: (resource: string, scope: PermissionScope) => void;
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
 * Editable permission matrix for a single role (PRD-211 Task 10).
 *
 * Collapsible areas derived from `listResources()` grouped by `group`; a sticky
 * column header carries the 5 action labels (aligned to the rows via the shared
 * `MATRIX_GRID_COLS`); a resource search box (focus with "/") filters the rows.
 * The Owner role renders disabled with an info banner; system roles surface a
 * warning banner while there are unsaved edits.
 */
export function PermissionMatrix({
  role,
  resources,
  draft,
  changedResources,
  editable,
  onToggle,
  onScopeChange,
}: IPermissionMatrixProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const readOnly = !editable;

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

  const showSystemBanner = role.isSystem && !role.isOwnerImmutable && changedResources.size > 0;

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
            {readOnly && !role.isOwnerImmutable && (
              <Badge variant="secondary" className="gap-1 px-1.5 py-0.5 text-[10px]">
                <Icon icon="mdi:lock-outline" size={11} />
                {ROLE_EDITOR_LABELS.readOnlyBadge}
              </Badge>
            )}
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

      {/* Owner immutable banner (matrix stays visible but disabled). */}
      {role.isOwnerImmutable && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-border bg-severity-info/10 px-4 py-2.5 text-sm text-severity-info"
        >
          <Icon icon="mdi:crown" size={16} className="shrink-0" />
          <span>{ROLE_EDITOR_LABELS.ownerImmutableBanner}</span>
        </div>
      )}

      {/* System-role editing banner — shown while there are unsaved edits. */}
      {showSystemBanner && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-border bg-severity-warning/10 px-4 py-2.5 text-sm text-severity-warning"
        >
          <Icon icon="mdi:alert" size={16} className="shrink-0" />
          <span>{ROLE_EDITOR_LABELS.systemEditingBanner}</span>
        </div>
      )}

      {/* Sticky action header */}
      <div
        className={`sticky top-0 z-10 grid ${MATRIX_GRID_COLS} items-center gap-1 border-b border-border bg-background/95 px-4 py-2 backdrop-blur`}
      >
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
              draft={draft}
              changedResources={changedResources}
              readOnly={readOnly}
              onToggle={onToggle}
              onScopeChange={onScopeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
