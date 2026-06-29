import { useEffect, useMemo, useState } from "react";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { usePendingContacts } from "../hooks/usePendingContacts";
import { ConvertContactDialog } from "../components/ConvertContactDialog";
import { MarkNotCustomerDialog } from "../components/MarkNotCustomerDialog";
import { PendingContactsTable } from "../components/PendingContactsTable";
import { PendingContactsCards } from "../components/PendingContactsCards";
import { PendingContactsSplit } from "../components/PendingContactsSplit";

type ViewMode = "table" | "cards" | "split";
const VIEW_KEY = "gallo-pending-contacts-view";
const VIEWS: { id: ViewMode; label: string; icon: string }[] = [
  { id: "table", label: S.queue.views.table, icon: "mdi:table" },
  { id: "cards", label: S.queue.views.cards, icon: "mdi:view-grid-outline" },
  { id: "split", label: S.queue.views.split, icon: "mdi:view-split-vertical" },
];

export function PendingContactsPage() {
  const { currentStoreId } = useCurrentStore();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || "table",
  );
  const [convertTarget, setConvertTarget] = useState<ICustomer | null>(null);
  const [discardTarget, setDiscardTarget] = useState<ICustomer | null>(null);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  const query = usePendingContacts({ storeId: currentStoreId, search, page: 1, pageSize: 200 });
  const customers = useMemo(() => query.data?.data ?? [], [query.data]);

  const viewProps = {
    customers,
    onConvert: (c: ICustomer) => setConvertTarget(c),
    onDiscard: (c: ICustomer) => setDiscardTarget(c),
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">{S.queue.title}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {query.data?.total ?? 0}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={S.queue.search}
              className="w-56 pl-8"
            />
          </div>
          <div className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
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

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {customers.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{S.queue.empty}</p>
        ) : view === "table" ? (
          <PendingContactsTable {...viewProps} />
        ) : view === "cards" ? (
          <PendingContactsCards {...viewProps} />
        ) : (
          <PendingContactsSplit {...viewProps} />
        )}
      </div>

      {convertTarget && (
        <ConvertContactDialog
          customer={convertTarget}
          open={Boolean(convertTarget)}
          onOpenChange={(o) => !o && setConvertTarget(null)}
          onConverted={() => setConvertTarget(null)}
        />
      )}
      {discardTarget && (
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
