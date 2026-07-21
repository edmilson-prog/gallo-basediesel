import { toast } from "sonner";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { formatCNPJ, formatCPF } from "@/shared/utils/format";
import { decodePayment } from "@/providers/whatsapp/contentFormat";
import { BubbleChrome } from "./bubbleChrome";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

/** Pretty-print only the key types that have a canonical Brazilian mask; every
 *  other type (EMAIL/PHONE/EVP) is already readable as sent. */
function displayKey(key: string, keyType: string | undefined): string {
  if (keyType === "CNPJ") return formatCNPJ(key);
  if (keyType === "CPF") return formatCPF(key);
  return key;
}

/**
 * Bubble for a PIX key shared through WhatsApp's payment button. The payload
 * carries no amount (always zero on these static-key shares), so the card
 * deliberately shows only who receives and the key itself.
 */
export function PaymentBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const { merchant, key, keyType } = decodePayment(message.text);

  async function handleCopy() {
    if (!key) return;
    // The RAW key is what a banking app accepts — never the masked form.
    await navigator.clipboard.writeText(key);
    toast.success(CONVERSATION_STRINGS.payment.copied);
  }

  return (
    <BubbleChrome message={message} onRetry={onRetry}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon icon="mdi:qrcode" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {CONVERSATION_STRINGS.payment.label}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {merchant || CONVERSATION_STRINGS.payment.label}
          </p>
          {key ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {displayKey(key, keyType)}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Icon icon="mdi:content-copy" size={13} />
                {CONVERSATION_STRINGS.payment.copy}
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {CONVERSATION_STRINGS.payment.noKey}
            </p>
          )}
        </div>
      </div>
    </BubbleChrome>
  );
}
