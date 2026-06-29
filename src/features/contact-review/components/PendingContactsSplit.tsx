import { useEffect, useState } from "react";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import type { IPendingContactsViewProps } from "./PendingContactsTable";

export function PendingContactsSplit({ customers, onConvert, onDiscard, onRestore }: IPendingContactsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(customers[0]?.id ?? null);
  useEffect(() => {
    if (!customers.some((c) => c.id === selectedId)) setSelectedId(customers[0]?.id ?? null);
  }, [customers, selectedId]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex min-h-[320px] overflow-hidden rounded-lg border border-border">
      <ul className="w-2/5 max-w-xs overflow-auto border-r border-border">
        {customers.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={
                "w-full truncate px-3 py-2.5 text-left text-sm " +
                (c.id === selectedId
                  ? "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]"
                  : "text-muted-foreground hover:bg-muted/50")
              }
            >
              {getCustomerName(c) || S.queue.noName}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex-1 p-5">
        {selected ? (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{getCustomerName(selected) || S.queue.noName}</p>
              <p className="text-sm text-muted-foreground">{selected.phone}</p>
            </div>
            <div className="flex gap-2">
              {onRestore ? (
                <Button size="sm" variant="outline" onClick={() => onRestore(selected)}>{S.discarded.restore}</Button>
              ) : (
                <>
                  {onConvert && <Button size="sm" onClick={() => onConvert(selected)}>{S.banner.convert}</Button>}
                  {onDiscard && <Button size="sm" variant="outline" onClick={() => onDiscard(selected)}>{S.banner.discard}</Button>}
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{S.queue.empty}</p>
        )}
      </div>
    </div>
  );
}
