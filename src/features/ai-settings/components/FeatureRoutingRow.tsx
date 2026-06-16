import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AI_FEATURE_LABELS,
  AI_PROVIDER_LABELS,
  type AiProviderId,
  type IAiFeatureRouting,
  type IAiProviderConfig,
} from "@/shared/types";
import { useAiProvider } from "@/providers/data";

export function FeatureRoutingRow({
  route,
  providers,
  onChanged,
}: {
  route: IAiFeatureRouting;
  providers: IAiProviderConfig[];
  onChanged: () => void;
}) {
  const provider = useAiProvider();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(route.systemPrompt);
  const modelsOf = (id: AiProviderId) => providers.find((p) => p.provider === id)?.models ?? [];

  const patch = async (p: Partial<IAiFeatureRouting>) => {
    try {
      await provider.updateFeatureRouting(route.feature, p);
      onChanged();
    } catch {
      toast.error("Falha ao atualizar a funcionalidade.");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon icon="mdi:robot-outline" className="size-5" />
        </span>
        <p className="flex-1 text-sm font-semibold">{AI_FEATURE_LABELS[route.feature]}</p>
        <select
          value={route.providerId}
          onChange={(e) => patch({ providerId: e.target.value as AiProviderId })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          {providers.map((p) => (
            <option key={p.provider} value={p.provider}>
              {AI_PROVIDER_LABELS[p.provider]}
            </option>
          ))}
        </select>
        <select
          value={route.model}
          onChange={(e) => patch({ model: e.target.value })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          {modelsOf(route.providerId).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <Switch
          checked={route.enabled}
          onCheckedChange={(v) => patch({ enabled: v })}
          aria-label={`Ativar ${AI_FEATURE_LABELS[route.feature]}`}
        />
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          <Icon icon={open ? "mdi:chevron-up" : "mdi:chevron-down"} className="size-4" />
        </Button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">
              Fallback — provedor
              <select
                value={route.fallbackProviderId ?? ""}
                onChange={(e) =>
                  patch({ fallbackProviderId: (e.target.value || undefined) as AiProviderId | undefined })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">Nenhum</option>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {AI_PROVIDER_LABELS[p.provider]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Temperatura
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                defaultValue={route.params.temperature}
                onBlur={(e) => patch({ params: { ...route.params, temperature: Number(e.target.value) } })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
          <label className="text-xs text-muted-foreground">
            Prompt de sistema
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={() => patch({ systemPrompt: prompt })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>
      )}
    </div>
  );
}
