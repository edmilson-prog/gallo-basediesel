import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiProvider } from "@/providers/data";
import type { AiProviderId, IAiPlaygroundResult } from "@/shared/types";
import { useAiSettings } from "../hooks/useAiSettings";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AiPlaygroundTab() {
  const { settings, loading } = useAiSettings();
  const provider = useAiProvider();
  const [providerId, setProviderId] = useState<AiProviderId>("anthropic");
  const [model, setModel] = useState("claude-opus-4-8");
  const [prompt, setPrompt] = useState(
    "Resuma em 3 bullets as últimas conversas do cliente e sugira a próxima ação.",
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IAiPlaygroundResult | null>(null);

  if (loading || !settings) return <Skeleton className="h-96 w-full" />;
  const models = settings.providers.find((p) => p.provider === providerId)?.models ?? [];

  const run = async () => {
    setBusy(true);
    try {
      setResult(
        await provider.runPlayground({
          providerId,
          model,
          params: { temperature: 0.4, maxTokens: 1024 },
          prompt,
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Provedor
          <select
            value={providerId}
            onChange={(e) => {
              const next = e.target.value as AiProviderId;
              setProviderId(next);
              const ms = settings.providers.find((p) => p.provider === next)?.models ?? [];
              setModel(ms[0]?.id ?? "");
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {settings.providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.provider}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Modelo
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {models.map((m) => (
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
        <Button onClick={run} disabled={busy}>
          <Icon icon="mdi:play" className="mr-1 size-4" />
          {busy ? "Executando…" : "Executar"}
        </Button>
      </div>

      {result && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Resposta</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
            {result.text}
          </pre>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              entrada <b className="text-foreground">{result.inputTokens}</b> tokens
            </span>
            <span>
              saída <b className="text-foreground">{result.outputTokens}</b> tokens
            </span>
            <span>
              custo <b className="text-foreground">{brl.format(result.costBRL)}</b>
            </span>
            <span>
              latência <b className="text-foreground">{(result.latencyMs / 1000).toFixed(1)}s</b>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
