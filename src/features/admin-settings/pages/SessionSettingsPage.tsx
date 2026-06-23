import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_SESSION_TIMEOUT, type ISessionTimeoutSettings } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { createBeeper, type IBeeper } from "@/features/session-timeout/lib/beep";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

export function SessionSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<ISessionTimeoutSettings>(DEFAULT_SESSION_TIMEOUT);
  // Lazy init: useRef evaluates its argument on every render, so passing
  // createBeeper() directly would allocate a throwaway beeper per render.
  const beeperRef = useRef<IBeeper | null>(null);
  if (!beeperRef.current) beeperRef.current = createBeeper();

  useEffect(() => {
    if (settings) setDraft(settings.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    const current = settings.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT;
    return JSON.stringify(current) !== JSON.stringify(draft);
  }, [settings, draft]);

  const patch = (p: Partial<ISessionTimeoutSettings>) => setDraft((d) => ({ ...d, ...p }));

  const handleSave = async () => {
    if (draft.warningSeconds >= draft.idleMinutes * 60) {
      toast.error("O aviso precisa ser menor que o tempo total de inatividade.");
      return;
    }
    try {
      await update({ sessionTimeout: draft }, "settings.session_timeout.update");
      await queryClient.invalidateQueries({ queryKey: ["settings", storeId] });
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handleReset = () => {
    if (settings) setDraft(settings.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT);
  };

  const testBeep = () => {
    beeperRef.current?.unlock();
    beeperRef.current?.beep(draft.soundVolume, 0.6);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Segurança da sessão"
          description="Encerramento automático por inatividade."
        />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Segurança da sessão"
        description="Encerra automaticamente a sessão de usuários internos após um período de inatividade, avisando antes com uma contagem regressiva e beeps. Não substitui a segurança do servidor — é uma política de estação."
      />

      <div className="space-y-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Ativar encerramento por inatividade</p>
            <p className="text-xs text-muted-foreground">
              Quando desligado, nenhuma sessão é encerrada por inatividade.
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
            aria-label="Ativar encerramento por inatividade"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="idle">Minutos de inatividade até encerrar</Label>
            <Input
              id="idle"
              type="number"
              min={1}
              max={480}
              value={draft.idleMinutes}
              onChange={(e) => patch({ idleMinutes: Number(e.target.value) })}
              disabled={!draft.enabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="warn">Segundos de aviso antes do logout</Label>
            <Input
              id="warn"
              type="number"
              min={10}
              max={300}
              value={draft.warningSeconds}
              onChange={(e) => patch({ warningSeconds: Number(e.target.value) })}
              disabled={!draft.enabled}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Emitir beeps no aviso</p>
            <p className="text-xs text-muted-foreground">
              Sons curtos que ficam mais frequentes conforme o tempo se esgota.
            </p>
          </div>
          <Switch
            checked={draft.soundEnabled}
            onCheckedChange={(v) => patch({ soundEnabled: v })}
            disabled={!draft.enabled}
            aria-label="Emitir beeps no aviso"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Intensidade do som</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testBeep}
              disabled={!draft.enabled || !draft.soundEnabled}
              className="gap-1"
            >
              <Icon icon="mdi:volume-high" size={14} />
              Testar beep
            </Button>
          </div>
          <Slider
            value={[draft.soundVolume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={(v) => patch({ soundVolume: v[0] ?? draft.soundVolume })}
            disabled={!draft.enabled || !draft.soundEnabled}
            aria-label="Intensidade do som"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
