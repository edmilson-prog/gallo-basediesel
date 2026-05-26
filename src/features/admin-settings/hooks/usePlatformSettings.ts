import { useCallback, useEffect, useState } from "react";
import type { ID, IPlatformSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";

export interface IUsePlatformSettingsResult {
  settings: IPlatformSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (
    patch: Partial<IPlatformSettings>,
    auditAction?: string,
  ) => Promise<IPlatformSettings | null>;
}

/**
 * Read + write helper for the whole `IPlatformSettings` of a store.
 *
 * Each `update` call writes an audit log entry capturing the before/after of
 * the patched top-level fields (PRD-006 + PRD-019 RF-010/020/030).
 */
export function usePlatformSettings(storeId: ID): IUsePlatformSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IPlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const platform = await provider.get(storeId);
      setSettings(platform);
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
    async (
      patch: Partial<IPlatformSettings>,
      auditAction = "settings.update",
    ): Promise<IPlatformSettings | null> => {
      if (!settings) return null;
      setSaving(true);
      const before: Partial<IPlatformSettings> = {};
      const after: Partial<IPlatformSettings> = {};
      for (const key of Object.keys(patch) as (keyof IPlatformSettings)[]) {
        (before as Record<string, unknown>)[key] = (settings as Record<string, unknown>)[key];
        (after as Record<string, unknown>)[key] = (patch as Record<string, unknown>)[key];
      }
      try {
        const next = await provider.update(storeId, patch);
        setSettings(next);
        auditLog({
          action: auditAction,
          resource: "settings",
          resourceId: storeId,
          before,
          after,
          storeId,
        });
        return next;
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
