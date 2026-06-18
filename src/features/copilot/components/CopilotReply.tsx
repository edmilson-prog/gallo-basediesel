import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { useCopilotReply } from "../hooks/useCopilotReply";

export interface ICopilotReplyProps {
  conversationId: ID;
  onInsert: (text: string) => void;
}

export function CopilotReply({ conversationId, onInsert }: ICopilotReplyProps) {
  const { enabled, generating, reply, error, generate } = useCopilotReply(conversationId);
  if (!enabled) return null;

  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      {reply && (
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
      )}
      <button
        type="button"
        onClick={generate}
        disabled={generating}
        className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon
          icon={generating ? "mdi:loading" : "mdi:auto-fix"}
          size={14}
          className={generating ? "animate-spin" : undefined}
        />
        {generating
          ? COPILOT_STRINGS.generatingReply
          : reply
            ? COPILOT_STRINGS.regenerateReply
            : COPILOT_STRINGS.generateReply}
      </button>
      {error && <p className="mt-1.5 text-[11px] text-severity-critical">{error}</p>}
    </div>
  );
}
