import { toast } from "sonner";
import type { IMessage } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { decodeContact } from "@/providers/whatsapp/contentFormat";
import { BubbleChrome } from "./bubbleChrome";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

/** Up to 2 uppercase initials from the contact's first two name words, for the avatar fallback. */
function initialsFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  return initials || undefined;
}

/**
 * Bubble for a shared WhatsApp contact card. Name/phone are decoded from the
 * message `text` (canonical encoding in `@/providers/whatsapp/contentFormat`).
 * The phone, when present, can be copied to the clipboard. A contact carries no
 * binary media, so nothing is signed or downloaded here.
 *
 * Fixed-width content (independent of the shared `max-w-[78%]` chrome) so two
 * contact cards side by side render at the same size regardless of name length.
 */
export function ContactBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const { name, phone } = decodeContact(message.text);
  const initials = initialsFromName(name);

  const copy = () => {
    if (!phone) return;
    void navigator.clipboard
      ?.writeText(phone)
      .then(() => toast.success(CONVERSATION_STRINGS.contact.copied))
      .catch(() => undefined);
  };

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="w-[236px] max-w-full">
        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          <Icon icon="mdi:card-account-phone-outline" size={12} />
          {CONVERSATION_STRINGS.contact.sharedLabel}
        </p>
        <div className="flex items-start gap-2.5">
          <div
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-1 ring-primary/25"
          >
            {initials ?? <Icon icon="mdi:account" size={20} />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="line-clamp-2 text-[13.5px] font-semibold text-foreground">
              {name || phone || CONVERSATION_STRINGS.contact.noPhone}
            </p>
            {phone && name && (
              <p className="mt-0.5 truncate text-[11.5px] tabular-nums text-muted-foreground">
                {phone}
              </p>
            )}
          </div>
        </div>
        {phone && (
          <Button
            variant="ghost"
            onClick={copy}
            aria-label={`${CONVERSATION_STRINGS.contact.copyNumber} ${phone}`}
            className="mt-2.5 h-9 w-full gap-1.5 border-t border-border px-2 pt-2.5 text-[12.5px] font-medium text-foreground hover:bg-primary/10 hover:text-foreground"
          >
            <Icon icon="mdi:content-copy" size={14} className="text-primary" />
            {CONVERSATION_STRINGS.contact.copyNumber}
          </Button>
        )}
      </div>
    </BubbleChrome>
  );
}
