// src/features/quick-send/hooks/useSendProductCard.ts
import { useCallback } from "react";
import { toast } from "sonner";
import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { encodeProductCard, type IProductCardSnapshot } from "../engine/productCardPayload";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

/** Stock label + severity token derived from availability vs minimum (D-7). */
function stockOf(part: IPart): { label: string; severity: IProductCardSnapshot["stockSeverity"] } {
  if (part.stockAvailable <= 0) {
    return { label: QUICK_SEND_STRINGS.productCard.stockCritical, severity: "critical" };
  }
  if (part.stockAvailable <= part.stockMinimum) {
    return { label: QUICK_SEND_STRINGS.productCard.stockWarning, severity: "warning" };
  }
  return { label: QUICK_SEND_STRINGS.productCard.stockOk, severity: "ok" };
}

/** Build a point-in-time snapshot of a part for the product card bubble (RF-015). */
export function buildProductSnapshot(part: IPart): IProductCardSnapshot {
  const stock = stockOf(part);
  return {
    id: part.id,
    name: part.name,
    oem: part.oemCodes[0],
    equivalence: part.crossReferences?.[0]
      ? `${part.crossReferences[0].brand} ${part.crossReferences[0].code}`
      : undefined,
    stockLabel: stock.label,
    stockSeverity: stock.severity,
    price: part.unitPrice > 0 ? part.unitPrice : undefined,
    imageRef: part.imageUrl,
  };
}

export interface IUseSendProductCardResult {
  sendProductCard: (part: IPart, contextMessage?: string) => Promise<void>;
}

export function useSendProductCard(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseSendProductCardResult {
  const { send } = useMessageSend(conversation, whatsappAccount);

  const sendProductCard = useCallback(
    async (part: IPart, contextMessage?: string) => {
      try {
        const snapshot = buildProductSnapshot(part);
        const marker = encodeProductCard(snapshot);
        const context = (contextMessage ?? "").trim();
        // The card marker is the payload; an optional context note precedes it
        // as a separate plain message so the marker text stays parseable.
        if (context) {
          await send({ text: context });
        }
        await send({ text: marker });
      } catch {
        toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
      }
    },
    [send],
  );

  return { sendProductCard };
}
