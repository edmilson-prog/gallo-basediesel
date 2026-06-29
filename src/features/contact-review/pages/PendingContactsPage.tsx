import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ICustomer } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { usePendingContacts } from "../hooks/usePendingContacts";
import { useContactConversion } from "../hooks/useContactConversion";
import { ConvertContactDialog } from "../components/ConvertContactDialog";
import { MarkNotCustomerDialog } from "../components/MarkNotCustomerDialog";
import { PendingContactsTable } from "../components/PendingContactsTable";
import { PendingContactsCards } from "../components/PendingContactsCards";
import { PendingContactsSplit } from "../components/PendingContactsSplit";

type ViewMode = "table" | "cards" | "split";
type StatusTab = "pending_review" | "reviewed_not_customer";

const VIEW_KEY = "gallo-pending-contacts-view";
const VIEWS: { id: ViewMode; label: string; icon: string }[] = [
  { id: "table", label: S.queue.views.table, icon: "mdi:table" },
  { id: "cards", label: S.queue.views.cards, icon: "mdi:view-grid-outline" },
  { id: "split", label: S.queue.views.split, icon: "mdi:view-split-vertical" },
];

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "pending_review", label: S.queue.status.pending },
  { id: "reviewed_not_customer", label: S.queue.status.discarded },
];

export function PendingContactsPage() {
  const { currentStoreId } = useCurrentStore();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>(() => {
    // Validate against known view ids — a stale/garbage localStorage value must
    // not flow into the render switch (would fall through to an unintended view).
    const stored = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((v) => v.id === stored) ? (stored as ViewMode) : "table";
  });
  const [status, setStatus] = useState<StatusTab>("pending_review");
  const [convertTarget, setConvertTarget] = useState<ICustomer | null>(null);
  const [discardTarget, setDiscardTarget] = useState<ICustomer | null>(null);

  const { restore } = useContactConversion();

  // Search field expand/collapse state
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Global "/" shortcut: focus the search field (mirrors VehiclesHeader pattern).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  // Debounce the search term so the query only fires after 300 ms of inactivity
  // (the input stays controlled and responsive; only the query is deferred).
  const debouncedSearch = useDebounce(search, 300);

  const query = usePendingContacts({
    storeId: currentStoreId,
    search: debouncedSearch,
    page: 1,
    pageSize: 200,
    statusTag: status,
  });
  const customers = useMemo(() => query.data?.data ?? [], [query.data]);
  // While placeholderData keeps the previous total visible during search,
  // fall back to 0 only when there is no data at all.
  const total = query.data?.total ?? 0;

  // Scroll container exposed to the progress bar (sibling of the header block).
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const contentRef = useCallback((el: HTMLDivElement | null) => setScrollEl(el), []);

  const handleRestore = useCallback(
    async (c: ICustomer) => {
      try {
        await restore(c.id);
        toast.success(S.discarded.success);
      } catch {
        toast.error(S.discarded.failure);
      }
    },
    [restore],
  );

  const isPending = status === "pending_review";

  const viewProps = isPending
    ? {
        customers,
        onConvert: (c: ICustomer) => setConvertTarget(c),
        onDiscard: (c: ICustomer) => setDiscardTarget(c),
      }
    : {
        customers,
        onRestore: handleRestore,
      };

  const emptyText = isPending ? S.queue.empty : S.queue.emptyDiscarded;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Fixed header block — the progress line rides its bottom edge. */}
      <div className="relative">
        <header className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-background/85 px-6 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
          <h1 className="shrink-0 text-lg font-semibold text-foreground">{S.queue.title}</h1>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {total}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Dynamic-width search with "/" shortcut + kbd hint + Escape (§3 UX). */}
            <div
              className={cn(
                "relative flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
                focused ? "max-w-2xl" : "max-w-sm",
              )}
            >
              <Icon
                icon="mdi:magnify"
                size={16}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.blur();
                }}
                placeholder={S.queue.search}
                className="h-9 w-full bg-muted/40 pl-8 pr-9 text-sm transition-colors focus-visible:bg-background"
              />
              <kbd
                aria-hidden
                className={cn(
                  "pointer-events-none absolute right-2 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground transition-opacity duration-200 sm:flex",
                  focused ? "opacity-0" : "opacity-100",
                )}
              >
                /
              </kbd>
            </div>

            {/* Status toggle: Pendentes / Descartados */}
            <div className="flex shrink-0 gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatus(tab.id)}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                    (status === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  title={v.label}
                  onClick={() => setView(v.id)}
                  className={
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                    (view === v.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon icon={v.icon} size={14} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </header>
        <ScrollProgressBar container={scrollEl} />
      </div>

      {/* Scrollable content area — ref captured for the progress bar. */}
      <div ref={contentRef} className="min-h-0 flex-1 overflow-auto p-6">
        {/* Fix #7: show a loading state on first fetch instead of "Nenhum contato". */}
        {query.isPending ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : customers.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : view === "table" ? (
          <PendingContactsTable {...viewProps} />
        ) : view === "cards" ? (
          <PendingContactsCards {...viewProps} />
        ) : (
          <PendingContactsSplit {...viewProps} />
        )}
        {customers.length > 0 && total > customers.length && (
          <p className="mt-3 text-center text-xs text-muted-foreground">{S.queue.truncatedHint}</p>
        )}
      </div>

      {isPending && convertTarget && (
        <ConvertContactDialog
          customer={convertTarget}
          open={Boolean(convertTarget)}
          onOpenChange={(o) => !o && setConvertTarget(null)}
          onConverted={() => setConvertTarget(null)}
        />
      )}
      {isPending && discardTarget && (
        <MarkNotCustomerDialog
          customerId={discardTarget.id}
          open={Boolean(discardTarget)}
          onOpenChange={(o) => !o && setDiscardTarget(null)}
          onDone={() => setDiscardTarget(null)}
        />
      )}
    </div>
  );
}
