import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import type { ICopilotPanelState } from "../hooks/useCopilotPanel";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotSummary } from "./CopilotSummary";
import { CopilotSuggestionItem } from "./CopilotSuggestionItem";
import { CopilotReply } from "./CopilotReply";

export function CopilotFicheTab({
  panel,
  conversationId,
  onInsertReply,
}: {
  panel: ICopilotPanelState;
  conversationId: ID;
  onInsertReply: (text: string) => void;
}) {
  const { summary, suggestions, dismiss, loading, error, settings } = panel;
  if (loading) return <p className="text-sm text-muted-foreground">{COPILOT_STRINGS.loading}</p>;
  if (error) return <p className="text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</p>;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Icon icon="mdi:robot-outline" size={15} />
        </span>
        <span className="text-sm font-bold text-primary">{COPILOT_STRINGS.title}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          <Icon icon="mdi:lock-outline" size={12} />
          {COPILOT_STRINGS.privacy}
        </span>
      </div>
      {settings.showSummary && summary && (
        <div className="mb-3.5">
          <CopilotSummary summary={summary} />
        </div>
      )}
      {settings.showSuggestions ? (
        suggestions.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {suggestions.map((s) => (
              <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</p>
        )
      ) : null}
      {settings.showReplyButton && (
        <CopilotReply conversationId={conversationId} onInsert={onInsertReply} />
      )}
    </div>
  );
}
