import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import type { IPendingContactsViewProps } from "./PendingContactsTable";

export function PendingContactsCards({ customers, onConvert, onDiscard }: IPendingContactsViewProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {customers.map((c) => (
        <div key={c.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="font-medium text-foreground">{getCustomerName(c) || S.queue.noName}</p>
            <p className="text-sm text-muted-foreground">{c.phone}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onConvert(c)}>{S.banner.convert}</Button>
            <Button size="sm" variant="outline" onClick={() => onDiscard(c)}>{S.banner.discard}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
