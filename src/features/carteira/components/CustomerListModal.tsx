import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/Icon";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

export interface ICustomerListModalProps {
  open: boolean;
  customerIds: ID[];
  onClose: () => void;
}

/**
 * Above this many ids, resolving one-by-one via `get()` costs more round trips
 * than pulling the full list once and filtering client-side.
 */
const PER_ID_FETCH_THRESHOLD = 30;

export function CustomerListModal({ open, customerIds, onClose }: ICustomerListModalProps) {
  const provider = useCustomersProvider();
  const query = useQuery({
    queryKey: ["carteira-customer-list", customerIds],
    queryFn: async () => {
      if (customerIds.length === 0) return [] as ICustomer[];
      if (customerIds.length <= PER_ID_FETCH_THRESHOLD) {
        // Small set — single-row reads are cheaper than fetching the whole
        // customer base. Missing/inaccessible ids are silently omitted, same
        // as the list+filter path below.
        const results = await Promise.all(
          customerIds.map((id) => provider.get(id).catch(() => null)),
        );
        return results.filter((c): c is ICustomer => c !== null);
      }
      // The contract has no ids filter — fetch the full set and match ids
      // client-side. A carteira transfer can carry thousands of ids, where N
      // single-row gets would be worse than the chunked full list.
      const result = await provider.list({ pageSize: FETCH_ALL_PAGE_SIZE });
      return result.data.filter((c) => customerIds.includes(c.id));
    },
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{CARTEIRA_STRINGS.modals.customerList.title}</DialogTitle>
          <DialogDescription>
            {CARTEIRA_STRINGS.modals.customerList.description(customerIds.length)}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto pr-2">
          {query.isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Icon icon="mdi:loading" size={16} className="animate-spin" /> Carregando…
            </div>
          )}
          {!query.isLoading && (query.data ?? []).length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">
              {CARTEIRA_STRINGS.modals.customerList.empty}
            </p>
          )}
          {(query.data ?? []).length > 0 && (
            <ul className="divide-y divide-border">
              {(query.data ?? []).map((c) => {
                const name = getCustomerName(c);
                return (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-[10px] font-semibold uppercase text-foreground">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{name}</p>
                        <p className="text-xs text-muted-foreground">{c.id}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {CARTEIRA_STRINGS.modals.customerList.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
