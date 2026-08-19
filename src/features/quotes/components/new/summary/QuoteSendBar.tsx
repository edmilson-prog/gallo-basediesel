// src/features/quotes/components/new/summary/QuoteSendBar.tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";

export interface IQuoteSendBarProps {
  canSubmit: boolean;
  submitting: boolean;
  needsApproval: boolean;
  /** What is still missing, written out. Null when the quote is ready. */
  blocker: string | null;
  onSaveSend: () => void;
  /** Saves the quote and opens a copy of it as a fresh draft. */
  onDuplicate: () => void;
}

/**
 * Primary action pinned to the foot of the rail, next to the total — with the
 * reason it is disabled spelled out instead of a silently dead button.
 */
export function QuoteSendBar({
  canSubmit,
  submitting,
  needsApproval,
  blocker,
  onSaveSend,
  onDuplicate,
}: IQuoteSendBarProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card/60 p-3.5">
      {blocker && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon icon="mdi:alert-circle-outline" size={13} className="text-severity-warning" />
          {blocker}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={!canSubmit || submitting}
          onClick={onDuplicate}
          title="Salvar e duplicar — grava este orçamento e abre uma cópia"
          aria-label="Salvar e duplicar"
        >
          <Icon icon="mdi:content-duplicate" size={16} />
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-1"
          disabled={!canSubmit || submitting}
          onClick={onSaveSend}
        >
          <Icon icon={needsApproval ? "mdi:shield-alert-outline" : "mdi:send-outline"} size={16} />
          {needsApproval ? "Salvar e solicitar aprovação" : "Salvar e enviar"}
        </Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 font-semicond text-[11.5px] text-muted-foreground">
        <Icon icon="mdi:whatsapp" size={13} />
        {needsApproval
          ? "segue como rascunho até o gestor aprovar"
          : "envia por WhatsApp e e-mail com o orçamento"}
      </p>
    </div>
  );
}
