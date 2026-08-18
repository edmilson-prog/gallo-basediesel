import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { QuotedPreview } from "./bubbles/QuotedPreview";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import type { IReplyTarget } from "../hooks/useReplyDraft";

export interface IReplyComposerBarProps {
  target: IReplyTarget;
  contactName?: string;
  onCancel: () => void;
}

/** Faixa "Respondendo a …" acima do campo de texto, com cancelamento. */
export function ReplyComposerBar({ target, contactName, onCancel }: IReplyComposerBarProps) {
  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-2">
      <Icon icon="mdi:reply" size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
      {/* `min-w-0` é estrutural: sem ele a coluna trava no min-content e um
          texto longo empurra o botão de cancelar para fora da barra. */}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {CONVERSATION_STRINGS.reply.composerTitle}
        </p>
        <QuotedPreview reply={target.ref} contactName={contactName} variant="composer" />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        aria-label={CONVERSATION_STRINGS.reply.cancel}
        onClick={onCancel}
      >
        <Icon icon="mdi:close" size={14} />
      </Button>
    </div>
  );
}
