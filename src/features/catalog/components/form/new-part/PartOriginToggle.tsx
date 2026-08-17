import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.newPart.identity;

export interface IPartOriginToggleProps {
  isOriginal: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Origin as two named states instead of a switch.
 *
 * A switch labelled "Peça original (OEM)" only tells you what one of its two
 * positions means; the other is whatever "off" happens to be. Both states are
 * real classifications here, so both get a name and a line explaining it.
 */
export function PartOriginToggle({ isOriginal, onChange }: IPartOriginToggleProps) {
  const options = [
    { value: false, label: COPY.equivalent, note: COPY.equivalentNote },
    { value: true, label: COPY.original, note: COPY.originalNote },
  ];

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {COPY.originLabel}
      </div>
      <div
        role="radiogroup"
        aria-label={COPY.originLabel}
        className="grid grid-cols-2 gap-1 rounded-[9px] bg-muted/40 p-1"
      >
        {options.map((option) => {
          const selected = isOriginal === option.value;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-[7px] px-3 py-2 text-center",
                "transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                selected ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-card/50",
              )}
            >
              <span
                className={cn(
                  "block text-xs font-bold",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {option.label}
              </span>
              <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">
                {option.note}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
