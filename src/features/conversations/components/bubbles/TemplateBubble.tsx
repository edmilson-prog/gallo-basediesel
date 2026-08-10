import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { BubbleChrome, type IBubbleProps } from "./bubbleChrome";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const TEMPLATE_PREFIX_REGEX = /^\[template\]\s*/i;
const QUICK_REPLY_PREFIX = "\n[botões]";

interface IParsed {
  body: string;
  quickReplies: string[];
}

function parseTemplate(text: string): IParsed {
  const stripped = text.replace(TEMPLATE_PREFIX_REGEX, "");
  const idx = stripped.indexOf(QUICK_REPLY_PREFIX);
  if (idx === -1) return { body: stripped, quickReplies: [] };
  const body = stripped.slice(0, idx).trim();
  const raw = stripped.slice(idx + QUICK_REPLY_PREFIX.length);
  const quickReplies = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  return { body, quickReplies };
}

export function TemplateBubble({ message, onRetry, ...extras }: IBubbleProps) {
  const parsed = parseTemplate(message.text);
  return (
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon icon="mdi:certificate-outline" size={12} />
        <span>{CONVERSATION_STRINGS.templateBadge}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{parsed.body}</p>
      {parsed.quickReplies.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {parsed.quickReplies.map((qr) => (
            <span
              key={qr}
              className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground"
            >
              {qr}
            </span>
          ))}
        </div>
      )}
    </BubbleChrome>
  );
}
