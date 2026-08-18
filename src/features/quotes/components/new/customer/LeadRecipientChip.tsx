import type { ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/shared/utils/format";

export interface ILeadRecipientChipProps {
  lead: ILead | null;
  isLoading: boolean;
  /** The lead could not be read — usually this seller's RLS, not a missing row. */
  failed: boolean;
  /** Drops the lead and returns the editor to the ordinary customer picker. */
  onClearLead: () => void;
}

/**
 * The recipient card when the quote is for a LEAD.
 *
 * Read-only by design: the lead arrived from the Atendimento panel's "Só
 * orçamento", which exists precisely so nobody has to pick anybody. Swapping
 * the recipient means going back to the customer picker, which the button does
 * by dropping the search param.
 */
export function LeadRecipientChip({
  lead,
  isLoading,
  failed,
  onClearLead,
}: ILeadRecipientChipProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <Icon icon="mdi:account-arrow-right-outline" size={12} className="text-muted-foreground" />
        <h2 className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Orçamento para lead
        </h2>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearLead}>
          Trocar por cliente
        </Button>
      </header>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando lead…</p>}

      {failed && (
        <p className="text-xs text-severity-critical">
          Não foi possível abrir este lead. Ele pode pertencer a outro vendedor.
        </p>
      )}

      {lead && (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {lead.name}
            </span>
            <span className="block text-xs text-muted-foreground">{formatPhone(lead.phone)}</span>
          </span>
          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            Lead
          </span>
        </div>
      )}

      {lead && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Sem frota nem histórico de compra — kits sugeridos e recompra ficam de fora até a
          conversão em cliente.
        </p>
      )}
    </section>
  );
}
