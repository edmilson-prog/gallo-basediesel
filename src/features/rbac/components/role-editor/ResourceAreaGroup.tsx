import { useCallback, useMemo, useRef, useState } from "react";
import type { IRbacResource, PermissionAction, PermissionScope } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ACTIONS } from "../../permissions/actions";
import { ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";
import { PermissionCell } from "./PermissionCell";
import { ScopeSelect } from "./ScopeSelect";
import { MATRIX_GRID_COLS } from "./matrixGrid";
import type { DraftMatrix } from "./usePermissionDraft";

const DEFAULT_SCOPE: PermissionScope = "own";

export interface IResourceAreaGroupProps {
  /** Area name (e.g. "Comercial") shown in the header. */
  area: string;
  /** Resources belonging to this area, already ordered. */
  resources: IRbacResource[];
  /** Draft permission lookup for the selected role, keyed by resource key. */
  draft: DraftMatrix;
  /** Resource keys whose entry changed vs. the baseline (highlighted rows). */
  changedResources: Set<string>;
  /** Read-only mode (Owner immutable, or the user lacks edit permission). */
  readOnly: boolean;
  /** Toggles one action on a resource. */
  onToggle: (resource: string, action: PermissionAction) => void;
  /** Changes a resource's scope. */
  onScopeChange: (resource: string, scope: PermissionScope) => void;
}

/**
 * One collapsible area of the permission matrix (PRD-211 Task 10 — editable).
 *
 * Header shows an aggregated summary; each row renders an editable
 * `PermissionCell` per action plus an editable `ScopeSelect`. The action cells
 * form a 2-D grid with roving tabindex + arrow-key navigation (Space toggles).
 * An `aria-live` region announces the per-area "N de M" summary on change.
 */
export function ResourceAreaGroup({
  area,
  resources,
  draft,
  changedResources,
  readOnly,
  onToggle,
  onScopeChange,
}: IResourceAreaGroupProps) {
  const [open, setOpen] = useState(true);
  // Roving tabindex: which [row, col] action cell is the current tab stop.
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  const withAccessCount = useMemo(
    () =>
      resources.reduce((count, resource) => {
        const entry = draft.get(resource.key);
        return (entry?.actions.size ?? 0) > 0 ? count + 1 : count;
      }, 0),
    [resources, draft],
  );

  const focusCell = useCallback((row: number, col: number) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-cell-row="${row}"][data-cell-col="${col}"]`,
    );
    el?.focus();
  }, []);

  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, row: number, col: number, resourceKey: string) => {
      const lastRow = resources.length - 1;
      const lastCol = ACTIONS.length - 1;
      let nextRow = row;
      let nextCol = col;
      switch (e.key) {
        case "ArrowRight":
          nextCol = Math.min(lastCol, col + 1);
          break;
        case "ArrowLeft":
          nextCol = Math.max(0, col - 1);
          break;
        case "ArrowDown":
          nextRow = Math.min(lastRow, row + 1);
          break;
        case "ArrowUp":
          nextRow = Math.max(0, row - 1);
          break;
        case " ":
        case "Enter": {
          const action = ACTIONS[col];
          if (!readOnly && action) {
            e.preventDefault();
            onToggle(resourceKey, action);
          }
          return;
        }
        default:
          return;
      }
      e.preventDefault();
      if (nextRow !== row || nextCol !== col) {
        setActive({ row: nextRow, col: nextCol });
        focusCell(nextRow, nextCol);
      }
    },
    [resources.length, readOnly, onToggle, focusCell],
  );

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-border last:border-b-0"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
        <Icon
          icon={open ? "mdi:chevron-down" : "mdi:chevron-right"}
          size={18}
          className="shrink-0 text-muted-foreground"
        />
        <span className="flex-1 text-sm font-semibold text-foreground">{area}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {ROLE_EDITOR_LABELS.areaSummary(withAccessCount, resources.length)}
        </span>
      </CollapsibleTrigger>

      {/* aria-live announces the per-area summary changes to screen readers. */}
      <span className="sr-only" aria-live="polite">
        {ROLE_EDITOR_LABELS.areaLiveSummary(area, withAccessCount, resources.length)}
      </span>

      <CollapsibleContent>
        <div ref={gridRef} role="grid" className="divide-y divide-border/60">
          {resources.map((resource, rowIndex) => {
            const entry = draft.get(resource.key);
            const hasAny = (entry?.actions.size ?? 0) > 0;
            const scope = entry?.scope ?? DEFAULT_SCOPE;
            const changed = changedResources.has(resource.key);
            return (
              <div
                key={resource.key}
                role="row"
                className={cn(
                  "grid items-center gap-1 px-4 py-1.5",
                  MATRIX_GRID_COLS,
                  changed
                    ? "bg-severity-info/15 motion-safe:transition-colors"
                    : "hover:bg-muted/30",
                )}
              >
                <span className="truncate pr-2 text-sm text-foreground" title={resource.label}>
                  {resource.label}
                </span>
                {ACTIONS.map((action, colIndex) => (
                  <div key={action} role="gridcell" className="flex justify-center">
                    <PermissionCell
                      resourceLabel={resource.label}
                      action={action}
                      allowed={entry?.actions.has(action) ?? false}
                      scope={scope}
                      readOnly={readOnly}
                      onToggle={() => onToggle(resource.key, action)}
                      tabIndex={active.row === rowIndex && active.col === colIndex ? 0 : -1}
                      dataRow={rowIndex}
                      dataCol={colIndex}
                      onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex, resource.key)}
                    />
                  </div>
                ))}
                <div className="flex justify-center px-1" role="gridcell">
                  <ScopeSelect
                    scope={scope}
                    disabled={!hasAny}
                    readOnly={readOnly}
                    onChange={(next) => onScopeChange(resource.key, next)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
