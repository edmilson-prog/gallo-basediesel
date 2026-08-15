import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IContact, ICustomer, ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ILinkCustomerDialogProps {
  contact: IContact | null;
  onClose: () => void;
  onConfirm: (contact: IContact, customerId: ID) => void;
}

/** ICustomer is a discriminated union: B2B carries cnpj/razaoSocial/nomeFantasia,
 *  B2C carries cpf/fullName. Narrow on `type` rather than reaching for fields
 *  that only exist on one side. */
function displayName(customer: ICustomer): string {
  if (customer.type === "B2B") return customer.nomeFantasia || customer.razaoSocial || "Sem nome";
  return customer.fullName || "Sem nome";
}

function documentOf(customer: ICustomer): string | null {
  return customer.type === "B2B" ? customer.cnpj : customer.cpf;
}

/**
 * Links a loose contact to a customer — the Agenda's central action.
 *
 * Search is debounced and runs against the customers provider, so it obeys the
 * caller's own RLS: a seller only ever sees, and therefore can only ever link
 * to, customers they legitimately reach. That mirrors the `customer_id` guard
 * the contacts policy enforces server-side.
 */
export function LinkCustomerDialog({ contact, onClose, onConfirm }: ILinkCustomerDialogProps) {
  const provider = useCustomersProvider();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<ID | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  // Reset between openings so a previous search never bleeds into the next.
  useEffect(() => {
    if (contact) {
      setTerm("");
      setDebounced("");
      setSelected(null);
    }
  }, [contact]);

  const { data, isFetching } = useQuery({
    queryKey: ["contacts-link-customer-search", debounced] as const,
    queryFn: () => provider.list({ search: debounced, page: 1, pageSize: 20 }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const results = data?.data ?? [];

  if (!contact) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:link-variant" size={18} className="text-primary" />
            Vincular a cliente
          </DialogTitle>
          <DialogDescription>{contact.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar cliente por nome ou CNPJ…"
            aria-label="Buscar cliente"
            autoFocus
          />

          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {debounced.length < 2 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Digite ao menos 2 caracteres para buscar.
              </p>
            ) : isFetching ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Buscando…</p>
            ) : results.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum cliente encontrado. Contatos sem cliente continuam na agenda como soltos.
              </p>
            ) : (
              results.map((customer, index) => {
                const isSelected = selected === customer.id;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => setSelected(customer.id)}
                    className={cn(
                      "flex w-full items-center gap-2 p-2.5 text-left transition-colors",
                      index > 0 && "border-t border-border",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/50",
                    )}
                  >
                    <Icon
                      icon="mdi:office-building-outline"
                      size={16}
                      className={cn(
                        "shrink-0",
                        isSelected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          isSelected && "text-primary",
                        )}
                      >
                        {displayName(customer)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[documentOf(customer), customer.address?.city]
                          .filter(Boolean)
                          .join(" · ") || "sem documento"}
                      </span>
                    </span>
                    {isSelected && <Icon icon="mdi:check" size={16} className="text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!selected} onClick={() => selected && onConfirm(contact, selected)}>
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
