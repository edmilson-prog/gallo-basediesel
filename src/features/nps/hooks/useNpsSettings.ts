import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentStore } from "@/features/multistore";
import { useNpsProvider } from "@/providers/data";
import type { INpsSettings } from "@/shared/types";
import { NPS_READING_DEFAULTS } from "../engine";

/**
 * The current store's survey configuration, with the table's defaults filled in.
 *
 * A store that has never been configured has no row, and the tabs still have to
 * render something coherent — so the absent row resolves to the same values the
 * DDL would have written. That way the screen never shows a blank where a
 * default is in force, which is the state in which someone "fixes" a setting
 * that was already correct.
 */

/** Mirrors the column defaults of 20260812140000_nps_schema.sql. */
export const NPS_SETTINGS_FALLBACK: Omit<INpsSettings, "storeId"> = {
  enabled: false,
  triggerConversationEnabled: true,
  triggerConversationDelayHours: 2,
  triggerOrderEnabled: false,
  triggerOrderDelayHours: 24,
  cooldownDays: 30,
  tokenExpiryDays: 7,
  windowDays: 90,
  samplingRate: 1,
  sendWindowStartHour: 9,
  sendWindowEndHour: 20,
  minResponsesForScore: 5,
  maxBackfillDays: 3,
  dailyCap: 50,
  whatsappAccountId: null,
  ...NPS_READING_DEFAULTS,
};

export function useNpsSettings() {
  const provider = useNpsProvider();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "";

  return useQuery<INpsSettings>({
    queryKey: ["nps", "settings", storeId],
    enabled: storeId.length > 0,
    queryFn: async () => {
      const loaded = await provider.getSettings(storeId);
      return loaded ?? { storeId, ...NPS_SETTINGS_FALLBACK };
    },
  });
}

export function useSaveNpsSettings() {
  const provider = useNpsProvider();
  const queryClient = useQueryClient();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "";

  return useMutation({
    mutationFn: (patch: Partial<INpsSettings>) => provider.updateSettings(storeId, patch),
    onSuccess: (saved) => {
      queryClient.setQueryData(["nps", "settings", storeId], saved);
      // The band cuts and the target change how every number on the panel is
      // labelled, so the metrics have to be re-read rather than re-labelled.
      void queryClient.invalidateQueries({ queryKey: ["nps", "metrics"] });
    },
  });
}
