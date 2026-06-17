import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiProvider } from "@/providers/data";
import { AI_PROVIDER_LABELS, type AiProviderId, type IAiPlaygroundResult } from "@/shared/types";
import { useAiSettings } from "../hooks/useAiSettings";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AiPlaygroundTab() {
  const { settings, loading } = useAiSettings();
  const provider = useAiProvider();
  const [providerId, setProviderId] = useState<AiProviderId | null>(null);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("Explique em 3 bullets como funciona um turbo de motor diesel.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IAiPlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only configured providers can actually be called.
  const configured = useMemo(
    () => (settings?.providers ?? []).filter((p) => p.status === "configured"),
    [settings],
  );

  if (loading || !settings) return <Skeleton className="h-96 w-full" />;

  if (configured.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <Icon icon="mdi:key-alert-outline" className="mx-auto mb-2 size-6" />
        Nenhum provedor configurado. Defina uma chave de API em <b>Provedores &amp; chaves</b> e
        teste a conexão para liberar o Playground.
      </Card>
    );
  }

  const effectiveProviderId = providerId ?? configured[0]!.provider;
  const providerModels = configured.find((p) => p.provider === effectiveProviderId)?.models ?? [];
  const effectiveModel = model || providerModels[0]?.id || "";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await provider.runPlayground({
          providerId: effectiveProviderId,
          model: effectiveModel,
          params: { temperature: 0.4, maxTokens: 1024 },
          prompt,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao executar.");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-severity-warning/40 bg-severity-warning/10 p-3 text-xs text-severity-warning">
        <Icon icon="mdi:shield-alert-outline" className="mt-0.5 size-4 shrink-0" />
        <p>
          O conteúdo enviado é processado pelo provedor externo selecionado. Não cole dados
          sensíveis de clientes (LGPD). Evite o OpenRouter para dados pessoais — ele repassa a
          terceiros.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Provedor
          <select
            value={effectiveProviderId}
            onChange={(e) => {
              const next = e.target.value as AiProviderId;
              setProviderId(next);
              const ms = configured.find((p) => p.provider === next)?.models ?? [];
              setModel(ms[0]?.id ?? "");
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {configured.map((p) => (
              <option key={p.provider} value={p.provider}>
                {AI_PROVIDER_LABELS[p.provider]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Modelo
          <select
            value={effectiveModel}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {providerModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="flex justify-end">
        <Button onClick={run} disabled={busy || !effectiveModel}>
          <Icon icon="mdi:play" className="mr-1 size-4" />
          {busy ? "Executando…" : "Executar"}
        </Button>
      </div>

      {error && <p className="text-sm text-severity-critical">{error}</p>}

      {result && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Resposta</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
            {result.text}
          </pre>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>entrada <b className="text-foreground">{result.inputTokens}</b> tokens</span>
            <span>saída <b className="text-foreground">{result.outputTokens}</b> tokens</span>
            <span>custo <b className="text-foreground">{brl.format(result.costBRL)}</b></span>
            <span>latência <b className="text-foreground">{(result.latencyMs / 1000).toFixed(1)}s</b></span>
          </div>
        </Card>
      )}
    </div>
  );
}
