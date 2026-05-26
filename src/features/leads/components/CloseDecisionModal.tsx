import type { ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.closeModal;

export interface ICloseDecisionModalProps {
  lead: ILead | null;
  onCancel: () => void;
  onConverted: (lead: ILead) => void;
  onLost: (lead: ILead) => void;
}

export function CloseDecisionModal({
  lead,
  onCancel,
  onConverted,
  onLost,
}: ICloseDecisionModalProps) {
  const open = lead !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="space-y-2 py-2">
            <button
              type="button"
              onClick={() => onConverted(lead)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/5"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Icon icon="mdi:check-decagram" size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{COPY.converted}</p>
                <p className="text-xs text-muted-foreground">
                  Cria o cliente preservando o histórico do lead.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onLost(lead)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-red-500/50 hover:bg-red-500/5"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-red-500/15 text-red-700 dark:text-red-300">
                <Icon icon="mdi:close-octagon" size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{COPY.lost}</p>
                <p className="text-xs text-muted-foreground">
                  Informe um motivo taxonomizado para análise futura.
                </p>
              </div>
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {COPY.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
