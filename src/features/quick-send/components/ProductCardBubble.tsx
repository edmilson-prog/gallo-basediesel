// src/features/quick-send/components/ProductCardBubble.tsx
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { BubbleChrome } from "@/features/conversations/components/bubbles/bubbleChrome";
import { TextBubble } from "@/features/conversations/components/bubbles/TextBubble";
import { decodeProductCard, priceLabel, hasImage } from "../engine/productCardPayload";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IProductCardBubbleProps {
  message: IMessage;
  onRetry?: () => void;
}

const SEVERITY_CLASS: Record<"ok" | "warning" | "critical", string> = {
  ok: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};

/** Rich product card bubble; degrades gracefully and falls back to text on parse fail (D-7). */
export function ProductCardBubble({ message, onRetry }: IProductCardBubbleProps) {
  const snapshot = decodeProductCard(message.text);
  if (!snapshot) {
    // Parse failed → degrade to a plain text bubble (RNF / risk mitigation §10).
    return <TextBubble message={message} onRetry={onRetry} />;
  }

  return (
    <BubbleChrome message={message} onRetry={onRetry} unpadded>
      <div className="w-64">
        <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
          {hasImage(snapshot) ? (
            <img
              src={snapshot.imageRef}
              alt={snapshot.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <Icon icon="mdi:cog-outline" size={36} />
          )}
        </div>
        <div className="space-y-1 px-3 py-2">
          <p className="text-sm font-semibold leading-tight text-foreground">{snapshot.name}</p>
          {snapshot.oem && (
            <p className="text-[11px] text-muted-foreground">OEM {snapshot.oem}</p>
          )}
          {snapshot.equivalence && (
            <p className="text-[11px] text-muted-foreground">≈ {snapshot.equivalence}</p>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold text-foreground">{priceLabel(snapshot)}</span>
            <span className={cn("text-[11px] font-medium", SEVERITY_CLASS[snapshot.stockSeverity])}>
              {snapshot.stockLabel}
            </span>
          </div>
          <p className="pt-0.5 text-[10px] text-muted-foreground">
            {QUICK_SEND_STRINGS.productCard.cardFooter}
          </p>
        </div>
      </div>
    </BubbleChrome>
  );
}
