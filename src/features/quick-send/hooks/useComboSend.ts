import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IAssetLibraryItem, IConversation, IWhatsAppAccount } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { planComboSend } from "../engine/comboSend";
import { useSendAsset } from "./useSendAsset";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IUseComboSendResult {
  sendCombo: (items: IAssetLibraryItem[], contextMessage?: string) => Promise<void>;
  progress: { sent: number; total: number } | undefined;
  isSending: boolean;
}

/**
 * Sequential combo fan-out (D-10). Uses planComboSend to drop unpublished /
 * no-permission / sensitive-blocked items (with a toast), then sends the
 * sendable ids one by one. A single send failure is counted but never aborts
 * the rest (partial-failure tolerance, RF-022).
 */
export function useComboSend(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseComboSendResult {
  const { userRole } = useAuth();
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  const [progress, setProgress] = useState<{ sent: number; total: number } | undefined>(undefined);

  const sendCombo = useCallback(
    async (items: IAssetLibraryItem[], contextMessage?: string) => {
      const viewer = userRole ? { role: userRole } : null;
      const plan = planComboSend(items, viewer);
      const byId = new Map(items.map((i) => [i.id, i]));

      // Announce skipped items up front (each with its reason).
      for (const skip of plan.skipped) {
        const item = byId.get(skip.assetId);
        toast.warning(QUICK_SEND_STRINGS.combo.itemSkipped(item?.title ?? skip.assetId));
      }

      const total = plan.sendable.length;
      if (total === 0) {
        if (plan.skipped.length > 0) {
          toast.error(QUICK_SEND_STRINGS.combo.partialDone(0, plan.skipped.length));
        }
        return;
      }

      let sent = 0;
      let failed = 0;
      setProgress({ sent: 0, total });
      for (const assetId of plan.sendable) {
        const item = byId.get(assetId);
        if (!item) {
          failed += 1;
          continue;
        }
        try {
          // Only the first item carries the context message to avoid spamming it.
          await sendAsset(item, sent === 0 ? contextMessage : undefined);
          sent += 1;
        } catch {
          failed += 1;
        } finally {
          setProgress({ sent: sent + failed, total });
        }
      }
      setProgress(undefined);
      toast.success(QUICK_SEND_STRINGS.combo.partialDone(sent, plan.skipped.length + failed));
    },
    [userRole, sendAsset],
  );

  return { sendCombo, progress, isSending: progress !== undefined };
}
