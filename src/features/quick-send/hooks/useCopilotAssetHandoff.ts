import { useCallback } from "react";
import type { AssetCategory } from "@/shared/types";
import { useQuickSendBus } from "./useQuickSendBus";

export interface ICopilotAssetSuggestion {
  category?: AssetCategory;
  query?: string;
  brand?: string;
}

export interface IUseCopilotAssetHandoffResult {
  /**
   * RECEIVER for the deferred Copilot chip (PRD-025). When the chip is wired,
   * it calls this with a suggestion and the AssetPicker opens pre-filtered.
   * Until then this is exercised only by tests / manual triggers (D-14).
   */
  handoff: (suggestion: ICopilotAssetSuggestion) => void;
}

/**
 * Copilot → QuickSend handoff receiver (D-14). Thin adapter over the QuickSend
 * bus so the Copilot integration (PRD-025, still ⏳) can open the AssetPicker
 * pre-filtered without knowing the picker internals. The SENDER (the Copilot
 * chip) is intentionally NOT built here — only the receiver extension point.
 */
export function useCopilotAssetHandoff(): IUseCopilotAssetHandoffResult {
  const { openAssetPicker } = useQuickSendBus();
  const handoff = useCallback(
    (suggestion: ICopilotAssetSuggestion) => {
      openAssetPicker({
        category: suggestion.category,
        query: suggestion.query,
        brand: suggestion.brand,
      });
    },
    [openAssetPicker],
  );
  return { handoff };
}
