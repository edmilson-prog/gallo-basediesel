import { useCallback, useEffect, useState } from "react";
import { useAiProvider } from "@/providers/data";
import type { IAiSettings } from "@/shared/types";

export function useAiSettings() {
  const provider = useAiProvider();
  const [settings, setSettings] = useState<IAiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await provider.getSettings());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar configurações de IA.");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, setSettings, loading, error, reload, provider };
}
