import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IContact, ID } from "@/shared/types";
import { useContactsProvider } from "@/providers/data";
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

export interface IMergeContactDialogProps {
  /** The contact being triaged — the one that gets absorbed. */
  contact: IContact | null;
  onClose: () => void;
  onConfirm: (primary: IContact, duplicate: IContact) => void;
}

/**
 * Picks the record a triaged contact should be folded into.
 *
 * Direction matters and is stated on screen: the contact on the queue is
 * absorbed INTO the one chosen here. Nothing is lost either way — the merge
 * copies over whatever the survivor is missing — but only one of the two
 * keeps appearing in the Agenda, and the attendant has to know which.
 */
export function MergeContactDialog({ contact, onClose, onConfirm }: IMergeContactDialogProps) {
  const provider = useContactsProvider();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedId, setSelectedId] = useState<ID | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (contact) {
      setTerm("");
      setDebounced("");
      setSelectedId(null);
    }
  }, [contact]);

  const { data, isFetching } = useQuery({
    queryKey: ["contacts-merge-search", debounced] as const,
    queryFn: () => provider.list({ search: debounced, page: 1, pageSize: 20 }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  // Never offer the contact itself as its own merge target.
  const results = (data?.data ?? []).filter((row) => row.id !== contact?.id);
  const selected = results.find((row) => row.id === selectedId) ?? null;

  if (!contact) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:call-merge" size={18} className="text-primary" />
            Mesclar contato
          </DialogTitle>
          <DialogDescription>
            “{contact.name}” será absorvido pelo contato escolhido e sai da agenda. Campos que
            faltarem no contato mantido são preenchidos com os deste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar contato por nome, telefone ou e-mail…"
            aria-label="Buscar contato"
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
                Nenhum outro contato encontrado com esse termo.
              </p>
            ) : (
              results.map((row, index) => {
                const isSelected = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "flex w-full items-center gap-2 p-2.5 text-left transition-colors",
                      index > 0 && "border-t border-border",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/50",
                    )}
                  >
                    <Icon
                      icon="mdi:account-outline"
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
                        {row.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[row.phone, row.customerName ?? "sem cliente"].filter(Boolean).join(" · ")}
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
          <Button disabled={!selected} onClick={() => selected && onConfirm(selected, contact)}>
            Mesclar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
