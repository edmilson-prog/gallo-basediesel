import type { IFiscalNote } from "@/shared/types";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface IFiscalNotesKpisProps {
  notes: IFiscalNote[];
}

export function FiscalNotesKpis({ notes }: IFiscalNotesKpisProps) {
  const s = FISCAL_NOTES_STRINGS.kpis;
  const inReview = notes.filter((n) => n.status === "conferencia");
  const totalValue = notes.reduce((sum, n) => sum + n.total, 0);
  const unlinked = inReview.reduce(
    (sum, note) => sum + note.items.filter((item) => !item.confirmed).length,
    0,
  );

  const cards: Array<{ label: string; value: string; hint?: string; tone?: string }> = [
    { label: s.notes, value: String(notes.length) },
    { label: s.value, value: brl(totalValue), hint: s.valueHint },
    {
      label: s.review,
      value: String(inReview.length),
      hint: inReview.length ? brl(inReview.reduce((sum, n) => sum + n.total, 0)) : s.reviewEmpty,
      tone: inReview.length ? "text-severity-warning" : undefined,
    },
    {
      label: s.unlinked,
      value: String(unlinked),
      hint: s.unlinkedHint,
      tone: unlinked ? "text-severity-critical" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card px-4 py-3">
          <p className="font-semicond text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {card.label}
          </p>
          <p
            className={`mt-1 font-display text-2xl font-extrabold leading-none tabular-nums ${card.tone ?? "text-foreground"}`}
          >
            {card.value}
          </p>
          {card.hint && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{card.hint}</p>}
        </div>
      ))}
    </div>
  );
}
