import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/shared/utils/format";

export interface ICompatiblePartRowProps {
  part: IPart;
  inKit: boolean;
  onAddToQuote?: (part: IPart) => void;
}

export function CompatiblePartRow({ part, inKit, onAddToQuote }: ICompatiblePartRowProps) {
  return (
    <div className="group flex items-center gap-2 px-2 py-2">
      {/* Curadoria marker — 16px, shrink-0 */}
      {inKit ? (
        <Icon
          icon="mdi:check-decagram"
          size={16}
          className="shrink-0 text-primary"
          ariaLabel="No Kit oficial"
        />
      ) : (
        <Icon
          icon="mdi:plus-circle-outline"
          size={16}
          className="shrink-0 text-muted-foreground"
          ariaLabel="Compatível, fora do Kit"
        />
      )}

      {/* SKU */}
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{part.sku}</span>

      {/* Name + category */}
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground" title={part.name}>
          {part.name}
        </span>
        {part.category && (
          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
            {part.category}
          </Badge>
        )}
      </div>

      {/* Brand — hidden on small screens */}
      <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">{part.brand}</span>

      {/* Price */}
      <span className="shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
        {formatBRL(part.unitPrice)}
      </span>

      {/* Add-to-quote action */}
      {onAddToQuote && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Adicionar ao orçamento"
          onClick={() => onAddToQuote(part)}
        >
          <Icon icon="mdi:cart-plus" size={16} />
        </Button>
      )}
    </div>
  );
}
