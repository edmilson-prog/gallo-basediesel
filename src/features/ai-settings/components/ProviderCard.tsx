import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setIntegrationSecret } from "@/features/admin-settings/api/integrationSecrets";
import {
  AI_PROVIDER_LABELS,
  AI_SUPPORTED_PROVIDERS,
  type IAiGenerationParams,
  type IAiProviderConfig,
} from "@/shared/types";
import { DEFAULT_PROVIDER_PARAMS, modelsAreStaticSeed } from "@/providers/data/engine/aiCatalog";
import { useAiProvider } from "@/providers/data";
import { ModelSelect } from "./ModelSelect";

const INITIALS: Record<string, string> = {
  anthropic: "AN",
  openai: "OA",
  openrouter: "OR",
  google: "GE",
};

/** Brand glyphs (Iconify simple-icons). Monochrome — tinted by the chip's text color. */
const PROVIDER_ICON: Record<string, string> = {
  anthropic: "simple-icons:anthropic",
  openai: "simple-icons:openai",
  openrouter: "simple-icons:openrouter",
  google: "simple-icons:googlegemini",
};

export function ProviderCard({
  config,
  canEditKey,
  keyHint,
  onChanged,
  onKeySaved,
}: {
  config: IAiProviderConfig;
  canEditKey: boolean;
  /** Last 4 chars of the stored key (from the Vault), for recognition only. */
  keyHint?: string | null;
  onChanged: () => void;
  /** Called after a key is saved, with the secret name and its last 4 chars. */
  onKeySaved?: (credentialsRef: string, last4: string) => void;
}) {
  const provider = useAiProvider();
  const [editingKey, setEditingKey] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);

  const configured = config.status === "configured";
  const supported = AI_SUPPORTED_PROVIDERS.includes(config.provider);
  const params = config.params ?? DEFAULT_PROVIDER_PARAMS;
  // Each input owns one field but we persist the whole params object — merge against a ref
  // so two quick field edits (before a reload lands) don't clobber each other.
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = config.params ?? DEFAULT_PROVIDER_PARAMS;
  }, [config.params]);

  const saveParams = async (patch: Partial<IAiGenerationParams>) => {
    const next = { ...paramsRef.current, ...patch };
    paramsRef.current = next;
    try {
      await provider.updateProviderConfig(config.provider, { params: next });
      // No onChanged() here on purpose: the inputs are uncontrolled and already show the
      // committed value, so we skip the full settings reload (which flashes the whole grid
      // to a skeleton). The persisted value is re-synced on the next reload / remount.
    } catch {
      toast.error("Falha ao salvar os parâmetros.");
    }
  };

  const [refreshing, setRefreshing] = useState(false);
  const didAutoFetch = useRef(false);

  const refreshModels = useCallback(
    async (silent = false) => {
      setRefreshing(true);
      try {
        const list = await provider.listProviderModels(config.provider);
        if (!silent) toast.success(`${list.length} modelos encontrados.`);
        onChanged();
      } catch (e) {
        if (!silent) {
          toast.error(
            e instanceof Error ? `Falha ao listar modelos: ${e.message}` : "Falha ao listar modelos.",
          );
        }
      } finally {
        setRefreshing(false);
      }
    },
    [provider, config.provider, onChanged],
  );

  useEffect(() => {
    if (didAutoFetch.current) return;
    if (!supported || !configured) return;
    if (config.modelsRefreshedAt) return;
    if (!modelsAreStaticSeed(config.provider, config.models)) return;
    didAutoFetch.current = true;
    void refreshModels(true); // silent first-time fetch
  }, [supported, configured, config.provider, config.modelsRefreshedAt, config.models, refreshModels]);

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
      onKeySaved?.(config.credentialsRef, keyValue.trim().slice(-4));
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
    try {
      await provider.updateProviderConfig(config.provider, { defaultModel: model });
      onChanged();
    } catch {
      toast.error("Falha ao atualizar o modelo padrão.");
    }
  };

  return (
    <section
      className={`rounded-xl border border-border bg-card p-4 ${configured ? "" : "opacity-80"}`}
    >
      <header className="mb-3 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {PROVIDER_ICON[config.provider] ? (
            <Icon icon={PROVIDER_ICON[config.provider]!} className="size-5" />
          ) : (
            <span className="text-xs font-semibold">{INITIALS[config.provider]}</span>
          )}
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
            <div className="flex flex-wrap items-center gap-2">
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
              {configured && keyHint && (
                <code className="font-mono text-xs text-muted-foreground" title="Chave atual">
                  ••••{keyHint}
                </code>
              )}
            </div>
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

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Parâmetros de geração</label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted-foreground">
              Temperatura
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                defaultValue={params.temperature}
                disabled={!supported}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) void saveParams({ temperature: Math.min(2, Math.max(0, v)) });
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Máx. tokens
              <input
                type="number"
                step="64"
                min="1"
                defaultValue={params.maxTokens}
                disabled={!supported}
                onBlur={(e) => {
                  const v = Math.floor(Number(e.target.value));
                  if (Number.isFinite(v) && v > 0) void saveParams({ maxTokens: v });
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Top P
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                placeholder="—"
                defaultValue={params.topP ?? ""}
                disabled={!supported}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") {
                    void saveParams({ topP: undefined });
                    return;
                  }
                  const v = Number(raw);
                  if (Number.isFinite(v)) void saveParams({ topP: Math.min(1, Math.max(0, v)) });
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Padrão de geração deste provedor (usado no Playground; cada funcionalidade pode sobrepor).
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
