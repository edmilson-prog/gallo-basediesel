import type { IContact } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { contactInitials } from "../../engine/contactInitials";

export interface ITriageIgnoredListProps {
  contacts: IContact[];
  isLoading: boolean;
  isError: boolean;
  onRestore: (contact: IContact) => void;
  busy: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("pt-BR");
}

/**
 * Contacts triaged out of the Agenda, newest first.
 *
 * Every row can be undone. An ignore is a judgement call made in seconds —
 * "fornecedor" today can be a customer next month — so the way back has to be
 * one click from the same screen that made the call.
 */
export function TriageIgnoredList({
  contacts,
  isLoading,
  isError,
  onRestore,
  busy,
}: ITriageIgnoredListProps) {
  if (isLoading) {
    return (
      <div className="grid flex-1 place-items-center p-8">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <p className="max-w-sm text-sm text-severity-critical">
          Não foi possível carregar os contatos ignorados.
        </p>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Nada ignorado ainda. Contatos ignorados somem da agenda mas continuam aqui, com o motivo
          registrado, e podem voltar a qualquer momento.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-border">
        {contacts.map((contact, index) => (
          <div
            key={contact.id}
            className={`flex items-center gap-3 bg-card p-3 ${index > 0 ? "border-t border-border" : ""}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[11px] font-semibold text-muted-foreground">
              {contactInitials(contact.name)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {contact.phone ?? "sem telefone"}
                {contact.ignoredAt ? ` · ignorado em ${formatDate(contact.ignoredAt)}` : ""}
              </p>
            </div>

            {contact.ignoreReason && (
              <Badge
                variant="outline"
                className="hidden shrink-0 border-severity-critical/40 text-[10px] text-severity-critical sm:inline-flex"
              >
                {contact.ignoreReason}
              </Badge>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={busy}
              onClick={() => onRestore(contact)}
            >
              <Icon icon="mdi:undo-variant" size={15} />
              Devolver
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
