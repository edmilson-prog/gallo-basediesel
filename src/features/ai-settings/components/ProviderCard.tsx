import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setIntegrationSecret } from "@/features/admin-settings/api/integrationSecrets";
import { AI_PROVIDER_LABELS, AI_SUPPORTED_PROVIDERS, type IAiProviderConfig } from "@/shared/types";
import { modelsAreStaticSeed } from "@/providers/data/engine/aiCatalog";
import { useAiProvider } from "@/providers/data";
import { ModelSelect } from "./ModelSelect";

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
  const supported = AI_SUPPORTED_PROVIDERS.includes(config.provider);

  const [refreshing, setRefreshing] = useState(false);
  const didAutoFetch = useRef(false);

  const refreshModels = async (silent = false) => {
    setRefreshing(true);
    try {
      const list = await provider.listProviderModels(config.provider);
      if (!silent) toast.success(`${list.length} modelos encontrados.`);
      onChanged();
    } catch (e) {
      if (!silent) {
        toast.error(e instanceof Error ? `Falha ao listar modelos: ${e.message}` : "Falha ao listar modelos.");
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (didAutoFetch.current) return;
    if (!supported || !configured) return;
    if (config.modelsRefreshedAt) return;
    if (!modelsAreStaticSeed(config.provider, config.models)) return;
    didAutoFetch.current = true;
    void refreshModels(true); // silent first-time fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, configured, config.provider, config.modelsRefreshedAt]);

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
        {!supported ? (
          <Badge variant="outline" className="text-muted-foreground">
            Adaptador em breve
          </Badge>
        ) : configured ? (
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
              disabled={!canEditKey || !supported}
              onClick={() => {
                if (supported) setEditingKey(true);
              }}
            >
              <Icon icon="mdi:key-plus" className="mr-1 size-4" />
              {configured ? "Substituir chave" : "Definir chave"}
            </Button>
          )}
          {!supported && (
            <p className="mt-1 text-xs text-muted-foreground">
              Sem adaptador disponível nesta versão.
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs text-muted-foreground">Modelo padrão</label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              disabled={!supported || !configured || refreshing}
              onClick={() => refreshModels(false)}
            >
              <Icon
                icon="mdi:refresh"
                className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Atualizar modelos
            </Button>
          </div>
          <ModelSelect
            models={config.models}
            value={config.defaultModel}
            onChange={setModel}
            disabled={!supported}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {config.models.length} modelos
            {config.modelsRefreshedAt
              ? ` · atualizado ${new Date(config.modelsRefreshedAt).toLocaleString("pt-BR")}`
              : ""}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={test} disabled={busy || !supported}>
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
