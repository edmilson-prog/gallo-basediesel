import { toast } from "sonner";
import type { IMessage } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { decodeContact } from "@/providers/whatsapp/contentFormat";
import { BubbleChrome } from "./bubbleChrome";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

/**
 * Bubble for a shared WhatsApp contact card. Name/phone are decoded from the
 * message `text` (canonical encoding in `@/providers/whatsapp/contentFormat`).
 * The phone, when present, can be copied to the clipboard. A contact carries no
 * binary media, so nothing is signed or downloaded here.
 */
export function ContactBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const { name, phone } = decodeContact(message.text);

  const copy = () => {
    if (!phone) return;
    void navigator.clipboard
      ?.writeText(phone)
      .then(() => toast.success(CONVERSATION_STRINGS.contact.copied))
      .catch(() => undefined);
  };

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon icon="mdi:account" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {CONVERSATION_STRINGS.contact.label}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {name || phone || CONVERSATION_STRINGS.contact.noPhone}
          </p>
          {phone && name && <p className="truncate text-xs text-muted-foreground">{phone}</p>}
          {phone && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 gap-1 px-2 text-xs text-primary hover:bg-primary/10"
              onClick={copy}
            >
              <Icon icon="mdi:content-copy" size={13} />
              {CONVERSATION_STRINGS.contact.copyNumber}
            </Button>
          )}
        </div>
      </div>
    </BubbleChrome>
  );
}
