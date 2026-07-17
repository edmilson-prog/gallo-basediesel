import { useCallback, useEffect, useState } from "react";
import type { ID, IIdleAlertsSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { DEFAULT_IDLE_ALERTS_SETTINGS } from "../config/defaults";

export interface IUseIdleAlertsSettingsResult {
  settings: IIdleAlertsSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<IIdleAlertsSettings>) => Promise<void>;
}

/**
 * Read + write helper for `IPlatformSettings.idleAlerts` (spec 2026-07-16).
 * Same skeleton as `useManagerDashboardSettings` (PRD-014).
 *
 * Each `update` call writes an audit log entry capturing the before/after of
 * the patched fields. Reads default to {@link DEFAULT_IDLE_ALERTS_SETTINGS}
 * while loading, so callers can render without an extra guard.
 */
export function useIdleAlertsSettings(storeId: ID | null): IUseIdleAlertsSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IIdleAlertsSettings>(DEFAULT_IDLE_ALERTS_SETTINGS);
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
      setSettings(platform.idleAlerts ?? DEFAULT_IDLE_ALERTS_SETTINGS);
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
    async (patch: Partial<IIdleAlertsSettings>) => {
      if (!storeId) return;
      setSaving(true);
      const before = settings;
      const next: IIdleAlertsSettings = { ...settings, ...patch };
      try {
        await provider.update(storeId, { idleAlerts: next });
        setSettings(next);
        auditLog({
          action: "idle_alerts_settings.update",
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
