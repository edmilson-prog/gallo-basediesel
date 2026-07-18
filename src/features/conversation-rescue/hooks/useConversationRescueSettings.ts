import { useCallback, useEffect, useState } from "react";
import type { ID, IConversationRescueSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { DEFAULT_CONVERSATION_RESCUE_SETTINGS } from "../config/defaults";

export interface IUseConversationRescueSettingsResult {
  settings: IConversationRescueSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<IConversationRescueSettings>) => Promise<void>;
}

/** Read + write helper for `IPlatformSettings.conversationRescue` (spec 2026-07-17). */
export function useConversationRescueSettings(storeId: ID | null): IUseConversationRescueSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IConversationRescueSettings>(
    DEFAULT_CONVERSATION_RESCUE_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const platform = await provider.get(storeId);
      // Spread-merge so settings stored before newer fields existed (e.g.
      // maxClientWaitHours) still pick up their defaults.
      setSettings({ ...DEFAULT_CONVERSATION_RESCUE_SETTINGS, ...platform.conversationRescue });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, [provider, storeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<IConversationRescueSettings>) => {
      if (!storeId) return;
      setSaving(true);
      const before = settings;
      const next: IConversationRescueSettings = { ...settings, ...patch };
      try {
        await provider.update(storeId, { conversationRescue: next });
        setSettings(next);
        auditLog({
          action: "conversation_rescue_settings.update",
          resource: "settings",
          resourceId: storeId,
          before,
          after: next,
          storeId,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [provider, settings, storeId],
  );

  return { settings, loading, saving, error, reload, update };
}
