import type { IContact, ID } from "@/shared/types";
import { cn } from "@/lib/utils";
import { contactInitials } from "../../engine/contactInitials";

export interface ITriageRailProps {
  contacts: IContact[];
  /** Total pending on the server — the rail only holds the loaded window. */
  total: number;
  currentId: ID | null;
  onPick: (index: number) => void;
  /** Ids of contacts triage has a suggestion for — the green dot. */
  withSuggestion: Set<ID>;
  isLoading: boolean;
}

/**
 * The queue, as a rail.
 *
 * It exists so the attendant can see what is coming and jump around, but the
 * decision always happens on the card to the right — one contact at a time.
 * The dot marks contacts triage already has a customer to propose for, so the
 * easy ones can be picked off first.
 */
export function TriageRail({
  contacts,
  total,
  currentId,
  onPick,
  withSuggestion,
  isLoading,
}: ITriageRailProps) {
  return (
    <div className="w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/20">
      <div className="sticky top-0 z-10 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
        Na fila · {total.toLocaleString("pt-BR")}
      </div>

      {isLoading ? (
        <p className="p-4 text-center text-xs text-muted-foreground">Carregando…</p>
      ) : contacts.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">Fila vazia</p>
      ) : (
        contacts.map((contact, index) => {
          const active = contact.id === currentId;
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => onPick(index)}
              aria-current={active}
              className={cn(
                "flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors",
                active
                  ? "bg-primary/10 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                  : "hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold",
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {contactInitials(contact.name)}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-xs font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {contact.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="truncate font-mono text-[11px] text-muted-foreground/80">
                    {contact.phone ?? "sem telefone"}
                  </span>
                  {withSuggestion.has(contact.id) && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-severity-success"
                      title="Tem sugestão de vínculo"
                    />
                  )}
                </span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
