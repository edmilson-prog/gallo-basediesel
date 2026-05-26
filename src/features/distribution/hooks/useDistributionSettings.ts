import { useCallback, useEffect, useState } from "react";
import type { ID, IDistributionSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";

export interface IUseDistributionSettingsResult {
  settings: IDistributionSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<IDistributionSettings>) => Promise<void>;
}

/**
 * Read + write helper for `IPlatformSettings.distribution` (PRD-013).
 *
 * Each `update` call writes an audit log entry capturing the before/after of
 * the patched fields — see PRD-006 and PRD-013 RF-033.
 */
export function useDistributionSettings(storeId: ID): IUseDistributionSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IDistributionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const platform = await provider.get(storeId);
      setSettings(platform.distribution);
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
    async (patch: Partial<IDistributionSettings>) => {
      if (!settings) return;
      setSaving(true);
      const before = settings;
      const next = { ...settings, ...patch };
      try {
        await provider.update(storeId, { distribution: next });
        setSettings(next);
        auditLog({
          action: "distribution_settings.update",
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
