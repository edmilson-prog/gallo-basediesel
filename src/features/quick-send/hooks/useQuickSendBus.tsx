// src/features/quick-send/hooks/useQuickSendBus.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AssetCategory, ID, IAssetLibraryItem } from "@/shared/types";

/** A pre-filter request the Copilot chip (deferred) can push to open the picker. */
export interface IPickerRequest {
  category?: AssetCategory;
  query?: string;
  brand?: string;
}

interface IQuickSendBusValue {
  // --- Picker channel (D-14) ---
  openAssetPicker: (filter?: IPickerRequest) => void;
  pickerRequest: IPickerRequest | null;
  clearRequest: () => void;
  // --- Combo channel (D-10) — staged "Modo pacote" items, order preserved ---
  comboItems: IAssetLibraryItem[];
  addToCombo: (item: IAssetLibraryItem) => void;
  removeFromCombo: (id: ID) => void;
  reorderCombo: (assetIds: ID[]) => void;
  clearCombo: () => void;
}

const QuickSendBusContext = createContext<IQuickSendBusValue | null>(null);

/**
 * Pub/sub bus with two channels (CONTRACT §C):
 *  - picker channel (D-14): future producers (Copilot chip, PRD-025) open the
 *    AssetPicker pre-filtered; the consumer (ConversationPage) reads
 *    `pickerRequest` to open + seed the picker, then calls `clearRequest`.
 *  - combo channel (D-10): the "Modo pacote" multi-select staged items, so the
 *    AssetPicker (in MessageInput) feeds the ComboTray (in ConversationPage,
 *    Plan C) without prop-drilling. `addToCombo` dedups by id and preserves
 *    insertion order; `reorderCombo` reorders by id list.
 */
export function QuickSendBusProvider({ children }: { children: ReactNode }) {
  const [pickerRequest, setPickerRequest] = useState<IPickerRequest | null>(null);
  const [comboItems, setComboItems] = useState<IAssetLibraryItem[]>([]);

  const openAssetPicker = useCallback((filter?: IPickerRequest) => {
    setPickerRequest(filter ?? {});
  }, []);

  const clearRequest = useCallback(() => setPickerRequest(null), []);

  const addToCombo = useCallback((item: IAssetLibraryItem) => {
    setComboItems((prev) =>
      prev.some((i) => i.id === item.id) ? prev : [...prev, item],
    );
  }, []);

  const removeFromCombo = useCallback((id: ID) => {
    setComboItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const reorderCombo = useCallback((assetIds: ID[]) => {
    setComboItems((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      const next = assetIds
        .map((id) => byId.get(id))
        .filter((i): i is IAssetLibraryItem => i !== undefined);
      // Keep any items not referenced in the new order at the end (defensive).
      for (const item of prev) {
        if (!assetIds.includes(item.id)) next.push(item);
      }
      return next;
    });
  }, []);

  const clearCombo = useCallback(() => setComboItems([]), []);

  const value = useMemo<IQuickSendBusValue>(
    () => ({
      openAssetPicker,
      pickerRequest,
      clearRequest,
      comboItems,
      addToCombo,
      removeFromCombo,
      reorderCombo,
      clearCombo,
    }),
    [
      openAssetPicker,
      pickerRequest,
      clearRequest,
      comboItems,
      addToCombo,
      removeFromCombo,
      reorderCombo,
      clearCombo,
    ],
  );

  return <QuickSendBusContext.Provider value={value}>{children}</QuickSendBusContext.Provider>;
}

/**
 * Access the quick-send bus. Returns a no-op safe value when used outside the
 * provider so non-conversation surfaces don't crash.
 */
export function useQuickSendBus(): IQuickSendBusValue {
  const ctx = useContext(QuickSendBusContext);
  if (!ctx) {
    return {
      openAssetPicker: () => {},
      pickerRequest: null,
      clearRequest: () => {},
      comboItems: [],
      addToCombo: () => {},
      removeFromCombo: () => {},
      reorderCombo: () => {},
      clearCombo: () => {},
    };
  }
  return ctx;
}
