import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";

export interface IPendingContactsViewProps {
  customers: ICustomer[];
  onConvert: (customer: ICustomer) => void;
  onDiscard: (customer: ICustomer) => void;
}

export function PendingContactsTable({ customers, onConvert, onDiscard }: IPendingContactsViewProps) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="px-3 py-2">{S.queue.columns.contact}</th>
          <th className="px-3 py-2">{S.queue.columns.phone}</th>
          <th className="px-3 py-2 text-right">{S.queue.columns.actions}</th>
        </tr>
      </thead>
      <tbody>
        {customers.map((c) => (
          <tr key={c.id} className="border-b border-border/60">
            <td className="px-3 py-2 text-foreground">{getCustomerName(c) || S.queue.noName}</td>
            <td className="px-3 py-2 text-muted-foreground">{c.phone}</td>
            <td className="px-3 py-2">
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => onConvert(c)}>{S.banner.convert}</Button>
                <Button size="sm" variant="outline" onClick={() => onDiscard(c)}>{S.banner.discard}</Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
