import { Icon } from "@/components/Icon";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

export interface ICopilotReplyProps {
  reply: string;
  onInsert: (text: string) => void;
}

export function CopilotReply({ reply, onInsert }: ICopilotReplyProps) {
  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {COPILOT_STRINGS.replyLabel}
        </span>
        <span className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground">
          {reply}
        </span>
        <button
          type="button"
          onClick={() => onInsert(reply)}
          className="shrink-0 cursor-pointer rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          {COPILOT_STRINGS.replyInsert} ↑
        </button>
      </div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="mt-2.5 inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"
      >
        <Icon icon="mdi:auto-fix" size={14} />
        {COPILOT_STRINGS.generateReply}
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
          {COPILOT_STRINGS.generateReplySoon}
        </span>
      </button>
    </div>
  );
}
