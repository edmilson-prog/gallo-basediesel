import { useCallback, useEffect, useState } from "react";
import type { ICopilotAssistantSettings, ID } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "../config/defaults";

export interface IUseCopilotAssistantSettingsResult {
  settings: ICopilotAssistantSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<ICopilotAssistantSettings>) => Promise<void>;
}

/**
 * Read + write helper for `IPlatformSettings.copilotAssistant` (spec 2026-07-22).
 * Same skeleton as `useIdleAlertsSettings`. Reads default to
 * {@link DEFAULT_COPILOT_ASSISTANT_SETTINGS} while loading, so the conversation
 * screen can mount the panel without an extra guard.
 */
export function useCopilotAssistantSettings(
  storeId: ID | null,
): IUseCopilotAssistantSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<ICopilotAssistantSettings>(
    DEFAULT_COPILOT_ASSISTANT_SETTINGS,
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
      setSettings(platform.copilotAssistant ?? DEFAULT_COPILOT_ASSISTANT_SETTINGS);
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
    async (patch: Partial<ICopilotAssistantSettings>) => {
      if (!storeId) return;
      setSaving(true);
      const before = settings;
      const next: ICopilotAssistantSettings = { ...settings, ...patch };
      try {
        await provider.update(storeId, { copilotAssistant: next });
        setSettings(next);
        auditLog({
          action: "copilot_assistant_settings.update",
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
