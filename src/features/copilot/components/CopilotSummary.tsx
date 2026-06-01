import type { ICopilotSummary } from "@/shared/types";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

export function CopilotSummary({ summary }: { summary: ICopilotSummary }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
        {COPILOT_STRINGS.summaryLabel}
      </div>
      {summary.text}
    </div>
  );
}
