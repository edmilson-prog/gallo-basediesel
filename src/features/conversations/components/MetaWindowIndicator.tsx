import type { IConversation, IWhatsAppAccount } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRemaining, useMetaWindow } from "../hooks/useMetaWindow";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export interface IMetaWindowIndicatorProps {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  /**
   * Closed-window CTA (PRD-117 RF-021): opens the template picker directly
   * from the banner, sparing the seller the bounce on the send button.
   */
  onSelectTemplate?: () => void;
}

export function MetaWindowIndicator({
  conversation,
  whatsappAccount,
  onSelectTemplate,
}: IMetaWindowIndicatorProps) {
  const window = useMetaWindow(conversation, whatsappAccount);
  if (!window.applicable) return null;

  const { hours, minutes } = formatRemaining(window.msRemaining);

  let icon = "mdi:clock-outline";
  let tone = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  let text: string = CONVERSATION_STRINGS.windowOpen(hours);
  let suggestion: string | null = null;

  if (window.state === "open-soon") {
    icon = "mdi:clock-alert-outline";
    tone = "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30";
    text = CONVERSATION_STRINGS.windowOpen(hours);
    suggestion = CONVERSATION_STRINGS.windowSuggestTemplate;
  } else if (window.state === "open-closing") {
    icon = "mdi:clock-time-eight-outline";
    tone = "bg-destructive/10 text-destructive border-destructive/30";
    text = CONVERSATION_STRINGS.windowClosing(hours * 60 + minutes);
    suggestion = CONVERSATION_STRINGS.windowSuggestTemplate;
  } else if (window.state === "closed") {
    icon = "mdi:lock-clock";
    tone = "bg-muted text-muted-foreground border-border";
    text = CONVERSATION_STRINGS.windowClosed;
  }

  const showTemplateCta =
    window.state === "closed" &&
    !!onSelectTemplate &&
    (whatsappAccount?.capabilities.supportsTemplatesHsm ?? false);

  return (
    <div
      role="status"
      className={cn("flex items-center gap-2 border-t border-b px-4 py-1.5 text-[12px]", tone)}
    >
      <Icon icon={icon} size={14} />
      <span className="font-medium">{text}</span>
      {suggestion && <span className="text-[11px] opacity-80">· {suggestion}</span>}
      {showTemplateCta && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-6 shrink-0 gap-1 px-2 text-[11px]"
          onClick={onSelectTemplate}
        >
          <Icon icon="mdi:certificate-outline" size={12} />
          {CONVERSATION_STRINGS.windowSelectTemplate}
        </Button>
      )}
    </div>
  );
}
