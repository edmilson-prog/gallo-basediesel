import type { ICopilotSuggestion, CopilotSuggestionKind } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { COPILOT_STRINGS } from "../i18n/pt-BR";

const KIND_META: Record<
  CopilotSuggestionKind,
  { icon: string; chip: string; tone: string; label: string }
> = {
  alert: {
    icon: "mdi:alert-outline",
    chip: "bg-warning/15 text-warning",
    tone: "bg-warning/15 text-warning",
    label: COPILOT_STRINGS.toneLabels.alert,
  },
  action: {
    icon: "mdi:receipt-text-outline",
    chip: "bg-info/15 text-info",
    tone: "bg-info/15 text-info",
    label: COPILOT_STRINGS.toneLabels.action,
  },
  opportunity: {
    icon: "mdi:lightbulb-on-outline",
    chip: "bg-success/15 text-success",
    tone: "bg-success/15 text-success",
    label: COPILOT_STRINGS.toneLabels.opportunity,
  },
};

export interface ICopilotSuggestionItemProps {
  suggestion: ICopilotSuggestion;
  onDismiss?: (id: string) => void;
}

export function CopilotSuggestionItem({ suggestion, onDismiss }: ICopilotSuggestionItemProps) {
  const meta = KIND_META[suggestion.kind];
  return (
    <li className="group flex items-start gap-2.5 text-sm leading-relaxed">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
          meta.chip,
        )}
        aria-hidden="true"
      >
        <Icon icon={meta.icon} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground">{suggestion.title}</span>
        {suggestion.detail && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{suggestion.detail}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          meta.tone,
        )}
      >
        {meta.label}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(suggestion.id)}
          aria-label={COPILOT_STRINGS.dismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Icon icon="mdi:close" size={14} />
        </button>
      )}
    </li>
  );
}
