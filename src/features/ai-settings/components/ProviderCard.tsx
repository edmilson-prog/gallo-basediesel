import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setIntegrationSecret } from "@/features/admin-settings/api/integrationSecrets";
import { AI_PROVIDER_LABELS, type IAiProviderConfig } from "@/shared/types";
import { useAiProvider } from "@/providers/data";

const INITIALS: Record<string, string> = {
  anthropic: "AN",
  openai: "OA",
  openrouter: "OR",
  google: "GE",
};

export function ProviderCard({
  config,
  canEditKey,
  onChanged,
}: {
  config: IAiProviderConfig;
  canEditKey: boolean;
  onChanged: () => void;
}) {
  const provider = useAiProvider();
  const [editingKey, setEditingKey] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);

  const configured = config.status === "configured";

  const saveKey = async () => {
    if (!keyValue.trim()) {
      toast.error("Informe a chave.");
      return;
    }
    setBusy(true);
    try {
      await setIntegrationSecret(
        config.credentialsRef,
        keyValue.trim(),
        `${AI_PROVIDER_LABELS[config.provider]} — Chave da API`,
      );
      await provider.updateProviderConfig(config.provider, { status: "configured", enabled: true });
      toast.success("Chave salva com segurança.");
      setEditingKey(false);
      setKeyValue("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar a chave.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await provider.testConnection(config.provider);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const setModel = async (model: string) => {
    await provider.updateProviderConfig(config.provider, { defaultModel: model });
    onChanged();
  };

  return (
    <section
      className={`rounded-xl border border-border bg-card p-4 ${configured ? "" : "opacity-80"}`}
    >
      <header className="mb-3 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">
          {INITIALS[config.provider]}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{AI_PROVIDER_LABELS[config.provider]}</p>
          <p className="text-xs text-muted-foreground">{config.models.length} modelos</p>
        </div>
        {configured ? (
          <Badge
            variant="outline"
            className="border-severity-success/40 bg-severity-success/10 text-severity-success"
          >
            <Icon icon="mdi:check-circle-outline" className="mr-1 size-3" />
            Configurado
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Não configurado
          </Badge>
        )}
      </header>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Chave de API ({config.credentialsRef})
          </label>
          {editingKey ? (
            <div className="flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="Cole a chave"
                className="font-mono"
                disabled={busy}
              />
              <Button size="sm" onClick={saveKey} disabled={busy}>
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingKey(false);
                  setKeyValue("");
                }}
                disabled={busy}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={!canEditKey}
              onClick={() => setEditingKey(true)}
            >
              <Icon icon="mdi:key-plus" className="mr-1 size-4" />
              {configured ? "Substituir chave" : "Definir chave"}
            </Button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Modelo padrão</label>
          <select
            value={config.defaultModel}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {config.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — entrada ${m.inputPricePer1kUsd}/1k · saída ${m.outputPricePer1kUsd}/1k
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={test} disabled={busy}>
            <Icon icon="mdi:connection" className="mr-1 size-4" />
            Testar conexão
          </Button>
          <span className="text-xs text-muted-foreground">
            {config.lastTestedAt
              ? `Último teste: ${new Date(config.lastTestedAt).toLocaleString("pt-BR")}`
              : "Ainda não testado"}
          </span>
        </div>
      </div>
    </section>
  );
}
