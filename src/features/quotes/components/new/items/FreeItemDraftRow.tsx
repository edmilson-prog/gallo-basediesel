// src/features/quotes/components/new/items/FreeItemDraftRow.tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import type { QuoteDensity } from "../../../types/editor";
import { parseDecimalBR } from "../../../utils/numberInput";
import {
  FREE_ITEM_KINDS,
  applyFreeItemKind,
  isFreeItemKindActive,
} from "../../../utils/freeItemKind";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IFreeItemDraft {
  name: string;
  /** Raw text as typed — parsed on commit. */
  unitPrice: string;
  quantity: number;
}

export interface IFreeItemDraftRowProps {
  draft: IFreeItemDraft;
  onDraft: (draft: IFreeItemDraft) => void;
  onCommit: () => void;
  onCancel: () => void;
  density: QuoteDensity;
  /** Grid template shared with the table so the columns line up. */
  colsClassName: string;
}

/**
 * Off-catalog item as an editable row in the table itself, instead of a modal
 * with three fields. Enter confirms, Esc cancels; the price is the gate, since
 * the quote requires a unit price above zero.
 */
export function FreeItemDraftRow({
  draft,
  onDraft,
  onCommit,
  onCancel,
  density,
  colsClassName,
}: IFreeItemDraftRowProps) {
  const price = parseDecimalBR(draft.unitPrice);
  const valid = draft.name.trim().length > 0 && price > 0;
  const rowPadY = density === "compact" ? "py-1.5" : "py-2";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && valid) {
      e.preventDefault();
      onCommit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="border-b border-l-2 border-border border-l-primary bg-primary/5">
      <div className={`grid ${colsClassName} items-center gap-2.5 px-3 ${rowPadY}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-semibold uppercase text-primary">
            Avulso
          </span>
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => onDraft({ ...draft, name: e.target.value })}
            onKeyDown={onKeyDown}
            aria-label="Descrição do item avulso"
            placeholder="Descrição — ex.: Mão de obra, taxa, peça sob encomenda"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[13px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-primary/60"
          />
        </div>

        <div className="flex items-center justify-self-end overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => onDraft({ ...draft, quantity: Math.max(1, draft.quantity - 1) })}
            disabled={draft.quantity <= 1}
            aria-label="Diminuir quantidade"
            className="grid h-7 w-6 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Icon icon="mdi:minus" size={13} />
          </button>
          <span className="min-w-6 text-center text-[13px] font-semibold tabular-nums text-foreground">
            {draft.quantity}
          </span>
          <button
            type="button"
            onClick={() => onDraft({ ...draft, quantity: draft.quantity + 1 })}
            aria-label="Aumentar quantidade"
            className="grid h-7 w-6 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon icon="mdi:plus" size={13} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1">
          <span className="shrink-0 text-[11px] text-muted-foreground">R$</span>
          <input
            value={draft.unitPrice}
            onChange={(e) => onDraft({ ...draft, unitPrice: e.target.value })}
            onKeyDown={onKeyDown}
            onFocus={(e) => e.currentTarget.select()}
            inputMode="decimal"
            aria-label="Preço unitário do item avulso"
            className="w-full min-w-0 border-0 bg-transparent p-0 text-right text-[13px] font-medium tabular-nums text-foreground outline-none"
          />
        </div>

        <span className="text-right text-xs text-muted-foreground">—</span>

        <span
          className={`text-right text-[15px] font-semibold tabular-nums ${
            valid ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {moneyFormatter.format(draft.quantity * price)}
        </span>

        <button
          type="button"
          onClick={onCancel}
          title="Cancelar (Esc)"
          aria-label="Cancelar item avulso"
          className="grid h-7 w-7 place-items-center justify-self-end rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon icon="mdi:close" size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
        <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tipo
        </span>
        {FREE_ITEM_KINDS.map((kind) => {
          const active = isFreeItemKindActive(draft.name, kind.label);
          return (
            <button
              key={kind.id}
              type="button"
              onClick={() => onDraft({ ...draft, name: applyFreeItemKind(draft.name, kind.label) })}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors motion-reduce:transition-none ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon icon={kind.icon} size={12} />
              {kind.label}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {valid ? "Enter adiciona · Esc cancela" : "descrição e preço são obrigatórios"}
          </span>
          <Button type="button" size="sm" disabled={!valid} onClick={onCommit}>
            Adicionar
          </Button>
        </span>
      </div>
    </div>
  );
}
