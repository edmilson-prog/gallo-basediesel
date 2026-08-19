import { useState } from "react";
import type { IPendingSupplier } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.pendingQueue;

/** Rows shown before the "Ver todos" control — a sample, not a cap: the
 *  screen's thesis is the SIZE of this queue, so it must never hide behind
 *  a permanently cramped scrollbox. See `expanded` below. */
const PREVIEW_COUNT = 8;

interface ISuppliersPendingQueueProps {
  /**
   * `null` while the fetch is still in flight. A failure is signaled
   * separately via `hasError` — never by leaving this at `[]`, which would
   * read identically to "the queue is genuinely empty" and hide the queue
   * entirely instead of surfacing the failure.
   */
  items: IPendingSupplier[] | null;
  hasError?: boolean;
  /** Gates the "Cadastrar" button the same way the page gates "Novo
   *  fornecedor" (`usePermission("supplier", "create")`) — a view-only role
   *  must not reach the creation flow through the queue when the top button
   *  already denies it. */
  canCreate: boolean;
  /** Task 7 wires this to `SupplierFormDialog`, opened with the pending
   *  name prefilled as the corporate name. */
  onRegister: (pending: IPendingSupplier) => void;
}

/**
 * Names loose in `parts.supplier` with no matching `ISupplier` yet — the
 * enrichment backlog the screen's whole thesis rests on. Sits below the
 * table, in its own always-visible section — never a tab — because the
 * point is SEEING the distance between what is registered and what is
 * still just a string in the catalog, not toggling between two views of it.
 *
 * Same row density and tokens as `SuppliersTable`. A pending row is not an
 * error state; it is work waiting — so it reads with the neutral
 * `severity-info` token, never `warning`/`destructive`.
 */
export function SuppliersPendingQueue({
  items,
  hasError = false,
  canCreate,
  onRegister,
}: ISuppliersPendingQueueProps) {
  const [expanded, setExpanded] = useState(false);

  if (hasError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <Icon icon="mdi:cloud-alert-outline" size={16} className="shrink-0 text-destructive" />
        <p className="text-sm text-destructive">{COPY.error}</p>
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-56" />
        <div className="overflow-hidden rounded-xl border border-border">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="border-b border-border px-4 py-2.5 last:border-b-0">
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // The queue disappears entirely when empty — it is not a permanent chrome
  // element, it exists only while there is a gap to close.
  if (items.length === 0) return null;

  const hasMore = items.length > PREVIEW_COUNT;
  const visibleItems = expanded ? items : items.slice(0, PREVIEW_COUNT);

  return (
    <section aria-labelledby="suppliers-pending-queue-title">
      <h2
        id="suppliers-pending-queue-title"
        className="mb-1 flex items-center gap-1.5 text-sm font-bold text-foreground"
      >
        <Icon icon="mdi:clock-outline" size={15} className="text-severity-info" />
        {COPY.title(items.length)}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">{COPY.subtitle}</p>

      {/* No inner scrollbox: a bounded preview (`PREVIEW_COUNT` rows) plus an
          "Ver todos os N" control that expands the list IN PLACE, letting
          the section grow and the outer page area handle it. A cramped
          scrollbox would hide exactly what this queue exists to show — the
          size of the gap between registered suppliers and loose catalog
          names. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {visibleItems.map((pending) => (
          <div
            key={pending.key}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-severity-info/15 text-severity-info">
                <Icon icon="mdi:clock-outline" size={14} />
              </span>
              <div className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {pending.displayName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {COPY.partsCount(pending.partCount)}
                </span>
              </div>
            </div>
            {canCreate && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => onRegister(pending)}
              >
                <Icon icon="mdi:plus" size={14} />
                {COPY.register}
              </Button>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? COPY.showLess : COPY.viewAll(items.length)}
        </button>
      )}
    </section>
  );
}
