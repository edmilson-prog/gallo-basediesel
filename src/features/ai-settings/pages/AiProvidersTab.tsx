import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { listIntegrationSecrets } from "@/features/admin-settings/api/integrationSecrets";
import { getActiveDataSource } from "@/providers/data";
import { AI_PROVIDER_LABELS, type AiProviderId } from "@/shared/types";
import { useAiSettings } from "../hooks/useAiSettings";
import { ProviderCard } from "../components/ProviderCard";

export function AiProvidersTab() {
  const { settings, loading, reload, provider } = useAiSettings();
  const canEditKey = getActiveDataSource() === "supabase";

  // Last-4 hint per Vault secret name (credentialsRef), for recognition only.
  const [hintByRef, setHintByRef] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!canEditKey) return;
    let cancelled = false;
    listIntegrationSecrets()
      .then((list) => {
        if (cancelled) return;
        const next = new Map<string, string>();
        for (const s of list) if (s.hint) next.set(s.name, s.hint);
        setHintByRef(next);
      })
      .catch(() => {
        /* the key preview is best-effort; never block the screen on it */
      });
    return () => {
      cancelled = true;
    };
  }, [canEditKey]);

  if (loading || !settings) return <Skeleton className="h-96 w-full" />;

  const setDefault = async (id: AiProviderId) => {
    try {
      await provider.setDefaultProvider(id);
      await reload();
      toast.success("Provedor padrão atualizado.");
    } catch {
      toast.error("Falha ao atualizar o provedor padrão.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">Provedor padrão</p>
          <p className="text-xs text-muted-foreground">
            Usado quando a funcionalidade não especifica outro.
          </p>
        </div>
        <select
          value={settings.defaultProviderId}
          onChange={(e) => setDefault(e.target.value as AiProviderId)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {settings.providers
            .filter((p) => p.status === "configured")
            .map((p) => (
              <option key={p.provider} value={p.provider}>
                {AI_PROVIDER_LABELS[p.provider]}
              </option>
            ))}
        </select>
      </div>
      {!canEditKey && (
        <div className="flex items-start gap-3 rounded-lg border border-severity-warning/40 bg-severity-warning/10 p-4 text-sm text-severity-warning">
          <Icon icon="mdi:information-outline" className="mt-0.5 size-4 shrink-0" />
          <p>Modo demonstração: a gravação de chaves fica disponível no modo Supabase.</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {settings.providers.map((p) => (
          <ProviderCard
            key={p.provider}
            config={p}
            canEditKey={canEditKey}
            keyHint={hintByRef.get(p.credentialsRef) ?? null}
            onChanged={reload}
            onKeySaved={(ref, last4) =>
              setHintByRef((prev) => new Map(prev).set(ref, last4))
            }
          />
        ))}
      </div>
    </div>
  );
}
