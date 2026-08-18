import { useQuery } from "@tanstack/react-query";
import { DEFAULT_SESSION_TIMEOUT, type ISessionTimeoutSettings } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ISessionOverrideSectionProps {
  /** null = inherit global policy; object = full per-user override snapshot. */
  value: ISessionTimeoutSettings | null;
  onChange: (next: ISessionTimeoutSettings | null) => void;
}

/**
 * Subsection of the user registration form: full override of the session-timeout
 * policy for a single user. When enabled, seeds from the current global setting
 * (falling back to DEFAULT_SESSION_TIMEOUT) and lets the user edit a local copy —
 * the save happens via the parent form's single "Salvar alterações" button.
 */
export function SessionOverrideSection({ value, onChange }: ISessionOverrideSectionProps) {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const settingsProvider = useSettingsProvider();
  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    staleTime: 5 * 60_000,
  });
  // Only seed an override once the global settings have actually loaded —
  // otherwise toggling on would snapshot DEFAULT_SESSION_TIMEOUT instead of the
  // store's real policy and persist it verbatim.
  const settingsReady = settingsQuery.data !== undefined;
  const globalCfg = settingsQuery.data?.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT;

  // Whether a custom override is currently active.
  const custom = value !== null;
  // Resolved config: use the override when active, otherwise show global as preview.
  const cfg = value ?? globalCfg;

  /** Switching on seeds from global; switching off clears the override (null = inherit). */
  const toggleCustom = (on: boolean) => {
    onChange(on ? { ...globalCfg } : null);
  };

  /** Applies a partial update to the active override snapshot. */
  const patch = (p: Partial<ISessionTimeoutSettings>) => {
    onChange({ ...cfg, ...p });
  };

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Tempo de sessão (override)</p>
          <p className="text-xs text-muted-foreground">
            Por padrão, herda a configuração global. Ligue para definir uma
            política própria para este usuário.
          </p>
          {!settingsReady && !custom && (
            <p className="text-xs text-muted-foreground">
              {settingsQuery.isError
                ? "Não foi possível carregar a configuração global — recarregue para criar um override."
                : "Carregando a configuração global…"}
            </p>
          )}
        </div>
        <Switch
          checked={custom}
          onCheckedChange={toggleCustom}
          disabled={!settingsReady && !custom}
          aria-label="Usar configuração própria"
        />
      </div>

      {custom && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ov-enabled">Encerrar por inatividade</Label>
            <Switch
              id="ov-enabled"
              checked={cfg.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ov-idle">Inatividade (min)</Label>
              <Input
                id="ov-idle"
                type="number"
                min={1}
                max={480}
                value={cfg.idleMinutes}
                onChange={(e) => patch({ idleMinutes: Number(e.target.value) })}
                disabled={!cfg.enabled}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-warn">Aviso (s)</Label>
              <Input
                id="ov-warn"
                type="number"
                min={10}
                max={300}
                value={cfg.warningSeconds}
                onChange={(e) => patch({ warningSeconds: Number(e.target.value) })}
                disabled={!cfg.enabled}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ov-sound">Emitir beeps</Label>
            <Switch
              id="ov-sound"
              checked={cfg.soundEnabled}
              onCheckedChange={(v) => patch({ soundEnabled: v })}
              disabled={!cfg.enabled}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            O som do aviso é configurado em{" "}
            <a href="/app/configuracoes/sons" className="underline">
              Sons de notificação
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
