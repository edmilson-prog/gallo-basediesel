import { useCallback, useEffect, useState } from "react";
import type { ID, IManagerDashboardSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { DEFAULT_MANAGER_DASHBOARD_SETTINGS } from "../config/defaults";

export interface IUseManagerDashboardSettingsResult {
  settings: IManagerDashboardSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<IManagerDashboardSettings>) => Promise<void>;
}

/**
 * Read + write helper for `IPlatformSettings.managerDashboard` (PRD-014).
 *
 * Each `update` call writes an audit log entry capturing the before/after of
 * the patched fields. Reads default to {@link DEFAULT_MANAGER_DASHBOARD_SETTINGS}
 * while loading, so callers can render without an extra guard.
 */
export function useManagerDashboardSettings(
  storeId: ID | null,
): IUseManagerDashboardSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IManagerDashboardSettings>(
    DEFAULT_MANAGER_DASHBOARD_SETTINGS,
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
      setSettings(platform.managerDashboard ?? DEFAULT_MANAGER_DASHBOARD_SETTINGS);
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
    async (patch: Partial<IManagerDashboardSettings>) => {
      if (!storeId) return;
      setSaving(true);
      const before = settings;
      const next: IManagerDashboardSettings = { ...settings, ...patch };
      try {
        await provider.update(storeId, { managerDashboard: next });
        setSettings(next);
        auditLog({
          action: "manager_dashboard_settings.update",
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
