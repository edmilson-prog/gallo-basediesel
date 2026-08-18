// src/features/quotes/components/new/summary/QuoteNotes.tsx
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Textarea } from "@/components/ui/textarea";

export interface IQuoteNotesProps {
  notes: string;
  onNotes: (v: string) => void;
  /** `card` renders an always-open card; `rail` collapses behind a header. */
  variant?: "rail" | "card";
}

/** Internal notes — never sent to the customer. */
export function QuoteNotes({ notes, onNotes, variant = "rail" }: IQuoteNotesProps) {
  const isCard = variant === "card";
  const [open, setOpen] = useState(isCard);

  const area = (
    <Textarea
      rows={3}
      value={notes}
      onChange={(e) => onNotes(e.target.value)}
      placeholder="Observações internas (não enviadas ao cliente)"
      aria-label="Notas internas"
      className={isCard ? "" : "mt-2.5"}
    />
  );

  if (isCard) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Icon icon="mdi:note-text-outline" size={15} className="text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Notas internas
          </h2>
        </header>
        <div className="p-3">{area}</div>
      </section>
    );
  }

  return (
    <div className="p-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2"
      >
        <Icon icon="mdi:note-text-outline" size={15} className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Notas internas
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {!open && notes.trim() && (
            <span className="max-w-32 truncate text-[11px] text-muted-foreground">{notes}</span>
          )}
          <Icon
            icon={open ? "mdi:chevron-up" : "mdi:chevron-down"}
            size={16}
            className="shrink-0 text-muted-foreground"
          />
        </span>
      </button>
      {open && area}
    </div>
  );
}
