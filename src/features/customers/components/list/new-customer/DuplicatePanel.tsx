import type { ID } from "@/shared/types";
import type { ICustomerDocumentMatch } from "@/providers/data";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CUSTOMER_STRINGS } from "../../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.newCustomer.duplicate;

export interface IDuplicatePanelProps {
  matches: ICustomerDocumentMatch[];
  onOpenCustomer: (id: ID) => void;
}

/**
 * The document is already a customer of this store — creation is off the table.
 *
 * The wallet owner is named on purpose: the match may sit in a colleague's
 * carteira and be invisible in the list to the seller reading this, so "já está
 * na base" without a name would look like the guard is simply wrong.
 */
export function DuplicatePanel({ matches, onOpenCustomer }: IDuplicatePanelProps) {
  if (matches.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-top-1 space-y-2 rounded-[9px] border border-primary/45 bg-primary/[0.07] px-3.5 py-3 duration-300">
      {matches.map((match) => (
        <div key={match.id} className="flex items-center gap-[11px]">
          <Icon icon="mdi:account-check-outline" size={17} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-foreground">
              {COPY.title(match.displayName)}
            </div>
            <div className="mt-px truncate text-[11.5px] text-muted-foreground">
              {match.sellerName ? COPY.ownedBy(match.sellerName) : COPY.unassigned}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onOpenCustomer(match.id)}
            className="shrink-0 gap-1.5 font-display text-xs font-bold uppercase tracking-[0.045em]"
          >
            <Icon icon="mdi:arrow-right" size={13} />
            {COPY.openCta}
          </Button>
        </div>
      ))}
    </div>
  );
}
