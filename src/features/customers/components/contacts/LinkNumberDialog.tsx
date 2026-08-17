import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IContact, ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useContactsProvider } from "@/providers/data";
import { formatPhone } from "@/shared/utils/format";
import { contactInitials } from "@/features/contacts";
import { getCustomerName } from "../../utils/customerDisplay";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.linkNumber;

export interface ILinkNumberDialogProps {
  customer: ICustomer;
  /** How many numbers the company already has — drives the first promise. */
  currentCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: (contact: IContact, role: string) => void;
}

/**
 * Adds one more number to a company.
 *
 * The mirror of the Agenda's `LinkCustomerDialog`: there a loose contact looks
 * for its company, here a known company looks for one of its people.
 *
 * The "Como vai ficar" block is the point of this screen. The owner's fear is
 * concrete — a previous link replaced the person's name with the company's and
 * dropped the number — so this does not PROMISE that nothing is destroyed, it
 * SHOWS the outcome: the person, still named, nested under the company. The
 * block only appears once a contact is picked; before that there is nothing
 * true to render, and a placeholder would be decoration.
 */
export function LinkNumberDialog({
  customer,
  currentCount,
  open,
  onOpenChange,
  onLinked,
}: ILinkNumberDialogProps) {
  const provider = useContactsProvider();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<IContact | null>(null);
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  // Reset between openings so a previous search never bleeds into the next.
  useEffect(() => {
    if (open) {
      setTerm("");
      setDebounced("");
      setSelected(null);
      setRole("");
    }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["link-number-search", customer.storeId, debounced] as const,
    queryFn: () =>
      provider.list({
        storeId: customer.storeId,
        search: debounced,
        page: 1,
        pageSize: 20,
      }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  // Someone already on this company is not a candidate — offering them would
  // produce a no-op link and read as a bug.
  const results = (data?.data ?? []).filter((c) => c.customerId !== customer.id);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      onLinked(selected, role.trim());
    } finally {
      setSaving(false);
    }
  };

  const companyName = getCustomerName(customer);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:link-variant-plus" size={18} className="text-primary" aria-hidden />
            {COPY.title}
          </DialogTitle>
          <DialogDescription>{COPY.description(companyName)}</DialogDescription>
        </DialogHeader>

        <Command shouldFilter={false} className="rounded-md border border-border">
          <CommandInput placeholder={COPY.searchPlaceholder} value={term} onValueChange={setTerm} />
          <CommandList className="max-h-56">
            {debounced.length < 2 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">{COPY.searchHint}</p>
            ) : isFetching ? (
              <p className="p-4 text-center text-xs text-muted-foreground">{COPY.searching}</p>
            ) : results.length === 0 ? (
              <CommandEmpty className="p-4 text-center text-xs text-muted-foreground">
                {COPY.noResults}
              </CommandEmpty>
            ) : (
              results.map((contact) => {
                const isSelected = selected?.id === contact.id;
                return (
                  <CommandItem
                    key={contact.id}
                    value={contact.id}
                    onSelect={() => setSelected(contact)}
                    className={cn("gap-2", isSelected && "bg-primary/10")}
                  >
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground"
                    >
                      {contactInitials(contact.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          isSelected && "text-primary",
                        )}
                      >
                        {contact.name}
                      </span>
                      <span className="block truncate text-xs tabular-nums text-muted-foreground">
                        {[
                          contact.phone ? formatPhone(contact.phone) : null,
                          contact.customerName,
                        ]
                          .filter(Boolean)
                          .join(" · ") || COPY.noNumber}
                      </span>
                    </span>
                    {isSelected && (
                      <Icon icon="mdi:check" size={16} className="text-primary" aria-hidden />
                    )}
                  </CommandItem>
                );
              })
            )}
          </CommandList>
        </Command>

        {selected && (
          <>
            {/* Already on another company — moving it is legitimate, but it must
                be stated before the click, not discovered after. */}
            {selected.customerId && selected.customerId !== customer.id && (
              <p className="flex items-start gap-1.5 rounded-md border border-severity-warning/30 bg-severity-warning/5 p-2.5 text-[11px] leading-relaxed text-severity-warning">
                <Icon icon="mdi:alert-outline" size={13} className="mt-px shrink-0" aria-hidden />
                {COPY.movingFrom(selected.customerName ?? "")}
              </p>
            )}

            <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {COPY.previewTitle}
              </p>

              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold text-primary"
                >
                  {contactInitials(selected.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold uppercase text-foreground">
                    {selected.name}
                  </p>
                  <p className="truncate text-xs tabular-nums text-muted-foreground">
                    {[role.trim() || selected.role, formatPhone(selected.phone ?? "")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-1 flex min-w-0 items-center gap-1 text-xs font-medium text-primary">
                    <Icon
                      icon="mdi:subdirectory-arrow-right"
                      size={13}
                      aria-hidden
                      className="shrink-0 text-muted-foreground"
                    />
                    <Icon icon="mdi:office-building" size={13} aria-hidden className="shrink-0" />
                    <span className="truncate">{companyName}</span>
                  </p>
                </div>
              </div>

              <ul className="space-y-1 border-t border-border pt-2">
                {[
                  currentCount > 0 ? COPY.promiseAdds(currentCount) : COPY.promiseBecomesPrimary,
                  COPY.promiseKeepsIdentity,
                  COPY.promiseUndoable,
                ].map((text) => (
                  <li
                    key={text}
                    className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
                  >
                    <Icon
                      icon="mdi:check"
                      size={13}
                      aria-hidden
                      className="mt-px shrink-0 text-severity-success"
                    />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1">
              <Label htmlFor="link-number-role" className="text-xs text-muted-foreground">
                {COPY.roleLabel}
              </Label>
              <Input
                id="link-number-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={COPY.rolePlaceholder}
                className="h-8 text-xs"
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {COPY.cancel}
          </Button>
          <Button disabled={!selected || saving} onClick={() => void handleConfirm()}>
            {saving ? COPY.saving : COPY.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
