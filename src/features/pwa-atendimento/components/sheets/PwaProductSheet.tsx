import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { usePartLookup } from "@/features/part-lookup/hooks/usePartLookup";
import { buildPartInsertText, priceText } from "@/features/part-lookup";
import { PwaSheet } from "../ui/PwaSheet";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";

interface IPwaProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the ready-to-send block for the picked part. */
  onPick: (text: string) => void;
}

/**
 * "Enviar produto" — the phone's take on the desk's consultor de peças.
 *
 * The desktop panel is a fixed 380px aside, so it cannot be reused as-is; the
 * search hook and the message builder can, and those are what actually carry
 * the pricing and stock rules.
 */
export function PwaProductSheet({ open, onOpenChange, onPick }: IPwaProductSheetProps) {
  const search = usePartLookup();

  const pick = (part: IPart) => {
    onPick(buildPartInsertText(part));
    onOpenChange(false);
  };

  return (
    <PwaSheet open={open} onOpenChange={onOpenChange} title={S.product.title}>
      <div className="mb-3 flex h-11 items-center gap-2.5 rounded bg-foreground/[0.05] px-3 ring-1 ring-inset ring-border">
        <Icon icon="mdi:magnify" size={16} className="text-muted-foreground" />
        <input
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          placeholder={S.product.searchPlaceholder}
          aria-label={S.product.searchPlaceholder}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </div>

      <div className="flex flex-col">
        {search.list.isLoading ? (
          <p className="flex items-center justify-center gap-2 py-7 text-[13px] text-muted-foreground">
            <Icon icon="mdi:loading" size={15} className="animate-spin" />
            Buscando peças…
          </p>
        ) : search.visibleParts.length === 0 ? (
          <p className="py-7 text-center text-[13px] text-muted-foreground">{S.product.empty}</p>
        ) : (
          search.visibleParts.map((part) => (
            <button
              key={part.id}
              type="button"
              onClick={() => pick(part)}
              className="flex min-h-[56px] w-full items-center gap-3 border-b border-border px-0.5 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold leading-snug text-foreground">
                  {part.name}
                </span>
                <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
                  {part.sku}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[13.5px] font-extrabold text-foreground">
                  {priceText(part)}
                </span>
                <span
                  className={`mt-0.5 block text-[10.5px] font-bold ${
                    part.stockAvailable > 0 ? "text-severity-success" : "text-severity-critical"
                  }`}
                >
                  {part.stockAvailable > 0
                    ? S.product.inStock(part.stockAvailable)
                    : S.product.outOfStock}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </PwaSheet>
  );
}
